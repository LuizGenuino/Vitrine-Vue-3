<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDisplay } from 'vuetify'

import { useStorefrontStore } from '@/stores/storefront.store'
import { useCartStore } from '@/stores/cart.store'
import { useNotifications } from '@/stores/notifications.store'
import { supabase } from '@/lib/supabase'

import EmptyState from '@/components/base/EmptyState.vue'

import type { Product, Category } from '@/types/models'

/* ============================================================================
   Setup
============================================================================ */
const route = useRoute()
const router = useRouter()
const sf = useStorefrontStore()
const cart = useCartStore()
const notify = useNotifications()
const display = useDisplay()

const { store, themeColor, categories } = storeToRefs(sf)

const brl = (v: number | string | null | undefined) =>
    Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/* ============================================================================
   Estado da URL sincronizado (deep-linkable)
============================================================================ */
type SortKey = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'best_selling' | 'name_asc'

interface SearchState {
    q: string
    categoryIds: string[]
    minPrice: number | null
    maxPrice: number | null
    inStock: boolean
    onSale: boolean
    attributes: Record<string, string[]>
    sort: SortKey
    page: number
}

const state = reactive<SearchState>({
    q: '',
    categoryIds: [],
    minPrice: null,
    maxPrice: null,
    inStock: false,
    onSale: false,
    attributes: {},
    sort: 'relevance',
    page: 1,
})

const PAGE_SIZE = 24
const searchInput = ref('')
const drawerFilters = ref(false)
const isDesktop = computed(() => display.mdAndUp.value)

/* Hydrata state a partir da query string */
function hydrateFromQuery() {
    const q = route.query
    state.q = (q.q as string) ?? ''
    state.categoryIds = q.cat ? (Array.isArray(q.cat) ? q.cat : [q.cat]) as string[] : []
    state.minPrice = q.min ? Number(q.min) : null
    state.maxPrice = q.max ? Number(q.max) : null
    state.inStock = q.stock === '1'
    state.onSale = q.sale === '1'
    state.sort = ((q.sort as SortKey) ?? 'relevance')
    state.page = q.page ? Number(q.page) : 1
    state.attributes = q.attr ? JSON.parse(String(q.attr)) : {}
    searchInput.value = state.q
}

/* Espelha state → URL (sem reload) */
function syncQuery() {
    const query: Record<string, any> = {}
    if (state.q) query.q = state.q
    if (state.categoryIds.length) query.cat = state.categoryIds
    if (state.minPrice != null) query.min = state.minPrice
    if (state.maxPrice != null) query.max = state.maxPrice
    if (state.inStock) query.stock = '1'
    if (state.onSale) query.sale = '1'
    if (state.sort !== 'relevance') query.sort = state.sort
    if (state.page > 1) query.page = state.page
    if (Object.keys(state.attributes).length) query.attr = JSON.stringify(state.attributes)

    router.replace({ query })
}

/* ============================================================================
   Resultados
============================================================================ */
interface ProductRow extends Product {
    product_images: { url: string; sort_order: number }[]
    category: Pick<Category, 'id' | 'name' | 'slug'> | null
    stock_balance: number
    compare_at_price?: number
}

const results = ref<ProductRow[]>([])
const totalCount = ref(0)
const loading = ref(false)
const searchTook = ref(0)

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))

/* ============================================================================
   Facets (contagens agregadas para o resultado da busca)
============================================================================ */
interface CategoryFacet { id: string; name: string; count: number }
interface AttributeFacet { name: string; values: { value: string; count: number }[] }

const facets = ref<{
    categories: CategoryFacet[]
    attributes: AttributeFacet[]
    priceMin: number
    priceMax: number
}>({ categories: [], attributes: [], priceMin: 0, priceMax: 0 })

/* ============================================================================
   Sugestões (autocomplete)
============================================================================ */
const suggestions = ref<string[]>([])
const showSuggestions = ref(false)
let suggestionTimer: number | undefined

async function loadSuggestions(term: string) {
    if (!store.value || term.trim().length < 2) {
        suggestions.value = []
        return
    }

    const { data } = await supabase
        .from('products')
        .select('name')
        .eq('status', 'ACTIVE')
        .is('deleted_at', null)
        .ilike('name', `%${term}%`)
        .limit(6)

    suggestions.value = (data ?? []).map(r => r.name)
}

watch(searchInput, (v) => {
    window.clearTimeout(suggestionTimer)
    suggestionTimer = window.setTimeout(() => loadSuggestions(v), 250)
})

/* ============================================================================
   Busca principal (RPC search_products) — usa índice GIN + trigram
============================================================================ */
async function runSearch() {
    if (!store.value) return

    loading.value = true
    const t0 = performance.now()

    try {
        const from = (state.page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let query = supabase
            .from('products')
            .select(
                `id, name, slug, description, price, compare_at_price, sku, is_featured, status,
         category_id,
         category:categories(id, name, slug),
         product_images(url, sort_order),
         stock_balance:product_stock_balances(balance)`,
                { count: 'exact' },
            )
            .eq('status', 'ACTIVE')
            .is('deleted_at', null)

        /* Full-text: prioriza search_vector, fallback trigram */
        if (state.q.trim()) {
            const term = state.q.trim()
            // Se sua tabela tiver `search_vector tsvector` + gin index:
            // query = query.textSearch('search_vector', term, { type: 'websearch', config: 'portuguese' })
            // Fallback com trigram + ilike (funciona sem search_vector):
            query = query.or(
                `name.ilike.%${term}%,description.ilike.%${term}%,sku.ilike.%${term}%`,
            )
        }

        /* Categorias */
        if (state.categoryIds.length) {
            query = query.in('category_id', state.categoryIds)
        }

        /* Preço */
        if (state.minPrice != null) query = query.gte('price', state.minPrice)
        if (state.maxPrice != null) query = query.lte('price', state.maxPrice)

        /* Promoção */
        if (state.onSale) {
            query = query.not('compare_at_price', 'is', null).gt('compare_at_price', 0)
        }

        /* Ordenação */
        switch (state.sort) {
            case 'price_asc': query = query.order('price', { ascending: true }); break
            case 'price_desc': query = query.order('price', { ascending: false }); break
            case 'newest': query = query.order('created_at', { ascending: false }); break
            case 'best_selling': query = query.order('sales_count', { ascending: false, nullsFirst: false }); break
            case 'name_asc': query = query.order('name', { ascending: true }); break
            default:
                /* Relevância: destaques + mais vendidos como proxy */
                query = query
                    .order('is_featured', { ascending: false })
                    .order('sales_count', { ascending: false, nullsFirst: false })
        }

        query = query.range(from, to)

        const { data, error, count } = await query
        if (error) throw error

        let rows = ((data ?? []) as unknown) as ProductRow[]

        /* Filtro em memória: em estoque (view product_stock_balances) */
        if (state.inStock) {
            rows = rows.filter(r => {
                const bal = Array.isArray(r.stock_balance)
                    ? (r.stock_balance[0] as any)?.balance ?? 0
                    : (r.stock_balance as any)?.balance ?? 0
                return Number(bal) > 0
            })
        }

        /* Filtro em memória: atributos */
        if (Object.keys(state.attributes).length) {
            const ids = rows.map(r => r.id)
            if (ids.length) {
                const { data: attrRows } = await supabase
                    .from('product_attributes')
                    .select('product_id, name, value')
                    .in('product_id', ids)

                const attrMap = new Map<string, Map<string, string>>()
                for (const a of attrRows ?? []) {
                    if (!attrMap.has(a.product_id)) attrMap.set(a.product_id, new Map())
                    attrMap.get(a.product_id)!.set(a.name, a.value)
                }

                rows = rows.filter(r => {
                    const productAttrs = attrMap.get(r.id) ?? new Map()
                    for (const [key, values] of Object.entries(state.attributes)) {
                        const productValue = productAttrs.get(key)
                        if (!productValue || !values.includes(productValue)) return false
                    }
                    return true
                })
            }
        }

        results.value = rows
        totalCount.value = count ?? rows.length

        /* Facets em paralelo */
        await loadFacets()

        /* Registra evento analítico */
        if (state.q.trim() && store.value) {
            sf.trackEvent({
                eventType: 'SEARCH',
                metadata: {
                    query: state.q,
                    results: totalCount.value,
                    filters: {
                        categories: state.categoryIds,
                        price: [state.minPrice, state.maxPrice],
                        attributes: state.attributes,
                    },
                }

            })
        }
    } catch (e: any) {
        console.error('[Search] error', e)
        notify.error('Erro ao buscar. Tente novamente.')
        results.value = []
        totalCount.value = 0
    } finally {
        loading.value = false
        searchTook.value = Math.round(performance.now() - t0)
    }
}

/* ============================================================================
   Facets — contagens agregadas ignorando o filtro correspondente
============================================================================ */
async function loadFacets() {
    if (!store.value) return

    /* Facet: categorias (ignora filtro de categoria atual) */
    const term = state.q.trim()
    let catQuery = supabase
        .from('products')
        .select('category_id, price, categories!inner(id, name)')
        .eq('status', 'ACTIVE')
        .is('deleted_at', null)

    if (term) {
        catQuery = catQuery.or(
            `name.ilike.%${term}%,description.ilike.%${term}%,sku.ilike.%${term}%`,
        )
    }
    if (state.minPrice != null) catQuery = catQuery.gte('price', state.minPrice)
    if (state.maxPrice != null) catQuery = catQuery.lte('price', state.maxPrice)

    const { data: catData } = await catQuery

    const catMap = new Map<string, CategoryFacet>()
    let minP = Infinity
    let maxP = 0

    for (const row of catData ?? []) {
        const cat = (row as any).categories
        if (cat && !catMap.has(cat.id)) {
            catMap.set(cat.id, { id: cat.id, name: cat.name, count: 0 })
        }
        if (cat) catMap.get(cat.id)!.count++
        const p = Number(row.price)
        if (p < minP) minP = p
        if (p > maxP) maxP = p
    }

    facets.value.categories = Array.from(catMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
    facets.value.priceMin = minP === Infinity ? 0 : Math.floor(minP)
    facets.value.priceMax = Math.ceil(maxP)

    /* Facet: atributos (top 5 chaves, top 8 valores) */
    const productIds = results.value.map(r => r.id)
    if (productIds.length) {
        const { data: attrData } = await supabase
            .from('product_attributes')
            .select('name, value')
            .in('product_id', productIds)

        const attrMap = new Map<string, Map<string, number>>()
        for (const a of attrData ?? []) {
            if (!attrMap.has(a.name)) attrMap.set(a.name, new Map())
            const valMap = attrMap.get(a.name)!
            valMap.set(a.value, (valMap.get(a.value) ?? 0) + 1)
        }

        facets.value.attributes = Array.from(attrMap.entries())
            .map(([name, valMap]) => ({
                name,
                values: Array.from(valMap.entries())
                    .map(([value, count]) => ({ value, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8),
            }))
            .sort((a, b) => b.values.length - a.values.length)
            .slice(0, 5)
    } else {
        facets.value.attributes = []
    }
}

/* ============================================================================
   Ações
============================================================================ */
function submitSearch() {
    state.q = searchInput.value.trim()
    state.page = 1
    showSuggestions.value = false
    syncQuery()
    runSearch()
}

function applySuggestion(s: string) {
    searchInput.value = s
    submitSearch()
}

function toggleCategory(id: string) {
    const idx = state.categoryIds.indexOf(id)
    if (idx >= 0) state.categoryIds.splice(idx, 1)
    else state.categoryIds.push(id)
    state.page = 1
    syncQuery()
    runSearch()
}

function toggleAttribute(name: string, value: string) {
    const arr = state.attributes[name] ?? []
    const idx = arr.indexOf(value)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(value)
    if (arr.length) state.attributes[name] = arr
    else delete state.attributes[name]
    state.page = 1
    syncQuery()
    runSearch()
}

function applyPriceRange(min: number | null, max: number | null) {
    state.minPrice = min
    state.maxPrice = max
    state.page = 1
    syncQuery()
    runSearch()
}

function clearAllFilters() {
    state.categoryIds = []
    state.minPrice = null
    state.maxPrice = null
    state.inStock = false
    state.onSale = false
    state.attributes = {}
    state.page = 1
    syncQuery()
    runSearch()
}

function changePage(p: number) {
    state.page = p
    syncQuery()
    runSearch()
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goToProduct(product: ProductRow) {
    router.push({
        name: 'product',
        params: { storeSlug: route.params.storeSlug, productSlug: product.slug },
    })
}

async function quickAdd(product: ProductRow) {
    const primaryImage = product.product_images
        ?.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))?.[0]?.url ?? null

    cart.addItem({
        product_id: product.id,
        name: product.name,
        slug: product.slug,
        price: Number(product.price),
        image_url: primaryImage,
        sku: product.sku
    })
    notify.success(`${product.name} adicionado ao carrinho`)
}

/* ============================================================================
   Filtros ativos (chips no topo)
============================================================================ */
const activeFilterChips = computed(() => {
    const chips: { label: string; onRemove: () => void }[] = []

    for (const id of state.categoryIds) {
        const cat = categories.value?.find(c => c.id === id)
        if (cat) chips.push({ label: cat.name, onRemove: () => toggleCategory(id) })
    }
    if (state.minPrice != null || state.maxPrice != null) {
        chips.push({
            label: `${brl(state.minPrice ?? 0)} — ${state.maxPrice ? brl(state.maxPrice) : '∞'}`,
            onRemove: () => applyPriceRange(null, null),
        })
    }
    if (state.inStock) chips.push({ label: 'Em estoque', onRemove: () => { state.inStock = false; syncQuery(); runSearch() } })
    if (state.onSale) chips.push({ label: 'Em promoção', onRemove: () => { state.onSale = false; syncQuery(); runSearch() } })

    for (const [key, values] of Object.entries(state.attributes)) {
        for (const v of values) {
            chips.push({ label: `${key}: ${v}`, onRemove: () => toggleAttribute(key, v) })
        }
    }

    return chips
})

const hasActiveFilters = computed(() => activeFilterChips.value.length > 0)


function debouncer() {
    setTimeout(() => showSuggestions.value = false, 200)
}

/* ============================================================================
   Watch route (usuário navega para nova busca)
============================================================================ */
watch(() => route.query.q, () => {
    hydrateFromQuery()
    runSearch()
})

/* ============================================================================
   Lifecycle
============================================================================ */
onMounted(async () => {
    hydrateFromQuery()
    await runSearch()
})

onUnmounted(() => {
    if (suggestionTimer) window.clearTimeout(suggestionTimer)
})

/* ============================================================================
   Helpers de UI
============================================================================ */
function productImage(p: ProductRow): string | null {
    const first = p.product_images
        ?.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))?.[0]
    return first?.url ?? null
}

function productStock(p: ProductRow): number {
    const bal = Array.isArray(p.stock_balance)
        ? (p.stock_balance[0] as any)?.balance ?? 0
        : (p.stock_balance as any)?.balance ?? 0
    return Number(bal)
}

function discountPct(p: ProductRow): number | null {
    if (!p.compare_at_price || Number(p.compare_at_price) <= Number(p.price)) return null
    return Math.round((1 - Number(p.price) / Number(p.compare_at_price)) * 100)
}
</script>

<template>
    <div class="search-page">
        <!-- ============ Barra de busca ============ -->
        <section class="search-hero" :style="{ '--theme-rgb': `var(--v-theme-${themeColor})` }">
            <v-container max-width="1200" class="py-6 py-md-8">
                <div class="d-flex align-center ga-2 mb-2">
                    <v-btn icon="mdi-arrow-left" variant="text" size="small"
                        @click="router.push({ name: 'storefront', params: { storeSlug: route.params.storeSlug } })" />
                    <div class="text-caption text-medium-emphasis">
                        {{ store?.name }} · <strong>Buscar</strong>
                    </div>
                </div>

                <div class="search-bar-wrapper">
                    <v-text-field v-model="searchInput" placeholder="O que você está procurando?" variant="solo" flat
                        rounded="pill" hide-details density="comfortable" bg-color="surface" autofocus
                        class="search-bar" @keyup.enter="submitSearch" @focus="showSuggestions = true"
                        @blur="debouncer">
                        <template #prepend-inner>
                            <v-icon color="medium-emphasis">mdi-magnify</v-icon>
                        </template>
                        <template #append-inner>
                            <v-btn v-if="searchInput" icon="mdi-close" variant="text" size="small"
                                @click="searchInput = ''; submitSearch()" />
                            <v-btn :color="themeColor" variant="flat" rounded="pill" class="text-none ml-2"
                                @click="submitSearch">
                                Buscar
                            </v-btn>
                        </template>
                    </v-text-field>

                    <!-- Sugestões flutuantes -->
                    <v-fade-transition>
                        <div v-if="showSuggestions && suggestions.length && searchInput" class="suggestions-panel">
                            <div v-for="s in suggestions" :key="s" class="suggestion-item"
                                @mousedown.prevent="applySuggestion(s)">
                                <v-icon size="16" color="medium-emphasis">mdi-magnify</v-icon>
                                <span class="text-body-2">{{ s }}</span>
                            </div>
                        </div>
                    </v-fade-transition>
                </div>

                <!-- Header de resultados -->
                <div class="d-flex align-center justify-space-between mt-4 flex-wrap ga-2">
                    <div class="text-body-2 text-medium-emphasis">
                        <template v-if="loading">Buscando...</template>
                        <template v-else-if="state.q">
                            <strong>{{ totalCount }}</strong> resultado(s) para
                            <strong>"{{ state.q }}"</strong>
                            <span v-if="searchTook" class="text-caption">· {{ searchTook }}ms</span>
                        </template>
                        <template v-else>
                            <strong>{{ totalCount }}</strong> produto(s) na loja
                        </template>
                    </div>

                    <div class="d-flex align-center ga-2">
                        <v-btn v-if="!isDesktop" variant="tonal" size="small" class="text-none"
                            prepend-icon="mdi-filter-variant" @click="drawerFilters = true">
                            Filtros
                            <v-badge v-if="hasActiveFilters" :content="activeFilterChips.length" color="error" inline
                                class="ml-1" />
                        </v-btn>

                        <v-select v-model="state.sort" :items="[
                            { title: 'Relevância', value: 'relevance' },
                            { title: 'Menor preço', value: 'price_asc' },
                            { title: 'Maior preço', value: 'price_desc' },
                            { title: 'Mais vendidos', value: 'best_selling' },
                            { title: 'Mais recentes', value: 'newest' },
                            { title: 'Nome A–Z', value: 'name_asc' },
                        ]" density="compact" variant="outlined" hide-details rounded="pill" class="sort-select"
                            style="max-width: 200px"
                            @update:model-value="() => { state.page = 1; syncQuery(); runSearch() }" />
                    </div>
                </div>

                <!-- Chips de filtros ativos -->
                <div v-if="hasActiveFilters" class="d-flex flex-wrap ga-2 mt-3">
                    <v-chip v-for="(chip, i) in activeFilterChips" :key="i" closable :color="themeColor" variant="tonal"
                        size="small" @click:close="chip.onRemove()">
                        {{ chip.label }}
                    </v-chip>
                    <v-btn variant="text" size="x-small" color="error" class="text-none" @click="clearAllFilters">
                        Limpar tudo
                    </v-btn>
                </div>
            </v-container>
        </section>

        <!-- ============ Grid principal (sidebar + resultados) ============ -->
        <v-container max-width="1400" class="py-6">
            <div class="d-flex ga-6">
                <!-- ============ Sidebar de filtros (desktop) ============ -->
                <aside v-if="isDesktop" class="filters-sidebar">
                    <v-card rounded="xl" flat border class="pa-5">
                        <!-- Disponibilidade -->
                        <div class="filter-group">
                            <div class="filter-title">Disponibilidade</div>
                            <v-checkbox v-model="state.inStock" label="Em estoque" :color="themeColor" density="compact"
                                hide-details @update:model-value="() => { state.page = 1; syncQuery(); runSearch() }" />
                            <v-checkbox v-model="state.onSale" label="Em promoção" :color="themeColor" density="compact"
                                hide-details @update:model-value="() => { state.page = 1; syncQuery(); runSearch() }" />
                        </div>

                        <v-divider class="my-4" />

                        <!-- Categorias -->
                        <div v-if="facets.categories.length" class="filter-group">
                            <div class="filter-title">Categorias</div>
                            <div v-for="c in facets.categories" :key="c.id" class="facet-row"
                                @click="toggleCategory(c.id)">
                                <v-checkbox :model-value="state.categoryIds.includes(c.id)" :color="themeColor"
                                    density="compact" hide-details @click.stop
                                    @update:model-value="() => toggleCategory(c.id)" />
                                <span class="facet-label">{{ c.name }}</span>
                                <span class="facet-count">{{ c.count }}</span>
                            </div>
                        </div>

                        <v-divider class="my-4" />

                        <!-- Preço -->
                        <div class="filter-group">
                            <div class="filter-title">Faixa de preço</div>
                            <v-range-slider
                                :model-value="[state.minPrice ?? facets.priceMin, state.maxPrice ?? facets.priceMax]"
                                :min="facets.priceMin" :max="facets.priceMax" :step="1" :color="themeColor" hide-details
                                thumb-label class="mt-2" @end="(v) => applyPriceRange(v[0], v[1])" />
                            <div class="d-flex justify-space-between text-caption text-medium-emphasis">
                                <span>{{ brl(state.minPrice ?? facets.priceMin) }}</span>
                                <span>{{ brl(state.maxPrice ?? facets.priceMax) }}</span>
                            </div>
                        </div>

                        <!-- Atributos -->
                        <template v-if="facets.attributes.length">
                            <v-divider class="my-4" />
                            <div v-for="attr in facets.attributes" :key="attr.name" class="filter-group">
                                <div class="filter-title">{{ attr.name }}</div>
                                <div v-for="v in attr.values" :key="v.value" class="facet-row"
                                    @click="toggleAttribute(attr.name, v.value)">
                                    <v-checkbox :model-value="(state.attributes[attr.name] ?? []).includes(v.value)"
                                        :color="themeColor" density="compact" hide-details @click.stop
                                        @update:model-value="() => toggleAttribute(attr.name, v.value)" />
                                    <span class="facet-label">{{ v.value }}</span>
                                    <span class="facet-count">{{ v.count }}</span>
                                </div>
                            </div>
                        </template>
                    </v-card>
                </aside>

                <!-- ============ Resultados ============ -->
                <div class="results-column flex-grow-1">
                    <!-- Loading skeleton -->
                    <v-row v-if="loading && !results.length">
                        <v-col v-for="i in 8" :key="i" cols="6" sm="4" md="4" lg="3">
                            <v-skeleton-loader type="image, article" class="rounded-xl" />
                        </v-col>
                    </v-row>

                    <!-- Empty state -->
                    <EmptyState v-else-if="!loading && !results.length"
                        :title="state.q ? `Nada encontrado para \'${state.q}\'` : 'Nenhum produto encontrado'"
                        description="Tente reduzir os filtros ou usar termos mais gerais."
                        icon="mdi-package-variant-remove">
                        <template #actions>
                            <v-btn v-if="hasActiveFilters" :color="themeColor" variant="tonal" class="text-none"
                                @click="clearAllFilters">
                                Limpar filtros
                            </v-btn>
                            <v-btn variant="text" class="text-none"
                                @click="router.push({ name: 'storefront', params: { storeSlug: route.params.storeSlug } })">
                                Voltar à loja
                            </v-btn>
                        </template>
                    </EmptyState>

                    <!-- Grid -->
                    <v-row v-else>
                        <v-col v-for="p in results" :key="p.id" cols="6" sm="4" md="4" lg="3">
                            <v-card rounded="xl" flat border class="product-card h-100" @click="goToProduct(p)">
                                <div class="product-image-wrapper">
                                    <v-img :src="productImage(p) ?? undefined" :aspect-ratio="1" cover
                                        class="product-image">
                                        <template #placeholder>
                                            <div
                                                class="d-flex align-center justify-center fill-height bg-surface-variant">
                                                <v-icon size="32" color="grey">mdi-image-off-outline</v-icon>
                                            </div>
                                        </template>
                                    </v-img>

                                    <!-- Badges -->
                                    <div class="product-badges">
                                        <v-chip v-if="discountPct(p)" color="error" size="x-small" variant="flat"
                                            class="font-weight-bold">
                                            -{{ discountPct(p) }}%
                                        </v-chip>
                                        <v-chip v-if="p.is_featured" color="warning" size="x-small" variant="flat">
                                            <v-icon size="12" start>mdi-star</v-icon>
                                            Destaque
                                        </v-chip>
                                        <v-chip v-if="productStock(p) <= 0" color="grey-darken-3" size="x-small"
                                            variant="flat">
                                            Esgotado
                                        </v-chip>
                                    </div>

                                    <!-- Quick add -->
                                    <v-btn v-if="productStock(p) > 0" :color="themeColor" icon="mdi-cart-plus"
                                        size="small" class="quick-add" elevation="4" @click.stop="quickAdd(p)" />
                                </div>

                                <div class="pa-3">
                                    <div v-if="p.category" class="text-caption text-medium-emphasis mb-1 text-truncate">
                                        {{ p.category.name }}
                                    </div>
                                    <div class="text-body-2 font-weight-bold product-name">
                                        {{ p.name }}
                                    </div>
                                    <div class="mt-2 d-flex align-baseline ga-2 flex-wrap">
                                        <span v-if="p.compare_at_price && Number(p.compare_at_price) > Number(p.price)"
                                            class="text-caption text-decoration-line-through text-medium-emphasis">
                                            {{ brl(p.compare_at_price) }}
                                        </span>
                                        <span class="text-body-1 font-weight-black"
                                            :style="{ color: `rgb(var(--v-theme-${themeColor}))` }">
                                            {{ brl(p.price) }}
                                        </span>
                                    </div>
                                </div>
                            </v-card>
                        </v-col>
                    </v-row>

                    <!-- Paginação -->
                    <div v-if="totalPages > 1" class="d-flex justify-center mt-8">
                        <v-pagination :model-value="state.page" :length="totalPages" :total-visible="isDesktop ? 7 : 5"
                            :color="themeColor" rounded="pill" @update:model-value="changePage" />
                    </div>

                    <!-- Rodapé de resultados -->
                    <div v-if="results.length" class="text-center text-caption text-medium-emphasis mt-4">
                        Mostrando {{ (state.page - 1) * PAGE_SIZE + 1 }}–{{ Math.min(state.page * PAGE_SIZE, totalCount)
                        }}
                        de {{ totalCount }} resultado(s)
                    </div>
                </div>
            </div>
        </v-container>

        <!-- ============ Drawer de filtros (mobile) ============ -->
        <v-navigation-drawer v-model="drawerFilters" location="right" temporary width="320" class="filters-drawer">
            <div class="d-flex align-center justify-space-between pa-4 border-b">
                <div class="text-h6 font-weight-black">Filtros</div>
                <v-btn icon="mdi-close" variant="text" size="small" @click="drawerFilters = false" />
            </div>

            <div class="pa-4">
                <!-- Repete o mesmo conteúdo da sidebar -->
                <div class="filter-group">
                    <div class="filter-title">Disponibilidade</div>
                    <v-checkbox v-model="state.inStock" label="Em estoque" :color="themeColor" density="compact"
                        hide-details @update:model-value="() => { state.page = 1; syncQuery(); runSearch() }" />
                    <v-checkbox v-model="state.onSale" label="Em promoção" :color="themeColor" density="compact"
                        hide-details @update:model-value="() => { state.page = 1; syncQuery(); runSearch() }" />
                </div>

                <v-divider class="my-4" />

                <div v-if="facets.categories.length" class="filter-group">
                    <div class="filter-title">Categorias</div>
                    <div v-for="c in facets.categories" :key="c.id" class="facet-row" @click="toggleCategory(c.id)">
                        <v-checkbox :model-value="state.categoryIds.includes(c.id)" :color="themeColor"
                            density="compact" hide-details @click.stop
                            @update:model-value="() => toggleCategory(c.id)" />
                        <span class="facet-label">{{ c.name }}</span>
                        <span class="facet-count">{{ c.count }}</span>
                    </div>
                </div>

                <v-divider class="my-4" />

                <div class="filter-group">
                    <div class="filter-title">Faixa de preço</div>
                    <v-range-slider
                        :model-value="[state.minPrice ?? facets.priceMin, state.maxPrice ?? facets.priceMax]"
                        :min="facets.priceMin" :max="facets.priceMax" :step="1" :color="themeColor" hide-details
                        thumb-label @end="(v) => applyPriceRange(v[0], v[1])" />
                </div>

                <template v-if="facets.attributes.length">
                    <v-divider class="my-4" />
                    <div v-for="attr in facets.attributes" :key="attr.name" class="filter-group">
                        <div class="filter-title">{{ attr.name }}</div>
                        <div v-for="v in attr.values" :key="v.value" class="facet-row"
                            @click="toggleAttribute(attr.name, v.value)">
                            <v-checkbox :model-value="(state.attributes[attr.name] ?? []).includes(v.value)"
                                :color="themeColor" density="compact" hide-details @click.stop
                                @update:model-value="() => toggleAttribute(attr.name, v.value)" />
                            <span class="facet-label">{{ v.value }}</span>
                            <span class="facet-count">{{ v.count }}</span>
                        </div>
                    </div>
                </template>
            </div>

            <template #append>
                <div class="pa-4 border-t d-flex ga-2">
                    <v-btn variant="text" class="text-none flex-grow-1" :disabled="!hasActiveFilters"
                        @click="clearAllFilters">
                        Limpar
                    </v-btn>
                    <v-btn :color="themeColor" variant="flat" class="text-none flex-grow-1"
                        @click="drawerFilters = false">
                        Ver {{ totalCount }} resultado(s)
                    </v-btn>
                </div>
            </template>
        </v-navigation-drawer>
    </div>
</template>

<style scoped>
.search-page {
    min-height: 100dvh;
    background: rgb(var(--v-theme-background));
}

/* ============ Hero de busca ============ */
.search-hero {
    background: linear-gradient(135deg,
            rgba(var(--theme-rgb), 0.06) 0%,
            rgba(var(--theme-rgb), 0.02) 100%);
    border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.search-bar-wrapper {
    position: relative;
}

.search-bar :deep(.v-field) {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.suggestions-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: rgb(var(--v-theme-surface));
    border-radius: 16px;
    border: 1px solid rgba(var(--v-border-color), 0.15);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    z-index: 10;
    overflow: hidden;
    max-width: 640px;
    margin: 0 auto;
}

.suggestion-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    cursor: pointer;
    transition: background 0.15s ease;
}

.suggestion-item:hover {
    background: rgba(var(--v-theme-surface-variant), 0.5);
}

/* ============ Sidebar ============ */
.filters-sidebar {
    width: 280px;
    flex-shrink: 0;
    position: sticky;
    top: 24px;
    align-self: flex-start;
    max-height: calc(100dvh - 48px);
    overflow-y: auto;
}

.filters-sidebar::-webkit-scrollbar {
    width: 6px;
}

.filters-sidebar::-webkit-scrollbar-thumb {
    background: rgba(var(--v-theme-on-surface), 0.15);
    border-radius: 8px;
}

.filter-group {
    margin-bottom: 8px;
}

.filter-title {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), 0.7);
    margin-bottom: 8px;
}

.facet-row {
    display: grid;
    grid-template-columns: 32px 1fr auto;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s ease;
}

.facet-row:hover {
    background: rgba(var(--v-theme-surface-variant), 0.4);
}

.facet-label {
    font-size: 0.875rem;
    color: rgb(var(--v-theme-on-surface));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.facet-count {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.5);
    font-variant-numeric: tabular-nums;
}

/* ============ Cards de produto ============ */
.product-card {
    cursor: pointer;
    transition: all 0.2s ease;
    overflow: hidden;
}

.product-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
    border-color: rgba(var(--theme-rgb), 0.3) !important;
}

.product-image-wrapper {
    position: relative;
    overflow: hidden;
}

.product-image {
    transition: transform 0.4s ease;
}

.product-card:hover .product-image {
    transform: scale(1.05);
}

.product-badges {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 2;
}

.quick-add {
    position: absolute;
    bottom: 8px;
    right: 8px;
    opacity: 0;
    transform: translateY(8px);
    transition: all 0.2s ease;
}

.product-card:hover .quick-add {
    opacity: 1;
    transform: translateY(0);
}

.product-name {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 2.5em;
    line-height: 1.25;
}

/* ============ Drawer mobile ============ */
.filters-drawer .border-b {
    border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

.filters-drawer .border-t {
    border-top: 1px solid rgba(var(--v-border-color), 0.12);
}

/* ============ Responsivo ============ */
@media (max-width: 599px) {
    .search-bar :deep(.v-field__append-inner .v-btn:last-child) {
        display: none;
    }
}
</style>
