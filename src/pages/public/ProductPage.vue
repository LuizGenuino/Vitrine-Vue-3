<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useStorefrontStore } from '@/stores/storefront.store'
import { useCartStore } from '@/stores/cart.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { supabase } from '@/lib/supabase'

import type { Product, Category, Review } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const route = useRoute()
const router = useRouter()
const sf = useStorefrontStore()
const cart = useCartStore()
const notify = useNotifications()

const { store, themeColor } = storeToRefs(sf)

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface ProductFull extends Product {
    category: Pick<Category, 'id' | 'name' | 'slug'> | null
    product_images: {
        id: string
        url: string
        alt_text: string | null
        is_primary: boolean
        sort_order: number
    }[]
    product_attributes: {
        id: string
        name: string
        value: string
    }[]
}

interface ReviewWithCustomer extends Review {
    customer: { full_name: string } | null
}

/* -------------------------------------------------------------------------- */
/*  Utils                                                                     */
/* -------------------------------------------------------------------------- */

const brl = (v: number | string) =>
    Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
})

function initialsOf(name: string): string {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

/* -------------------------------------------------------------------------- */
/*  Query — produto                                                           */
/* -------------------------------------------------------------------------- */

const productSlug = computed(() => route.params.productSlug as string)
const storeId = computed(() => store.value?.id)


const productQuery = useSupabaseQuery<ProductFull | null>(
    async () => {
        if (!storeId.value || !productSlug.value) {
            return null
        }

        const { data, error } = await supabase
            .from('products')
            .select(`
                *,
                category:categories(id, name, slug),
                product_images(id, url, alt_text, is_primary, sort_order),
                product_attributes(id, name, value)
            `)
            .eq('store_id', storeId.value)
            .eq('slug', productSlug.value)
            .eq('status', 'ACTIVE')
            .is('deleted_at', null)
            .maybeSingle()

        if (error) throw error

        return data as unknown as ProductFull | null
    },
    {
        watchSource: [
            storeId,
            productSlug,
        ],
    },
)

const product = computed(() => productQuery.data.value)
const loading = computed(() => productQuery.loading.value)
const notFound = computed(() =>
    !loading.value && !product.value,
)
const productId = computed(() => product.value?.id)
const categoryId = computed(() => product.value?.category_id)

/* -------------------------------------------------------------------------- */
/*  Analytics — dispara VIEW_PRODUCT ao carregar                              */
/* -------------------------------------------------------------------------- */

watch(product, (p) => {
    if (p) {
        sf.trackEvent({
            eventType: 'VIEW_PRODUCT',
            productId: p.id,
            metadata: { source: 'product_page' },
        })
        // Atualiza título da aba com nome do produto
        if (store.value) {
            document.title = `${p.name} · ${store.value.name}`
        }
    }
})

/* -------------------------------------------------------------------------- */
/*  Query — saldo de estoque                                                  */
/* -------------------------------------------------------------------------- */

const stockQuery = useSupabaseQuery<number>(
    async () => {
        if (!productId.value) return 0

        const { data, error } = await supabase
            .from('product_stock_balances')
            .select('balance')
            .eq('product_id', productId.value)
            .maybeSingle()

        if (error) throw error

        return data?.balance ?? 0
    },
    {
        watchSource: [productId],
    },
)

const stock = computed(() => stockQuery.data.value ?? 0)
const isOutOfStock = computed(() => stock.value <= 0)
const isLowStock = computed(() => stock.value > 0 && stock.value <= 5)

/* -------------------------------------------------------------------------- */
/*  Query — reviews aprovadas                                                 */
/* -------------------------------------------------------------------------- */
const reviewsQuery = useSupabaseQuery<ReviewWithCustomer[]>(
    async () => {
        if (!productId.value) return []

        const { data, error } = await supabase
            .from('reviews')
            .select(`
                id,
                rating,
                title,
                comment,
                created_at,
                customer:customers(full_name)
            `)
            .eq('product_id', productId.value)
            .eq('is_approved', true)
            .is('deleted_at', null)
            .order('created_at', {
                ascending: false,
            })
            .limit(20)

        if (error) throw error

        return (data ?? []) as unknown as ReviewWithCustomer[]
    },
    {
        watchSource: [productId],
    },
)

const reviews = computed(() => reviewsQuery.data.value ?? [])

const ratingStats = computed(() => {
    if (!reviews.value.length) return null
    const total = reviews.value.length
    const sum = reviews.value.reduce((s, r) => s + r.rating, 0)
    const avg = sum / total
    const distribution = [5, 4, 3, 2, 1].map(star => ({
        star,
        count: reviews.value.filter(r => r.rating === star).length,
        pct: (reviews.value.filter(r => r.rating === star).length / total) * 100,
    }))
    return { total, avg, distribution }
})

/* -------------------------------------------------------------------------- */
/*  Query — produtos relacionados                                             */
/* -------------------------------------------------------------------------- */

const relatedQuery = useSupabaseQuery<any[]>(
    async () => {
        if (
            !storeId.value ||
            !productId.value ||
            !categoryId.value
        ) {
            return []
        }

        const { data, error } = await supabase
            .from('products')
            .select(`
                id,
                name,
                slug,
                price,
                product_images(
                    url,
                    is_primary
                )
            `)
            .eq('store_id', storeId.value)
            .eq('category_id', categoryId.value)
            .eq('status', 'ACTIVE')
            .is('deleted_at', null)
            .neq('id', productId.value)
            .limit(6)

        if (error) throw error

        return data ?? []
    },
    {
        watchSource: [
            storeId,
            productId,
            categoryId,
        ],
    },
)

const relatedProducts = computed(() => relatedQuery.data.value ?? [])

/* -------------------------------------------------------------------------- */
/*  Galeria                                                                   */
/* -------------------------------------------------------------------------- */

const sortedImages = computed(() => {
    if (!product.value?.product_images.length) return []
    return [...product.value.product_images].sort((a, b) => {
        // primária primeiro, depois por sort_order
        if (a.is_primary && !b.is_primary) return -1
        if (!a.is_primary && b.is_primary) return 1
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })
})

const activeImageIndex = ref(0)

const activeImage = computed(() =>
    sortedImages.value[activeImageIndex.value] ?? null,
)

watch(product, () => {
    activeImageIndex.value = 0
})

function selectImage(index: number) {
    activeImageIndex.value = index
}

function nextImage() {
    if (activeImageIndex.value < sortedImages.value.length - 1) {
        activeImageIndex.value++
    }
}

function prevImage() {
    if (activeImageIndex.value > 0) {
        activeImageIndex.value--
    }
}

/* Lightbox */
const lightboxOpen = ref(false)

/* -------------------------------------------------------------------------- */
/*  Quantidade + carrinho                                                     */
/* -------------------------------------------------------------------------- */

const quantity = ref(1)

const maxQuantity = computed(() => Math.max(1, Math.min(stock.value, 99)))

watch(stock, (s) => {
    if (s > 0 && quantity.value > s) quantity.value = s
    if (s === 0) quantity.value = 1
})

function incrementQty() {
    if (quantity.value < maxQuantity.value) quantity.value++
}

function decrementQty() {
    if (quantity.value > 1) quantity.value--
}

function handleAddToCart() {
    if (!product.value || isOutOfStock.value) return

    cart.addItem({
        product_id: product.value.id,
        name: product.value.name,
        sku: product.value.sku,
        price: Number(product.value.price),
        image_url: activeImage.value?.url ?? null,
    }, quantity.value)

    notify.success(
        `${quantity.value}× ${product.value.name} adicionado ao carrinho`,
    )
}

function handleBuyNow() {
    handleAddToCart()
    router.push({
        name: 'storefront-cart',
        params: { storeSlug: route.params.storeSlug },
    })
}

/* -------------------------------------------------------------------------- */
/*  WhatsApp                                                                  */
/* -------------------------------------------------------------------------- */

const settings = computed(() => (store.value as any)?.settings ?? {})
const whatsappNumber = computed(() => settings.value.whatsapp_number as string | null)
const showPrices = computed(() => settings.value.show_prices !== false)

const publicUrl = computed(() => {
    if (!store.value || !product.value) return ''
    return `${window.location.origin}/s/${store.value.slug}/produto/${product.value.slug}`
})

function contactWhatsApp() {
    if (!whatsappNumber.value || !product.value) return
    sf.trackEvent({
        eventType: 'OPEN_WHATSAPP',
        productId: product.value.id,
    })
    const msg = encodeURIComponent(
        `Olá! Tenho interesse no produto:\n\n` +
        `*${product.value.name}*\n` +
        (showPrices.value ? `Preço: ${brl(product.value.price)}\n` : '') +
        `\n${publicUrl.value}`,
    )
    window.open(`https://wa.me/${whatsappNumber.value}?text=${msg}`, '_blank')
}

/* -------------------------------------------------------------------------- */
/*  Compartilhar                                                              */
/* -------------------------------------------------------------------------- */

async function shareProduct() {
    if (!product.value) return

    const shareData = {
        title: product.value.name,
        text: `Confira ${product.value.name} na ${store.value?.name}!`,
        url: publicUrl.value,
    }

    if (navigator.share) {
        try {
            await navigator.share(shareData)
            return
        } catch { /* usuário cancelou */ }
    }

    await navigator.clipboard.writeText(publicUrl.value)
    notify.success('Link copiado para a área de transferência')
}

/* -------------------------------------------------------------------------- */
/*  Navegação para produto relacionado                                        */
/* -------------------------------------------------------------------------- */

function goToRelated(slug: string) {
    router.push({
        name: 'storefront-product',
        params: {
            storeSlug: route.params.storeSlug,
            productSlug: slug,
        },
    })
}

function primaryImageOf(p: any): string {
    const primary = p.product_images?.find((i: any) => i.is_primary)
    return primary?.url ?? p.product_images?.[0]?.url ?? ''
}

</script>

<template>
    <div class="product-page" :style="{ '--theme-color': themeColor }">

        <!-- ==================== LOADING ==================== -->
        <div v-if="loading" class="loading-state">
            <v-row>
                <v-col cols="12" md="6">
                    <v-skeleton-loader type="image" class="loading-image" />
                </v-col>
                <v-col cols="12" md="6">
                    <v-skeleton-loader type="article" />
                </v-col>
            </v-row>
        </div>

        <!-- ==================== NOT FOUND ==================== -->
        <div v-else-if="notFound" class="notfound-state">
            <v-icon size="80" color="grey-lighten-1">mdi-package-variant-remove</v-icon>
            <h1 class="text-h4 font-weight-black mt-4">Produto não encontrado</h1>
            <p class="text-body-1 text-medium-emphasis mt-2">
                Este produto pode ter sido removido ou está indisponível.
            </p>
            <v-btn color="primary" variant="tonal" rounded="pill" class="text-none mt-6" prepend-icon="mdi-arrow-left"
                @click="router.push({ name: 'storefront', params: { storeSlug: route.params.storeSlug } })">
                Voltar para a vitrine
            </v-btn>
        </div>

        <!-- ==================== PRODUTO ==================== -->
        <template v-else-if="product">

            <!-- Breadcrumb -->
            <nav class="breadcrumb">
                <router-link :to="{ name: 'storefront', params: { storeSlug: route.params.storeSlug } }" class="crumb">
                    <v-icon size="14">mdi-home-outline</v-icon>
                    Início
                </router-link>
                <v-icon size="14" color="medium-emphasis">mdi-chevron-right</v-icon>
                <router-link v-if="product.category" :to="{
                    name: 'storefront',
                    params: { storeSlug: route.params.storeSlug },
                    query: { cat: product.category.id },
                }" class="crumb">
                    {{ product.category.name }}
                </router-link>
                <template v-if="product.category">
                    <v-icon size="14" color="medium-emphasis">mdi-chevron-right</v-icon>
                </template>
                <span class="crumb-current">{{ product.name }}</span>
            </nav>

            <!-- ==================== MAIN GRID ==================== -->
            <div class="product-main">

                <!-- GALERIA -->
                <div class="gallery">
                    <div class="gallery-main">
                        <div class="gallery-image" @click="lightboxOpen = true">
                            <img v-if="activeImage" :src="activeImage.url" :alt="activeImage.alt_text ?? product.name">
                            <div v-else class="image-placeholder">
                                <v-icon size="80" color="grey-lighten-1">mdi-image-off-outline</v-icon>
                            </div>

                            <button v-if="sortedImages.length > 0" class="gallery-zoom" type="button">
                                <v-icon size="18">mdi-magnify-plus-outline</v-icon>
                            </button>
                        </div>

                        <button v-if="activeImageIndex > 0" class="gallery-nav gallery-prev" type="button"
                            @click="prevImage">
                            <v-icon>mdi-chevron-left</v-icon>
                        </button>
                        <button v-if="activeImageIndex < sortedImages.length - 1" class="gallery-nav gallery-next"
                            type="button" @click="nextImage">
                            <v-icon>mdi-chevron-right</v-icon>
                        </button>

                        <!-- Badges na imagem principal -->
                        <div v-if="product.is_featured" class="image-badge featured">
                            <v-icon size="14">mdi-star</v-icon>
                            Destaque
                        </div>
                        <div v-if="isOutOfStock" class="image-badge out">
                            Esgotado
                        </div>
                    </div>

                    <!-- Thumbnails -->
                    <div v-if="sortedImages.length > 1" class="thumbnails">
                        <button v-for="(img, i) in sortedImages" :key="img.id" class="thumbnail"
                            :class="{ active: i === activeImageIndex }" type="button" @click="selectImage(i)">
                            <img :src="img.url" :alt="`Imagem ${i + 1}`">
                        </button>
                    </div>
                </div>

                <!-- INFO -->
                <div class="info">
                    <!-- Categoria -->
                    <router-link v-if="product.category" :to="{
                        name: 'storefront',
                        params: { storeSlug: route.params.storeSlug },
                        query: { cat: product.category.id },
                    }" class="info-category">
                        {{ product.category.name }}
                    </router-link>

                    <!-- Nome -->
                    <h1 class="info-title">{{ product.name }}</h1>

                    <!-- Rating summary -->
                    <div v-if="ratingStats" class="info-rating">
                        <div class="stars">
                            <v-icon v-for="s in 5" :key="s" size="18"
                                :color="s <= Math.round(ratingStats.avg) ? 'warning' : 'grey-lighten-1'">
                                mdi-star
                            </v-icon>
                        </div>
                        <span class="rating-avg">{{ ratingStats.avg.toFixed(1) }}</span>
                        <a href="#reviews" class="rating-count">
                            ({{ ratingStats.total }} {{ ratingStats.total === 1 ? 'avaliação' : 'avaliações' }})
                        </a>
                    </div>

                    <!-- SKU -->
                    <div class="info-sku">
                        <span>SKU:</span>
                        <code>{{ product.sku }}</code>
                    </div>

                    <!-- Preço -->
                    <div class="info-price-block">
                        <div v-if="showPrices" class="info-price">
                            {{ brl(product.price) }}
                        </div>
                        <div v-else class="info-price-hidden">
                            <v-icon size="20">mdi-whatsapp</v-icon>
                            Consulte via WhatsApp
                        </div>

                        <!-- Status de estoque -->
                        <div v-if="isOutOfStock" class="stock-indicator out">
                            <v-icon size="16">mdi-close-circle</v-icon>
                            Produto esgotado
                        </div>
                        <div v-else-if="isLowStock" class="stock-indicator low">
                            <v-icon size="16">mdi-fire</v-icon>
                            Restam apenas {{ stock }} unidades!
                        </div>
                        <div v-else class="stock-indicator in">
                            <v-icon size="16">mdi-check-circle</v-icon>
                            Em estoque · {{ stock }} disponíveis
                        </div>
                    </div>

                    <!-- Descrição curta -->
                    <div v-if="product.description" class="info-description">
                        {{ product.description }}
                    </div>

                    <!-- Seletor de quantidade + botões -->
                    <div v-if="!isOutOfStock" class="info-actions">
                        <div class="qty-selector">
                            <button class="qty-btn" :disabled="quantity <= 1" @click="decrementQty">
                                <v-icon size="18">mdi-minus</v-icon>
                            </button>
                            <input v-model.number="quantity" type="number" min="1" :max="maxQuantity" class="qty-input">
                            <button class="qty-btn" :disabled="quantity >= maxQuantity" @click="incrementQty">
                                <v-icon size="18">mdi-plus</v-icon>
                            </button>
                        </div>

                        <div class="action-buttons">
                            <v-btn color="primary" variant="flat" size="large" rounded="pill"
                                class="text-none flex-grow-1" prepend-icon="mdi-cart-plus" @click="handleAddToCart">
                                Adicionar ao carrinho
                            </v-btn>
                            <v-btn variant="tonal" color="primary" size="large" rounded="pill"
                                class="text-none flex-grow-1" prepend-icon="mdi-flash" @click="handleBuyNow">
                                Comprar agora
                            </v-btn>
                        </div>
                    </div>

                    <!-- Botão de esgotado -->
                    <div v-else class="info-actions">
                        <v-btn variant="tonal" color="grey" size="large" rounded="pill" class="text-none" disabled block
                            prepend-icon="mdi-close-circle-outline">
                            Produto esgotado
                        </v-btn>
                        <p class="text-caption text-medium-emphasis text-center mt-2">
                            Avise-me quando voltar? Fale conosco no WhatsApp
                        </p>
                    </div>

                    <!-- Ações secundárias -->
                    <div class="secondary-actions">
                        <v-btn v-if="whatsappNumber" variant="outlined" color="success" rounded="pill"
                            class="text-none flex-grow-1" prepend-icon="mdi-whatsapp" @click="contactWhatsApp">
                            Perguntar via WhatsApp
                        </v-btn>
                        <v-btn variant="outlined" rounded="pill" class="text-none"
                            prepend-icon="mdi-share-variant-outline" @click="shareProduct">
                            Compartilhar
                        </v-btn>
                    </div>

                    <!-- Benefícios -->
                    <div class="benefits">
                        <div v-if="settings.shipping_free_above && Number(product.price) >= settings.shipping_free_above"
                            class="benefit">
                            <v-icon size="18" color="success">mdi-truck-check-outline</v-icon>
                            <div>
                                <div class="benefit-title">Frete grátis</div>
                                <div class="benefit-desc">Este produto tem frete grátis</div>
                            </div>
                        </div>
                        <div class="benefit">
                            <v-icon size="18" color="primary">mdi-shield-check-outline</v-icon>
                            <div>
                                <div class="benefit-title">Compra segura</div>
                                <div class="benefit-desc">Ambiente protegido e criptografado</div>
                            </div>
                        </div>
                        <div class="benefit">
                            <v-icon size="18" color="info">mdi-swap-horizontal</v-icon>
                            <div>
                                <div class="benefit-title">Trocas fáceis</div>
                                <div class="benefit-desc">Em até 7 dias após o recebimento</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ==================== ATRIBUTOS ==================== -->
            <section v-if="product.product_attributes?.length" class="section">
                <h2 class="section-title">
                    <v-icon color="primary">mdi-format-list-bulleted-type</v-icon>
                    Especificações
                </h2>
                <div class="attributes-table">
                    <div v-for="attr in product.product_attributes" :key="attr.id" class="attribute-row">
                        <div class="attribute-key">{{ attr.name }}</div>
                        <div class="attribute-value">{{ attr.value }}</div>
                    </div>
                </div>
            </section>

            <!-- ==================== REVIEWS ==================== -->
            <section id="reviews" class="section">
                <h2 class="section-title">
                    <v-icon color="warning">mdi-star</v-icon>
                    Avaliações de clientes
                </h2>

                <div v-if="!reviews.length" class="empty-reviews">
                    <v-icon size="48" color="grey-lighten-1">mdi-comment-outline</v-icon>
                    <p class="text-body-2 text-medium-emphasis mt-2">
                        Este produto ainda não tem avaliações.<br>
                        Seja o primeiro a comprar e avaliar!
                    </p>
                </div>

                <div v-else class="reviews-container">
                    <!-- Sumário -->
                    <div class="reviews-summary">
                        <div class="rating-big">
                            <div class="rating-number">{{ ratingStats!.avg.toFixed(1) }}</div>
                            <div class="stars stars-lg">
                                <v-icon v-for="s in 5" :key="s" size="24"
                                    :color="s <= Math.round(ratingStats!.avg) ? 'warning' : 'grey-lighten-1'">
                                    mdi-star
                                </v-icon>
                            </div>
                            <div class="rating-total">
                                {{ ratingStats!.total }} {{ ratingStats!.total === 1 ? 'avaliação' : 'avaliações' }}
                            </div>
                        </div>

                        <div class="rating-distribution">
                            <div v-for="d in ratingStats!.distribution" :key="d.star" class="dist-row">
                                <span class="dist-label">{{ d.star }}</span>
                                <v-icon size="14" color="warning">mdi-star</v-icon>
                                <div class="dist-bar">
                                    <div class="dist-fill" :style="{ width: `${d.pct}%` }" />
                                </div>
                                <span class="dist-count">{{ d.count }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Lista de reviews -->
                    <div class="reviews-list">
                        <article v-for="review in reviews" :key="review.id" class="review-card">
                            <div class="review-header">
                                <v-avatar color="primary" size="36" variant="tonal">
                                    <span class="text-caption font-weight-bold">
                                        {{ initialsOf(review.customer?.full_name ?? '?') }}
                                    </span>
                                </v-avatar>
                                <div class="flex-grow-1 min-width-0">
                                    <div class="review-author">
                                        {{ review.customer?.full_name ?? 'Cliente' }}
                                    </div>
                                    <div class="review-date">
                                        {{ fmtDate(review.created_at) }}
                                    </div>
                                </div>
                                <div class="stars">
                                    <v-icon v-for="s in 5" :key="s" size="14"
                                        :color="s <= review.rating ? 'warning' : 'grey-lighten-1'">
                                        mdi-star
                                    </v-icon>
                                </div>
                            </div>

                            <h4 v-if="review.title" class="review-title">
                                {{ review.title }}
                            </h4>
                            <p v-if="review.comment" class="review-comment">
                                {{ review.comment }}
                            </p>
                        </article>
                    </div>
                </div>
            </section>

            <!-- ==================== PRODUTOS RELACIONADOS ==================== -->
            <section v-if="relatedProducts.length" class="section">
                <h2 class="section-title">
                    <v-icon color="primary">mdi-view-grid-outline</v-icon>
                    Você também pode gostar
                </h2>
                <div class="related-scroll">
                    <article v-for="rel in relatedProducts" :key="rel.id" class="related-card"
                        @click="goToRelated(rel.slug)">
                        <div class="related-image">
                            <img v-if="primaryImageOf(rel)" :src="primaryImageOf(rel)" :alt="rel.name" loading="lazy">
                            <div v-else class="image-placeholder">
                                <v-icon size="32" color="grey-lighten-1">mdi-image-off-outline</v-icon>
                            </div>
                        </div>
                        <div class="related-body">
                            <h3 class="related-name">{{ rel.name }}</h3>
                            <div v-if="showPrices" class="related-price">
                                {{ brl(rel.price) }}
                            </div>
                        </div>
                    </article>
                </div>
            </section>

            <!-- ==================== LIGHTBOX ==================== -->
            <v-dialog v-model="lightboxOpen" max-width="1000" content-class="lightbox-dialog">
                <div class="lightbox">
                    <v-btn icon="mdi-close" variant="flat" color="white" class="lightbox-close"
                        @click="lightboxOpen = false" />
                    <img v-if="activeImage" :src="activeImage.url" :alt="activeImage.alt_text ?? product.name"
                        class="lightbox-img">
                    <button v-if="activeImageIndex > 0" class="lightbox-nav lightbox-prev" @click="prevImage">
                        <v-icon size="32">mdi-chevron-left</v-icon>
                    </button>
                    <button v-if="activeImageIndex < sortedImages.length - 1" class="lightbox-nav lightbox-next"
                        @click="nextImage">
                        <v-icon size="32">mdi-chevron-right</v-icon>
                    </button>
                    <div v-if="sortedImages.length > 1" class="lightbox-counter">
                        {{ activeImageIndex + 1 }} / {{ sortedImages.length }}
                    </div>
                </div>
            </v-dialog>

        </template>
    </div>
</template>

<style scoped>
.product-page {
    --theme-color: rgb(var(--v-theme-primary));
    display: flex;
    flex-direction: column;
    gap: 40px;
}

.min-width-0 {
    min-width: 0;
}

/* ============================================================ */
/*  Loading / Not found                                         */
/* ============================================================ */
.loading-image {
    aspect-ratio: 1;
    border-radius: 16px;
}

.notfound-state {
    text-align: center;
    padding: 60px 20px;
}

/* ============================================================ */
/*  Breadcrumb                                                  */
/* ============================================================ */
.breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
    flex-wrap: wrap;
}

.crumb {
    display: flex;
    align-items: center;
    gap: 4px;
    color: rgba(var(--v-theme-on-surface), 0.6);
    text-decoration: none;
    transition: color 0.15s ease;
}

.crumb:hover {
    color: var(--theme-color);
}

.crumb-current {
    color: rgb(var(--v-theme-on-surface));
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 300px;
}

/* ============================================================ */
/*  Main grid                                                   */
/* ============================================================ */
.product-main {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    align-items: start;
}

@media (max-width: 899px) {
    .product-main {
        grid-template-columns: 1fr;
        gap: 24px;
    }
}

/* ============================================================ */
/*  Galeria                                                     */
/* ============================================================ */
.gallery {
    position: sticky;
    top: 84px;
}

@media (max-width: 899px) {
    .gallery {
        position: static;
    }
}

.gallery-main {
    position: relative;
    background: rgb(var(--v-theme-surface));
    border-radius: 20px;
    overflow: hidden;
    border: 1px solid rgba(var(--v-border-color), 0.08);
}

.gallery-image {
    aspect-ratio: 1;
    cursor: zoom-in;
    overflow: hidden;
}

.gallery-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

.gallery-image:hover img {
    transform: scale(1.03);
}

.image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--v-theme-surface-variant), 0.4);
}

.gallery-zoom {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
    transition: transform 0.15s ease;
}

.gallery-zoom:hover {
    transform: scale(1.1);
}

.gallery-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    backdrop-filter: blur(4px);
}

.gallery-nav:hover {
    background: rgba(0, 0, 0, 0.7);
}

.gallery-prev {
    left: 12px;
}

.gallery-next {
    right: 12px;
}

.image-badge {
    position: absolute;
    top: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    z-index: 1;
}

.image-badge.featured {
    left: 12px;
    background: linear-gradient(135deg, #f59e0b, #f97316);
    color: white;
}

.image-badge.out {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 10px 20px;
    font-size: 1rem;
    border-radius: 100px;
}

.thumbnails {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 8px;
    margin-top: 12px;
}

.thumbnail {
    aspect-ratio: 1;
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    background: rgb(var(--v-theme-surface));
    padding: 0;
    transition: all 0.15s ease;
}

.thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.thumbnail:hover {
    border-color: rgba(var(--theme-color), 0.4);
}

.thumbnail.active {
    border-color: var(--theme-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-color) 25%, transparent);
}

/* ============================================================ */
/*  Info                                                        */
/* ============================================================ */
.info {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.info-category {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--theme-color);
    text-decoration: none;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--theme-color) 8%, transparent);
    border-radius: 6px;
    align-self: flex-start;
}

.info-category:hover {
    background: color-mix(in srgb, var(--theme-color) 15%, transparent);
}

.info-title {
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: rgb(var(--v-theme-on-surface));
    margin: 0;
}

.info-rating {
    display: flex;
    align-items: center;
    gap: 8px;
}

.stars {
    display: flex;
    gap: 2px;
}

.stars-lg {
    gap: 4px;
}

.rating-avg {
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.rating-count {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    text-decoration: underline;
}

.info-sku {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
}

.info-sku code {
    background: rgba(var(--v-theme-on-surface), 0.06);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.75rem;
    font-weight: 600;
    color: rgb(var(--v-theme-on-surface));
}

.info-price-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 0;
    border-top: 1px solid rgba(var(--v-border-color), 0.08);
    border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.info-price {
    font-size: 2.25rem;
    font-weight: 900;
    color: var(--theme-color);
    line-height: 1;
}

.info-price-hidden {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.125rem;
    font-weight: 700;
    color: rgb(var(--v-theme-success));
}

.stock-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
    font-weight: 600;
}

.stock-indicator.in {
    color: rgb(var(--v-theme-success));
}

.stock-indicator.low {
    color: rgb(var(--v-theme-warning));
}

.stock-indicator.out {
    color: rgb(var(--v-theme-error));
}

.info-description {
    font-size: 0.9375rem;
    color: rgba(var(--v-theme-on-surface), 0.8);
    line-height: 1.6;
    white-space: pre-wrap;
}

/* ============================================================ */
/*  Quantidade + actions                                        */
/* ============================================================ */
.info-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.qty-selector {
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(var(--v-border-color), 0.2);
    border-radius: 100px;
    overflow: hidden;
    width: fit-content;
    background: rgb(var(--v-theme-surface));
}

.qty-btn {
    width: 44px;
    height: 44px;
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgb(var(--v-theme-on-surface));
    transition: background 0.15s ease;
}

.qty-btn:hover:not(:disabled) {
    background: rgba(var(--v-theme-on-surface), 0.05);
}

.qty-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.qty-input {
    width: 60px;
    height: 44px;
    border: none;
    text-align: center;
    font-size: 1rem;
    font-weight: 700;
    background: transparent;
    color: rgb(var(--v-theme-on-surface));
    outline: none;
    -moz-appearance: textfield;
}

.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.action-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.secondary-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

/* ============================================================ */
/*  Benefits                                                    */
/* ============================================================ */
.benefits {
    display: grid;
    gap: 12px;
    padding: 16px;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-radius: 12px;
    margin-top: 8px;
}

.benefit {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.benefit-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.benefit-desc {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin-top: 2px;
}

/* ============================================================ */
/*  Sections                                                    */
/* ============================================================ */
.section {
    padding: 24px 0;
    border-top: 1px solid rgba(var(--v-border-color), 0.08);
}

.section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.375rem;
    font-weight: 800;
    color: rgb(var(--v-theme-on-surface));
    margin: 0 0 20px;
}

/* ============================================================ */
/*  Attributes                                                  */
/* ============================================================ */
.attributes-table {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 8px;
}

.attribute-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-radius: 10px;
}

.attribute-key {
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.6);
    flex-shrink: 0;
    min-width: 100px;
}

.attribute-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: rgb(var(--v-theme-on-surface));
}

/* ============================================================ */
/*  Reviews                                                     */
/* ============================================================ */
.empty-reviews {
    text-align: center;
    padding: 40px 20px;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-radius: 12px;
}

.reviews-container {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 32px;
}

@media (max-width: 899px) {
    .reviews-container {
        grid-template-columns: 1fr;
        gap: 20px;
    }
}

.reviews-summary {
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-radius: 16px;
    padding: 20px;
    height: fit-content;
}

.rating-big {
    text-align: center;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
    margin-bottom: 16px;
}

.rating-number {
    font-size: 3rem;
    font-weight: 900;
    line-height: 1;
    color: rgb(var(--v-theme-on-surface));
}

.rating-total {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin-top: 4px;
}

.rating-distribution {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.dist-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.dist-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.7);
    width: 8px;
}

.dist-bar {
    flex: 1;
    height: 6px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    border-radius: 3px;
    overflow: hidden;
}

.dist-fill {
    height: 100%;
    background: linear-gradient(90deg, #f59e0b, #fbbf24);
    border-radius: 3px;
    transition: width 0.6s ease;
}

.dist-count {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    min-width: 20px;
    text-align: right;
}

.reviews-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.review-card {
    background: rgb(var(--v-theme-surface));
    border: 1px solid rgba(var(--v-border-color), 0.08);
    border-radius: 12px;
    padding: 16px;
}

.review-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
}

.review-author {
    font-size: 0.875rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.review-date {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.5);
}

.review-title {
    font-size: 0.9375rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
    margin: 0 0 4px;
}

.review-comment {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), 0.8);
    line-height: 1.5;
    margin: 0;
    white-space: pre-wrap;
}

/* ============================================================ */
/*  Related                                                     */
/* ============================================================ */
.related-scroll {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding-bottom: 8px;
    scrollbar-width: thin;
}

.related-card {
    flex: 0 0 200px;
    scroll-snap-align: start;
    background: rgb(var(--v-theme-surface));
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid rgba(var(--v-border-color), 0.08);
    transition: all 0.2s ease;
}

.related-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
}

.related-image {
    aspect-ratio: 1;
    background: rgba(var(--v-theme-surface-variant), 0.4);
    overflow: hidden;
}

.related-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.related-body {
    padding: 12px;
}

.related-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: rgb(var(--v-theme-on-surface));
    margin: 0 0 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    min-height: 2.6em;
}

.related-price {
    font-size: 1rem;
    font-weight: 800;
    color: var(--theme-color);
}

/* ============================================================ */
/*  Lightbox                                                    */
/* ============================================================ */
:deep(.lightbox-dialog) {
    background: transparent;
    box-shadow: none;
}

.lightbox {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
}

.lightbox-img {
    max-width: 100%;
    max-height: 85vh;
    object-fit: contain;
    border-radius: 12px;
}

.lightbox-close {
    position: absolute;
    top: -8px;
    right: -8px;
    z-index: 2;
}

.lightbox-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
}

.lightbox-prev {
    left: -28px;
}

.lightbox-next {
    right: -28px;
}

.lightbox-counter {
    position: absolute;
    bottom: -32px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 4px 12px;
    border-radius: 100px;
    font-size: 0.8125rem;
    font-weight: 600;
}
</style>
