<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useStorefrontStore } from '@/stores/storefront.store'
import { useCartStore } from '@/stores/cart.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { useNotifications } from '@/stores/notifications.store'
import { supabase } from '@/lib/supabase'

import type { Product, Category } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const route = useRoute()
const router = useRouter()
const sf = useStorefrontStore()
const cart = useCartStore()
const notify = useNotifications()

const { store, categories, themeColor } = storeToRefs(sf)

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface ProductWithExtras extends Product {
    product_images: { url: string; is_primary: boolean }[]
    stock_balance?: number
}

/* -------------------------------------------------------------------------- */
/*  Utils                                                                     */
/* -------------------------------------------------------------------------- */

const brl = (v: number | string) =>
    Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/* -------------------------------------------------------------------------- */
/*  Filtros — persistidos na URL para compartilhamento                        */
/* -------------------------------------------------------------------------- */

interface Filters {
    search: string
    categoryId: string | null
    sort: 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'name'
    minPrice: number | null
    maxPrice: number | null
    onlyInStock: boolean
}

const filters = reactive<Filters>({
    search: (route.query.q as string) ?? '',
    categoryId: (route.query.cat as string) ?? null,
    sort: (route.query.sort as Filters['sort']) ?? 'featured',
    minPrice: route.query.min ? Number(route.query.min) : null,
    maxPrice: route.query.max ? Number(route.query.max) : null,
    onlyInStock: route.query.stock === '1',
})

const searchInput = ref(filters.search)
let searchDebounce: number | undefined

watch(searchInput, (v) => {
    window.clearTimeout(searchDebounce)
    searchDebounce = window.setTimeout(() => {
        filters.search = v.trim()
        if (v.trim().length >= 3) {
            sf.trackEvent({
                eventType: 'SEARCH',
                metadata: { query: v.trim() },
            })
        }
    }, 400)
})

/* Sync filtros → URL (sem recarregar a página) */
watch(filters, () => {
    const query: Record<string, string> = {}
    if (filters.search) query.q = filters.search
    if (filters.categoryId) query.cat = filters.categoryId
    if (filters.sort !== 'featured') query.sort = filters.sort
    if (filters.minPrice !== null) query.min = String(filters.minPrice)
    if (filters.maxPrice !== null) query.max = String(filters.maxPrice)
    if (filters.onlyInStock) query.stock = '1'

    router.replace({ query })
}, { deep: true })

const hasActiveFilters = computed(() =>
    !!filters.search
    || !!filters.categoryId
    || filters.sort !== 'featured'
    || filters.minPrice !== null
    || filters.maxPrice !== null
    || filters.onlyInStock,
)

function clearFilters() {
    filters.search = ''
    filters.categoryId = null
    filters.sort = 'featured'
    filters.minPrice = null
    filters.maxPrice = null
    filters.onlyInStock = false
    searchInput.value = ''
}

/* -------------------------------------------------------------------------- */
/*  Paginação                                                                 */
/* -------------------------------------------------------------------------- */

const pageSize = ref(24)
const currentPage = ref(1)
const totalItems = ref(0)

const totalPages = computed(() => Math.ceil(totalItems.value / pageSize.value))

const filtersWatchSource = computed(() => JSON.stringify(filters))

// Reset paginação ao mudar filtros
watch(filters, () => { currentPage.value = 1 }, { deep: true })

/* -------------------------------------------------------------------------- */
/*  Query — produtos                                                          */
/* -------------------------------------------------------------------------- */

const productsQuery = useSupabaseQuery(async () => {
    if (!store.value) return []

    const from = (currentPage.value - 1) * pageSize.value
    const to = from + pageSize.value - 1

    let query = supabase
        .from('products')
        .select(
            `id, name, slug, description, price, is_featured, status,
       product_images(url, is_primary, sort_order)`,
            { count: 'exact' },
        )
        .eq('store_id', store.value.id)
        .eq('status', 'ACTIVE')
        .is('deleted_at', null)

    // Filtros
    if (filters.search) {
        query = query.ilike('name', `%${filters.search}%`)
    }
    if (filters.categoryId) {
        query = query.eq('category_id', filters.categoryId)
    }
    if (filters.minPrice !== null) {
        query = query.gte('price', filters.minPrice)
    }
    if (filters.maxPrice !== null) {
        query = query.lte('price', filters.maxPrice)
    }

    // Ordenação
    switch (filters.sort) {
        case 'featured':
            query = query.order('is_featured', { ascending: false })
                .order('created_at', { ascending: false })
            break
        case 'newest':
            query = query.order('created_at', { ascending: false })
            break
        case 'price_asc':
            query = query.order('price', { ascending: true })
            break
        case 'price_desc':
            query = query.order('price', { ascending: false })
            break
        case 'name':
            query = query.order('name', { ascending: true })
            break
    }

    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) throw error
    totalItems.value = count ?? 0
    return (data ?? []) as unknown as ProductWithExtras[]
}, { watchSource: [store, filtersWatchSource, currentPage] })

const products = computed(() => productsQuery.data.value ?? [])

/* -------------------------------------------------------------------------- */
/*  Query — saldos de estoque (para os produtos exibidos)                     */
/* -------------------------------------------------------------------------- */

const stockMap = ref<Record<string, number>>({})

watch(products, async (list) => {
    if (!list.length) { stockMap.value = {}; return }

    const { data } = await supabase
        .from('product_stock_balances')
        .select('product_id, balance')
        .in('product_id', list.map(p => p.id))

    const map: Record<string, number> = {}
    for (const row of data ?? []) {
        if (row.product_id) map[row.product_id] = row.balance ?? 0
    }
    stockMap.value = map
}, { immediate: true })

/* Filtra por estoque no cliente (só se ativado) */
const displayedProducts = computed(() => {
    if (!filters.onlyInStock) return products.value
    return products.value.filter(p => (stockMap.value[p.id] ?? 0) > 0)
})

/* -------------------------------------------------------------------------- */
/*  Featured products (destaques na home)                                     */
/* -------------------------------------------------------------------------- */

const featuredQuery = useSupabaseQuery(async () => {
    if (!store.value) return []
    const { data } = await supabase
        .from('products')
        .select(`id, name, slug, price,
             product_images(url, is_primary)`)
        .eq('store_id', store.value.id)
        .eq('status', 'ACTIVE')
        .eq('is_featured', true)
        .is('deleted_at', null)
        .limit(6)
    return (data ?? []) as unknown as ProductWithExtras[]
}, { watchSource: [store.value?.id as any] })

const featuredProducts = computed(() => featuredQuery.data.value ?? [])
const showFeaturedRow = computed(() =>
    !hasActiveFilters.value && featuredProducts.value.length >= 3 && currentPage.value === 1,
)

/* -------------------------------------------------------------------------- */
/*  Categorias raiz (para os chips no topo)                                   */
/* -------------------------------------------------------------------------- */

const rootCategories = computed(() =>
    categories.value.filter(c => !c.parent_id),
)

const selectedCategory = computed(() =>
    filters.categoryId
        ? categories.value.find(c => c.id === filters.categoryId)
        : null,
)

/* -------------------------------------------------------------------------- */
/*  Configuração da loja                                                      */
/* -------------------------------------------------------------------------- */

const settings = computed(() => (store.value as any)?.settings ?? {})

const showPrices = computed(() => settings.value.show_prices !== false)
const checkoutViaWhatsapp = computed(() =>
    ['whatsapp', 'both'].includes(settings.value.checkout_via ?? 'both'),
)

/* -------------------------------------------------------------------------- */
/*  Utilities de produto                                                      */
/* -------------------------------------------------------------------------- */

function primaryImage(product: ProductWithExtras): string {
    const primary = product.product_images?.find(i => i.is_primary)
    return primary?.url ?? product.product_images?.[0]?.url ?? ''
}

function stockOf(product: ProductWithExtras): number {
    return stockMap.value[product.id] ?? 0
}

function isOutOfStock(product: ProductWithExtras): boolean {
    return stockOf(product) <= 0
}

function isLowStock(product: ProductWithExtras): boolean {
    const s = stockOf(product)
    return s > 0 && s <= 5
}

/* -------------------------------------------------------------------------- */
/*  Ações                                                                     */
/* -------------------------------------------------------------------------- */

function goToProduct(product: ProductWithExtras) {
    sf.trackEvent({ eventType: 'VIEW_PRODUCT', productId: product.id })
    router.push({
        name: 'storefront-product',
        params: {
            storeSlug: route.params.storeSlug,
            productSlug: product.slug,
        },
    })
}

function handleAddToCart(product: ProductWithExtras, event: Event) {
    event.stopPropagation()
    if (isOutOfStock(product)) return

    cart.addItem({
        product_id: product.id,
        name: product.name,
        sku: (product as any).sku ?? '',
        price: Number(product.price),
        image_url: primaryImage(product) || null,
    })

    notify.success(`${product.name} adicionado ao carrinho`)
}

function selectCategory(categoryId: string | null) {
    filters.categoryId = categoryId
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

function pageDown() {
    currentPage.value--;
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

function pageUp() {
    currentPage.value++;
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

/* -------------------------------------------------------------------------- */
/*  Drawer de filtros avançados                                               */
/* -------------------------------------------------------------------------- */

const filtersDrawerOpen = ref(false)

const priceRange = reactive({
    min: filters.minPrice ?? 0,
    max: filters.maxPrice ?? 500,
})

function applyPriceFilter() {
    filters.minPrice = priceRange.min > 0 ? priceRange.min : null
    filters.maxPrice = priceRange.max > 0 ? priceRange.max : null
    filtersDrawerOpen.value = false
}

/* -------------------------------------------------------------------------- */
/*  Estados derivados                                                         */
/* -------------------------------------------------------------------------- */

const isLoading = computed(() =>
    productsQuery.loading.value && !products.value.length,
)

const isEmpty = computed(() =>
    !productsQuery.loading.value && displayedProducts.value.length === 0,
)

onMounted(() => {
    productsQuery.refresh()
    featuredQuery.refresh()
})
</script>

<template>
    <div class="storefront-page">

        <!-- ==================== HERO / BANNER ==================== -->
        <section v-if="!hasActiveFilters" class="hero-section" :style="{ '--theme-color': themeColor }">
            <div class="hero-content">
                <div v-if="store?.logo_url" class="hero-logo">
                    <img :src="store.logo_url" :alt="store.name">
                </div>

                <h1 class="hero-title">
                    {{ store?.name }}
                </h1>

                <p v-if="settings.hero_subtitle" class="hero-subtitle">
                    {{ settings.hero_subtitle }}
                </p>

                <!-- Categorias como chips visuais -->
                <div v-if="rootCategories.length" class="hero-categories">
                    <button class="cat-chip" :class="{ active: !filters.categoryId }" @click="selectCategory(null)">
                        <v-icon size="16">mdi-view-grid-outline</v-icon>
                        <span>Todos</span>
                    </button>
                    <button v-for="cat in rootCategories" :key="cat.id" class="cat-chip"
                        :class="{ active: filters.categoryId === cat.id }" @click="selectCategory(cat.id)">
                        <v-icon size="16">mdi-tag-outline</v-icon>
                        <span>{{ cat.name }}</span>
                    </button>
                </div>
            </div>
        </section>

        <!-- ==================== BUSCA + FILTROS ==================== -->
        <section class="search-section">
            <div class="search-container">
                <v-text-field v-model="searchInput" prepend-inner-icon="mdi-magnify" placeholder="O que você procura?"
                    variant="outlined" density="comfortable" hide-details rounded="pill" clearable
                    class="search-input" />

                <div class="filter-buttons">
                    <v-select v-model="filters.sort" :items="[
                        { title: '✨ Destaques', value: 'featured' },
                        { title: '🆕 Mais recentes', value: 'newest' },
                        { title: '💰 Menor preço', value: 'price_asc' },
                        { title: '💎 Maior preço', value: 'price_desc' },
                        { title: '🔤 Nome (A-Z)', value: 'name' },
                    ]" variant="outlined" density="comfortable" hide-details rounded="pill" class="sort-select" />

                    <v-btn variant="outlined" rounded="pill" prepend-icon="mdi-tune-variant" class="text-none"
                        @click="filtersDrawerOpen = true">
                        <span class="hidden-sm-and-down">Filtros</span>
                        <v-badge v-if="filters.minPrice !== null || filters.maxPrice !== null || filters.onlyInStock"
                            color="primary" dot inline />
                    </v-btn>
                </div>
            </div>

            <!-- Chips de filtros ativos -->
            <div v-if="hasActiveFilters" class="active-filters">
                <v-chip v-if="filters.search" closable size="small" variant="tonal"
                    @click:close="filters.search = ''; searchInput = ''">
                    <v-icon start size="14">mdi-magnify</v-icon>
                    "{{ filters.search }}"
                </v-chip>
                <v-chip v-if="selectedCategory" closable size="small" variant="tonal" color="primary"
                    @click:close="filters.categoryId = null">
                    <v-icon start size="14">mdi-tag</v-icon>
                    {{ selectedCategory.name }}
                </v-chip>
                <v-chip v-if="filters.minPrice !== null || filters.maxPrice !== null" closable size="small"
                    variant="tonal" @click:close="filters.minPrice = null; filters.maxPrice = null">
                    <v-icon start size="14">mdi-currency-brl</v-icon>
                    {{ filters.minPrice !== null ? brl(filters.minPrice) : 'R$ 0' }}
                    — {{ filters.maxPrice !== null ? brl(filters.maxPrice) : '∞' }}
                </v-chip>
                <v-chip v-if="filters.onlyInStock" closable size="small" variant="tonal" color="success"
                    @click:close="filters.onlyInStock = false">
                    <v-icon start size="14">mdi-package-check</v-icon>
                    Só disponíveis
                </v-chip>

                <v-btn variant="text" size="small" class="text-none" prepend-icon="mdi-close" @click="clearFilters">
                    Limpar tudo
                </v-btn>
            </div>
        </section>

        <!-- ==================== FEATURED (só na home sem filtros) ==================== -->
        <section v-if="showFeaturedRow" class="featured-section">
            <div class="section-header">
                <div>
                    <h2 class="section-title">
                        <span class="section-emoji">⭐</span>
                        Destaques
                    </h2>
                    <p class="section-subtitle">Selecionamos os melhores para você</p>
                </div>
            </div>

            <div class="featured-scroll">
                <article v-for="p in featuredProducts" :key="'feat-' + p.id" class="featured-card"
                    @click="goToProduct(p)">
                    <div class="featured-image">
                        <img v-if="primaryImage(p)" :src="primaryImage(p)" :alt="p.name" loading="lazy">
                        <div v-else class="image-placeholder">
                            <v-icon size="40" color="grey-lighten-1">mdi-image-off-outline</v-icon>
                        </div>
                        <div class="featured-badge">
                            <v-icon size="14">mdi-star</v-icon>
                            Destaque
                        </div>
                    </div>
                    <div class="featured-body">
                        <h3 class="featured-name">{{ p.name }}</h3>
                        <div v-if="showPrices" class="featured-price">
                            {{ brl(p.price) }}
                        </div>
                    </div>
                </article>
            </div>
        </section>

        <!-- ==================== GRID DE PRODUTOS ==================== -->
        <section class="products-section">
            <div class="section-header">
                <div>
                    <h2 class="section-title">
                        <span v-if="selectedCategory">{{ selectedCategory.name }}</span>
                        <span v-else-if="filters.search">Resultados</span>
                        <span v-else>Todos os produtos</span>
                    </h2>
                    <p class="section-subtitle">
                        {{ totalItems }} {{ totalItems === 1 ? 'produto encontrado' : 'produtos encontrados' }}
                    </p>
                </div>
            </div>

            <!-- Loading skeletons -->
            <div v-if="isLoading" class="products-grid">
                <div v-for="i in 12" :key="'sk-' + i" class="product-card skeleton">
                    <v-skeleton-loader type="image" class="skeleton-image" />
                    <v-skeleton-loader type="text" class="mt-2" />
                    <v-skeleton-loader type="text" width="60%" />
                </div>
            </div>

            <!-- Empty state -->
            <div v-else-if="isEmpty" class="empty-state">
                <v-icon size="80" color="grey-lighten-1">mdi-package-variant-closed</v-icon>
                <h3 class="text-h5 font-weight-bold mt-4 mb-2">
                    {{ hasActiveFilters ? 'Nenhum produto encontrado' : 'Vitrine ainda vazia' }}
                </h3>
                <p class="text-body-2 text-medium-emphasis mb-6">
                    {{ hasActiveFilters
                        ? 'Tente ajustar os filtros ou buscar outra coisa.'
                        : 'Volte em breve — novos produtos aparecerão aqui.' }}
                </p>
                <v-btn v-if="hasActiveFilters" color="primary" variant="tonal" rounded="pill" class="text-none"
                    @click="clearFilters">
                    Limpar filtros
                </v-btn>
            </div>

            <!-- Grid real -->
            <div v-else class="products-grid">
                <article v-for="product in displayedProducts" :key="product.id" class="product-card"
                    :class="{ 'is-out': isOutOfStock(product) }" @click="goToProduct(product)">
                    <div class="product-image">
                        <img v-if="primaryImage(product)" :src="primaryImage(product)" :alt="product.name"
                            loading="lazy">
                        <div v-else class="image-placeholder">
                            <v-icon size="40" color="grey-lighten-1">mdi-image-off-outline</v-icon>
                        </div>

                        <!-- Overlays -->
                        <div v-if="product.is_featured && !isOutOfStock(product)" class="badge badge-featured">
                            <v-icon size="12">mdi-star</v-icon> Destaque
                        </div>

                        <div v-if="isLowStock(product)" class="badge badge-low">
                            <v-icon size="12">mdi-fire</v-icon> Últimas unidades
                        </div>

                        <div v-if="isOutOfStock(product)" class="badge badge-out">
                            Esgotado
                        </div>

                        <!-- Botão rápido de add to cart no hover -->
                        <button v-if="!isOutOfStock(product)" class="quick-add" type="button"
                            @click="handleAddToCart(product, $event)">
                            <v-icon size="20">mdi-cart-plus</v-icon>
                        </button>
                    </div>

                    <div class="product-body">
                        <h3 class="product-name">{{ product.name }}</h3>
                        <p v-if="product.description" class="product-desc">
                            {{ product.description }}
                        </p>

                        <div class="product-footer">
                            <div v-if="showPrices" class="product-price">
                                {{ brl(product.price) }}
                            </div>
                            <div v-else class="product-price-hidden">
                                <v-icon size="14">mdi-whatsapp</v-icon>
                                Consulte
                            </div>
                        </div>
                    </div>
                </article>
            </div>

            <!-- Paginação -->
            <div v-if="totalPages > 1" class="pagination">
                <v-btn icon="mdi-chevron-left" variant="tonal" :disabled="currentPage === 1" @click="pageDown" />
                <span class="pagination-info">
                    Página <strong>{{ currentPage }}</strong> de <strong>{{ totalPages }}</strong>
                </span>
                <v-btn icon="mdi-chevron-right" variant="tonal" :disabled="currentPage === totalPages"
                    @click="pageUp" />
            </div>
        </section>

        <!-- ==================== DRAWER DE FILTROS AVANÇADOS ==================== -->
        <v-navigation-drawer v-model="filtersDrawerOpen" location="right" temporary width="360" class="filters-drawer">
            <div class="drawer-header">
                <h3 class="text-h6 font-weight-bold">Filtros</h3>
                <v-btn icon="mdi-close" variant="text" size="small" @click="filtersDrawerOpen = false" />
            </div>

            <v-divider />

            <div class="drawer-body">
                <!-- Faixa de preço -->
                <div class="filter-section">
                    <div class="filter-title">Faixa de preço</div>
                    <div class="d-flex ga-2 mt-2">
                        <v-text-field v-model.number="priceRange.min" prefix="R$" type="number" min="0"
                            variant="outlined" density="compact" hide-details label="Mínimo" />
                        <v-text-field v-model.number="priceRange.max" prefix="R$" type="number" min="0"
                            variant="outlined" density="compact" hide-details label="Máximo" />
                    </div>
                </div>

                <v-divider class="my-4" />

                <!-- Disponibilidade -->
                <div class="filter-section">
                    <v-switch v-model="filters.onlyInStock" color="primary" hide-details density="compact">
                        <template #label>
                            <div>
                                <div class="text-body-2 font-weight-medium">
                                    Só produtos disponíveis
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                    Esconde os que estão esgotados
                                </div>
                            </div>
                        </template>
                    </v-switch>
                </div>

                <v-divider class="my-4" />

                <!-- Categorias completas -->
                <div v-if="categories.length" class="filter-section">
                    <div class="filter-title">Categorias</div>
                    <div class="category-list mt-2">
                        <button class="cat-item" :class="{ active: !filters.categoryId }"
                            @click="filters.categoryId = null">
                            <v-icon size="16">mdi-view-grid-outline</v-icon>
                            Todas
                        </button>
                        <button v-for="cat in categories.filter(c => !c.parent_id)" :key="cat.id" class="cat-item"
                            :class="{ active: filters.categoryId === cat.id }" @click="filters.categoryId = cat.id">
                            <v-icon size="16">mdi-tag-outline</v-icon>
                            {{ cat.name }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="drawer-footer">
                <v-btn variant="text" class="text-none" @click="clearFilters(); filtersDrawerOpen = false">
                    Limpar
                </v-btn>
                <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6" @click="applyPriceFilter">
                    Aplicar
                </v-btn>
            </div>
        </v-navigation-drawer>

    </div>
</template>

<style scoped>
.storefront-page {
    display: flex;
    flex-direction: column;
    gap: 32px;
}

/* ============================================================ */
/*  Hero                                                        */
/* ============================================================ */
.hero-section {
    --theme-color: rgb(var(--v-theme-primary));
    background: linear-gradient(135deg,
            color-mix(in srgb, var(--theme-color) 8%, transparent),
            color-mix(in srgb, var(--theme-color) 3%, transparent));
    border-radius: 20px;
    padding: 40px 24px;
    text-align: center;
}

.hero-content {
    max-width: 700px;
    margin: 0 auto;
}

.hero-logo {
    width: 80px;
    height: 80px;
    margin: 0 auto 16px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    background: rgb(var(--v-theme-surface));
}

.hero-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.hero-title {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 900;
    letter-spacing: -0.02em;
    color: rgb(var(--v-theme-on-surface));
    margin: 0 0 8px;
}

.hero-subtitle {
    font-size: 1rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
    margin: 0 0 24px;
}

.hero-categories {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 24px;
}

.cat-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 100px;
    background: rgb(var(--v-theme-surface));
    border: 1px solid rgba(var(--v-border-color), 0.15);
    font-size: 0.875rem;
    font-weight: 600;
    color: rgb(var(--v-theme-on-surface));
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
}

.cat-chip:hover {
    border-color: var(--theme-color);
    transform: translateY(-1px);
}

.cat-chip.active {
    background: var(--theme-color);
    color: white;
    border-color: var(--theme-color);
}

/* ============================================================ */
/*  Busca / Filtros                                             */
/* ============================================================ */
.search-container {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
}

.search-input {
    flex: 1;
    min-width: 240px;
}

.filter-buttons {
    display: flex;
    gap: 8px;
    align-items: center;
}

.sort-select {
    min-width: 200px;
}

.active-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
}

/* ============================================================ */
/*  Section header                                              */
/* ============================================================ */
.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 20px;
}

.section-title {
    font-size: 1.5rem;
    font-weight: 800;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgb(var(--v-theme-on-surface));
}

.section-emoji {
    font-size: 1.75rem;
}

.section-subtitle {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin: 4px 0 0;
}

/* ============================================================ */
/*  Featured (carrossel horizontal)                             */
/* ============================================================ */
.featured-scroll {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding-bottom: 8px;
    scrollbar-width: thin;
}

.featured-card {
    flex: 0 0 220px;
    scroll-snap-align: start;
    background: rgb(var(--v-theme-surface));
    border-radius: 16px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid rgba(var(--v-border-color), 0.08);
    transition: all 0.2s ease;
}

.featured-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
}

.featured-image {
    position: relative;
    aspect-ratio: 1;
    background: rgba(var(--v-theme-surface-variant), 0.4);
    overflow: hidden;
}

.featured-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

.featured-card:hover .featured-image img {
    transform: scale(1.05);
}

.featured-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    background: linear-gradient(135deg, #f59e0b, #f97316);
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
}

.featured-body {
    padding: 12px;
}

.featured-name {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 4px;
    color: rgb(var(--v-theme-on-surface));
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    min-height: 2.6em;
}

.featured-price {
    font-size: 1.125rem;
    font-weight: 800;
    color: var(--theme-color, rgb(var(--v-theme-primary)));
}

/* ============================================================ */
/*  Grid de produtos                                            */
/* ============================================================ */
.products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 20px;
}

@media (max-width: 599px) {
    .products-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }
}

.product-card {
    background: rgb(var(--v-theme-surface));
    border-radius: 16px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid rgba(var(--v-border-color), 0.08);
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
}

.product-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
    border-color: rgba(var(--v-theme-primary), 0.25);
}

.product-card.is-out {
    opacity: 0.6;
}

.product-card.is-out:hover {
    transform: none;
}

.product-card.skeleton {
    padding: 12px;
}

.product-image {
    position: relative;
    aspect-ratio: 1;
    background: rgba(var(--v-theme-surface-variant), 0.4);
    overflow: hidden;
}

.product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

.product-card:hover .product-image img {
    transform: scale(1.05);
}

.image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.badge {
    position: absolute;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
}

.badge-featured {
    top: 8px;
    left: 8px;
    background: linear-gradient(135deg, #f59e0b, #f97316);
    color: white;
}

.badge-low {
    top: 8px;
    left: 8px;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;
}

.badge-out {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.75);
    color: white;
    font-size: 0.875rem;
    padding: 8px 16px;
    border-radius: 100px;
    backdrop-filter: blur(4px);
}

.quick-add {
    position: absolute;
    bottom: 8px;
    right: 8px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgb(var(--v-theme-primary));
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: translateY(8px);
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.product-card:hover .quick-add {
    opacity: 1;
    transform: translateY(0);
}

.quick-add:hover {
    transform: scale(1.1);
    background: color-mix(in srgb, rgb(var(--v-theme-primary)) 90%, black);
}

.quick-add:active {
    transform: scale(0.95);
}

.product-body {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
}

.product-name {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
    color: rgb(var(--v-theme-on-surface));
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    min-height: 2.6em;
    line-height: 1.3;
}

.product-desc {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.product-footer {
    margin-top: auto;
    padding-top: 8px;
}

.product-price {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--theme-color, rgb(var(--v-theme-primary)));
}

.product-price-hidden {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgb(var(--v-theme-success));
    font-weight: 600;
    font-size: 0.875rem;
}

/* ============================================================ */
/*  Empty                                                       */
/* ============================================================ */
.empty-state {
    text-align: center;
    padding: 60px 20px;
}

/* ============================================================ */
/*  Pagination                                                  */
/* ============================================================ */
.pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 40px;
}

.pagination-info {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
}

/* ============================================================ */
/*  Drawer                                                      */
/* ============================================================ */
.drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
}

.drawer-body {
    padding: 16px 20px;
    overflow-y: auto;
    flex: 1;
}

.drawer-footer {
    padding: 16px 20px;
    border-top: 1px solid rgba(var(--v-border-color), 0.08);
    display: flex;
    justify-content: space-between;
    gap: 8px;
}

.filter-section {
    margin-bottom: 8px;
}

.filter-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.category-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.cat-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: transparent;
    border: 1px solid transparent;
    font-size: 0.875rem;
    font-weight: 500;
    color: rgb(var(--v-theme-on-surface));
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    font-family: inherit;
}

.cat-item:hover {
    background: rgba(var(--v-theme-primary), 0.05);
}

.cat-item.active {
    background: rgba(var(--v-theme-primary), 0.1);
    color: rgb(var(--v-theme-primary));
    font-weight: 700;
}
</style>
