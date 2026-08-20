<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useStorefrontStore } from '@/stores/storefront.store'
import { useCartStore, type CartItem } from '@/stores/cart.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { supabase } from '@/lib/supabase'

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
/*  Utils                                                                     */
/* -------------------------------------------------------------------------- */

const brl = (v: number | string) =>
    Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const settings = computed(() => (store.value as any)?.settings ?? {})
const showPrices = computed(() => settings.value.show_prices !== false)
const shippingFreeAbove = computed(() =>
    Number(settings.value.shipping_free_above ?? 0),
)
const minOrderValue = computed(() =>
    Number(settings.value.min_order_value ?? 0),
)

/* -------------------------------------------------------------------------- */
/*  Query — estoques atuais dos itens do carrinho                             */
/* -------------------------------------------------------------------------- */

const stockMap = ref<Record<string, number>>({})

const stockCheckLoading = ref(false)

async function refreshStock() {
    if (!cart.items.length) { stockMap.value = {}; return }
    stockCheckLoading.value = true

    const { data } = await supabase
        .from('product_stock_balances')
        .select('product_id, balance')
        .in('product_id', cart.items.map(i => i.product_id))

    const map: Record<string, number> = {}
    for (const row of data ?? []) {
        if (row.product_id) map[row.product_id] = row.balance ?? 0
    }
    stockMap.value = map
    stockCheckLoading.value = false

    // Alerta se algum item ficou sem estoque
    const outOfStock = cart.items.filter(i => (map[i.product_id] ?? 0) === 0)
    if (outOfStock.length) {
        notify.warning(`${outOfStock.length} produto(s) do seu carrinho está(ão) esgotado(s)`,)
    }
}

// Recarrega estoque quando itens mudam
watch(() => cart.items.map(i => i.product_id).join(','), refreshStock, { immediate: true })

function stockOf(item: CartItem): number {
    return stockMap.value[item.product_id] ?? 0
}

function isOutOfStock(item: CartItem): boolean {
    return stockOf(item) === 0
}

function exceedsStock(item: CartItem): boolean {
    const s = stockOf(item)
    return s > 0 && item.quantity > s
}

/* -------------------------------------------------------------------------- */
/*  Query — imagens atualizadas dos produtos (caso mudaram)                   */
/* -------------------------------------------------------------------------- */

const productsInfoQuery = useSupabaseQuery(async () => {
    if (!cart.items.length) return {}
    const { data } = await supabase
        .from('products')
        .select(`
      id, name, slug, price, status,
      product_images(url, is_primary)
    `)
        .in('id', cart.items.map(i => i.product_id))

    const map: Record<string, any> = {}
    for (const p of data ?? []) map[p.id] = p
    return map
}, { watchSource: [cart.items.map(i => i.product_id).join(',') as any] })

const productsInfo = computed(() => productsInfoQuery.data.value ?? {})

/** Retorna URL da imagem atualizada (se disponível) ou fallback */
function currentImage(item: CartItem): string {
    const info = productsInfo.value[item.product_id]
    if (info?.product_images?.length) {
        const primary = info.product_images.find((i: any) => i.is_primary)
        return primary?.url ?? info.product_images[0]?.url ?? item.image_url ?? ''
    }
    return item.image_url ?? ''
}

/* -------------------------------------------------------------------------- */
/*  Cupom                                                                     */
/* -------------------------------------------------------------------------- */

interface AppliedCoupon {
    id: string
    code: string
    type: 'PERCENTAGE' | 'FIXED' | 'SHIPPING'
    value: number
    min_order_value: number | null
    discount_amount: number
    free_shipping: boolean
}

const couponInput = ref('')
const couponLoading = ref(false)
const couponError = ref('')
const appliedCoupon = ref<AppliedCoupon | null>(null)

// Persiste cupom aplicado no localStorage por loja
const COUPON_KEY = computed(() =>
    store.value ? `vibestore-coupon-${store.value.id}` : null,
)

watch(COUPON_KEY, (key) => {
    if (!key) { appliedCoupon.value = null; return }
    const raw = localStorage.getItem(key)
    if (raw) {
        try {
            appliedCoupon.value = JSON.parse(raw)
        } catch { /* ignora */ }
    }
}, { immediate: true })

watch(appliedCoupon, (val) => {
    if (!COUPON_KEY.value) return
    if (val) {
        localStorage.setItem(COUPON_KEY.value, JSON.stringify(val))
    } else {
        localStorage.removeItem(COUPON_KEY.value)
    }
})

async function applyCoupon() {
    const code = couponInput.value.trim().toUpperCase()
    if (!code || !store.value) return

    couponLoading.value = true
    couponError.value = ''

    try {
        const { data, error } = await supabase
            .from('coupons')
            .select('*')
            .eq('store_id', store.value.id)
            .eq('code', code)
            .eq('is_active', true)
            .is('deleted_at', null)
            .maybeSingle()

        if (error) throw error

        if (!data) {
            couponError.value = 'Cupom inválido'
            return
        }

        // Validações
        const now = new Date()
        if (data.valid_from && new Date(data.valid_from) > now) {
            couponError.value = 'Este cupom ainda não está válido'
            return
        }
        if (data.valid_until && new Date(data.valid_until) < now) {
            couponError.value = 'Este cupom expirou'
            return
        }
        if (data.max_uses !== null && (data.uses_count ?? 0) >= data.max_uses) {
            couponError.value = 'Este cupom esgotou seus usos'
            return
        }
        if (data.min_order_value && cart.subtotal < Number(data.min_order_value)) {
            couponError.value = `Pedido mínimo de ${brl(data.min_order_value)} para usar este cupom`
            return
        }

        // Calcula desconto
        let discountAmount = 0
        let freeShipping = false

        if (data.type === 'PERCENTAGE') {
            discountAmount = cart.subtotal * (Number(data.value) / 100)
        } else if (data.type === 'FIXED') {
            discountAmount = Math.min(Number(data.value), cart.subtotal)
        } else if (data.type === 'SHIPPING') {
            freeShipping = true
        }

        appliedCoupon.value = {
            id: data.id,
            code: data.code,
            type: data.type as any,
            value: Number(data.value),
            min_order_value: data.min_order_value !== null ? Number(data.min_order_value) : null,
            discount_amount: discountAmount,
            free_shipping: freeShipping,
        }

        couponInput.value = ''
        notify.success(`Cupom "${code}" aplicado!`)
    } catch (err: any) {
        couponError.value = err.message ?? 'Erro ao validar cupom'
    } finally {
        couponLoading.value = false
    }
}

function removeCoupon() {
    appliedCoupon.value = null
    couponError.value = ''
    notify.info('Cupom removido')
}

// Recalcula desconto se o subtotal mudar (usuário aumentou/diminuiu qty)
watch(() => cart.subtotal, (newSubtotal) => {
    if (!appliedCoupon.value) return
    const c = appliedCoupon.value

    // Se agora está abaixo do mínimo, remove o cupom
    if (c.min_order_value && newSubtotal < c.min_order_value) {
        notify.warning(`Cupom removido: pedido abaixo de ${brl(c.min_order_value)}`)
        appliedCoupon.value = null
        return
    }

    // Recalcula o valor do desconto
    if (c.type === 'PERCENTAGE') {
        c.discount_amount = newSubtotal * (c.value / 100)
    } else if (c.type === 'FIXED') {
        c.discount_amount = Math.min(c.value, newSubtotal)
    }
})

/* -------------------------------------------------------------------------- */
/*  Cálculos                                                                  */
/* -------------------------------------------------------------------------- */

const discount = computed(() => appliedCoupon.value?.discount_amount ?? 0)

const shippingCost = computed(() => {
    // Frete grátis via cupom
    if (appliedCoupon.value?.free_shipping) return 0
    // Frete grátis por valor mínimo
    if (shippingFreeAbove.value > 0 && cart.subtotal >= shippingFreeAbove.value) return 0
    // O checkout calcula o frete real via API; aqui é apenas estimativa
    return 0 // deixa em 0 até o checkout — o carrinho não pede endereço
})

const total = computed(() =>
    Math.max(0, cart.subtotal - discount.value + shippingCost.value),
)

const amountToFreeShipping = computed(() => {
    if (shippingFreeAbove.value <= 0) return 0
    if (cart.subtotal >= shippingFreeAbove.value) return 0
    return shippingFreeAbove.value - cart.subtotal
})

const freeShippingProgress = computed(() => {
    if (shippingFreeAbove.value <= 0) return 0
    return Math.min(100, (cart.subtotal / shippingFreeAbove.value) * 100)
})

const belowMinimum = computed(() =>
    minOrderValue.value > 0 && cart.subtotal < minOrderValue.value,
)

const amountToMinimum = computed(() =>
    Math.max(0, minOrderValue.value - cart.subtotal),
)

/* -------------------------------------------------------------------------- */
/*  Ações                                                                     */
/* -------------------------------------------------------------------------- */

function updateQuantity(item: CartItem, newQty: number) {
    const maxAllowed = stockOf(item)
    if (newQty > maxAllowed && maxAllowed > 0) {
        notify.warning(`Apenas ${maxAllowed} unidades disponíveis`)
        cart.updateQuantity(item.product_id, maxAllowed)
        return
    }
    cart.updateQuantity(item.product_id, newQty)
}

function incrementItem(item: CartItem) {
    updateQuantity(item, item.quantity + 1)
}

function decrementItem(item: CartItem) {
    if (item.quantity <= 1) {
        askRemove(item)
        return
    }
    updateQuantity(item, item.quantity - 1)
}

/* Remoção com confirmação */
const confirmRemove = reactive({
    open: false,
    item: null as CartItem | null,
})

function askRemove(item: CartItem) {
    confirmRemove.item = item
    confirmRemove.open = true
}

function doRemove() {
    if (!confirmRemove.item) return
    cart.removeItem(confirmRemove.item.product_id)
    notify.info('Item removido do carrinho')
    confirmRemove.open = false
}

/* Limpar carrinho inteiro */
const confirmClear = reactive({ open: false })

function doClear() {
    cart.clear()
    appliedCoupon.value = null
    confirmClear.open = false
    notify.info('Carrinho limpo')
}

/* Ir para produto */
function goToProduct(item: CartItem) {
    const info = productsInfo.value[item.product_id]
    if (!info?.slug) return
    router.push({
        name: 'storefront-product',
        params: {
            storeSlug: route.params.storeSlug,
            productSlug: info.slug,
        },
    })
}

/* Continuar comprando */
function continueShopping() {
    router.push({
        name: 'storefront',
        params: { storeSlug: route.params.storeSlug },
    })
}

/* Ir para checkout */
function goToCheckout() {
    // Valida antes
    if (cart.items.length === 0) return
    if (belowMinimum.value) {
        notify.error(`Pedido mínimo: ${brl(minOrderValue.value)}`)
        return
    }

    // Bloqueia se algum item está esgotado ou excede estoque
    const invalid = cart.items.filter(i => isOutOfStock(i) || exceedsStock(i))
    if (invalid.length) {
        notify.error('Ajuste os itens sem estoque antes de continuar')
        return
    }

    sf.trackEvent({
        eventType: 'CHECKOUT',
        metadata: {
            items: cart.items.length,
            subtotal: cart.subtotal,
            coupon: appliedCoupon.value?.code,
            total: total.value,
        },
    })

    router.push({
        name: 'storefront-checkout',
        params: { storeSlug: route.params.storeSlug },
    })
}

/* -------------------------------------------------------------------------- */
/*  Cross-sell — produtos sugeridos                                           */
/* -------------------------------------------------------------------------- */

const suggestionsQuery = useSupabaseQuery(async () => {
    if (!store.value) return []

    // Descobre categorias dos itens do carrinho
    const productIds = cart.items.map(i => i.product_id)
    if (!productIds.length) {
        // Se carrinho vazio, sugere destaques
        const { data } = await supabase
            .from('products')
            .select(`id, name, slug, price,
               product_images(url, is_primary)`)
            .eq('store_id', store.value.id)
            .eq('status', 'ACTIVE')
            .eq('is_featured', true)
            .is('deleted_at', null)
            .limit(4)
        return data ?? []
    }

    const { data: cartProducts } = await supabase
        .from('products')
        .select('category_id')
        .in('id', productIds)

    const categoryIds = [...new Set(
        (cartProducts ?? []).map(p => p.category_id).filter(Boolean),
    )]

    if (!categoryIds.length) return []

    const { data } = await supabase
        .from('products')
        .select(`id, name, slug, price,
             product_images(url, is_primary)`)
        .eq('store_id', store.value.id)
        .eq('status', 'ACTIVE')
        .in('category_id', categoryIds)
        .not('id', 'in', `(${productIds.join(',')})`)
        .is('deleted_at', null)
        .limit(4)

    return data ?? []
}, { watchSource: [cart.items.map(i => i.product_id).join(',') as any] })

const suggestions = computed(() => suggestionsQuery.data.value ?? [])

function addSuggestion(p: any) {
    const primary = p.product_images?.find((i: any) => i.is_primary)
    cart.addItem({
        product_id: p.id,
        name: p.name,
        sku: p.sku ?? '',
        price: Number(p.price),
        image_url: primary?.url ?? p.product_images?.[0]?.url ?? null,
    })
    notify.success(`${p.name} adicionado ao carrinho`)
}

function primaryImageOf(p: any): string {
    const primary = p.product_images?.find((i: any) => i.is_primary)
    return primary?.url ?? p.product_images?.[0]?.url ?? ''
}

onMounted(() => {
    refreshStock()
    suggestionsQuery.refresh()
})
</script>

<template>
    <div class="cart-page" :style="{ '--theme-color': themeColor }">

        <!-- ==================== HEADER ==================== -->
        <header class="cart-header">
            <div>
                <button class="back-btn" @click="continueShopping">
                    <v-icon size="18">mdi-arrow-left</v-icon>
                    <span>Continuar comprando</span>
                </button>
                <h1 class="cart-title">
                    Meu carrinho
                    <span v-if="cart.itemCount > 0" class="cart-count">
                        {{ cart.itemCount }} {{ cart.itemCount === 1 ? 'item' : 'itens' }}
                    </span>
                </h1>
            </div>

            <v-btn v-if="cart.items.length" variant="text" color="error" class="text-none"
                prepend-icon="mdi-trash-can-outline" @click="confirmClear.open = true">
                Limpar carrinho
            </v-btn>
        </header>

        <!-- ==================== EMPTY STATE ==================== -->
        <div v-if="!cart.items.length" class="empty-state">
            <div class="empty-emoji">🛒</div>
            <h2 class="empty-title">Seu carrinho está vazio</h2>
            <p class="empty-desc">
                Adicione produtos para começar sua compra.<br>
                Já pensou no que quer levar hoje?
            </p>
            <v-btn color="primary" variant="flat" size="large" rounded="pill" class="text-none px-6 mt-2"
                prepend-icon="mdi-store-outline" @click="continueShopping">
                Explorar produtos
            </v-btn>

            <!-- Sugestões mesmo com carrinho vazio -->
            <div v-if="suggestions.length" class="suggestions-empty">
                <h3 class="suggestions-title">
                    <v-icon color="warning">mdi-star</v-icon>
                    Destaques que talvez você goste
                </h3>
                <div class="suggestions-grid">
                    <article v-for="p in suggestions" :key="p.id" class="suggestion-card"
                        @click="router.push({ name: 'storefront-product', params: { storeSlug: route.params.storeSlug, productSlug: p.slug } })">
                        <div class="suggestion-image">
                            <img v-if="primaryImageOf(p)" :src="primaryImageOf(p)" :alt="p.name" loading="lazy">
                            <v-icon v-else size="32" color="grey-lighten-1">mdi-image-off-outline</v-icon>
                        </div>
                        <div class="suggestion-body">
                            <h4 class="suggestion-name">{{ p.name }}</h4>
                            <div v-if="showPrices" class="suggestion-price">
                                {{ brl(p.price) }}
                            </div>
                        </div>
                    </article>
                </div>
            </div>
        </div>

        <!-- ==================== CARRINHO COM ITENS ==================== -->
        <div v-else class="cart-layout">

            <!-- LADO ESQUERDO: LISTA DE ITENS -->
            <section class="cart-items">
                <!-- Progresso de frete grátis -->
                <div v-if="shippingFreeAbove > 0 && !appliedCoupon?.free_shipping" class="shipping-progress"
                    :class="{ achieved: amountToFreeShipping === 0 }">
                    <div class="shipping-progress-content">
                        <v-icon :color="amountToFreeShipping === 0 ? 'success' : 'primary'" size="24">
                            {{ amountToFreeShipping === 0 ? 'mdi-truck-check' : 'mdi-truck-outline' }}
                        </v-icon>
                        <div class="flex-grow-1 min-width-0">
                            <div v-if="amountToFreeShipping === 0" class="progress-text">
                                🎉 Você ganhou <strong>frete grátis</strong>!
                            </div>
                            <div v-else class="progress-text">
                                Faltam <strong>{{ brl(amountToFreeShipping) }}</strong> para
                                <strong>frete grátis</strong>
                            </div>
                            <v-progress-linear :model-value="freeShippingProgress"
                                :color="amountToFreeShipping === 0 ? 'success' : 'primary'" height="6" rounded
                                class="mt-2" />
                        </div>
                    </div>
                </div>

                <!-- Alerta de pedido mínimo -->
                <v-alert v-if="belowMinimum" type="warning" variant="tonal" rounded="lg" density="compact"
                    icon="mdi-alert-outline" class="mb-4">
                    <div class="text-body-2">
                        Faltam <strong>{{ brl(amountToMinimum) }}</strong> para atingir o
                        pedido mínimo de <strong>{{ brl(minOrderValue) }}</strong>.
                    </div>
                </v-alert>

                <!-- Lista de itens -->
                <div class="items-list">
                    <article v-for="item in cart.items" :key="item.product_id" class="cart-item" :class="{
                        'is-out': isOutOfStock(item),
                        'exceeds-stock': exceedsStock(item),
                    }">
                        <!-- Imagem -->
                        <div class="item-image" @click="goToProduct(item)">
                            <img v-if="currentImage(item)" :src="currentImage(item)" :alt="item.name">
                            <div v-else class="image-placeholder">
                                <v-icon size="32" color="grey-lighten-1">mdi-image-off-outline</v-icon>
                            </div>
                            <div v-if="isOutOfStock(item)" class="item-badge-out">
                                Esgotado
                            </div>
                        </div>

                        <!-- Info -->
                        <div class="item-info">
                            <div class="item-header">
                                <h3 class="item-name" @click="goToProduct(item)">
                                    {{ item.name }}
                                </h3>
                                <button class="item-remove" aria-label="Remover item" @click="askRemove(item)">
                                    <v-icon size="18">mdi-close</v-icon>
                                </button>
                            </div>

                            <code v-if="item.sku" class="item-sku">{{ item.sku }}</code>

                            <!-- Alertas de estoque inline -->
                            <div v-if="isOutOfStock(item)" class="item-alert alert-error">
                                <v-icon size="14">mdi-close-circle</v-icon>
                                Produto esgotado
                            </div>
                            <div v-else-if="exceedsStock(item)" class="item-alert alert-warning">
                                <v-icon size="14">mdi-alert</v-icon>
                                Apenas {{ stockOf(item) }} disponíveis — ajuste a quantidade
                            </div>

                            <div class="item-footer">
                                <!-- Seletor de qty -->
                                <div class="qty-selector">
                                    <button class="qty-btn" :disabled="isOutOfStock(item)" @click="decrementItem(item)">
                                        <v-icon size="16">mdi-minus</v-icon>
                                    </button>
                                    <input :value="item.quantity" type="number" min="1" :max="stockOf(item)"
                                        class="qty-input"
                                        @change="updateQuantity(item, Number(($event.target as HTMLInputElement).value))"
                                        :disabled="isOutOfStock(item)">
                                    <button class="qty-btn"
                                        :disabled="isOutOfStock(item) || item.quantity >= stockOf(item)"
                                        @click="incrementItem(item)">
                                        <v-icon size="16">mdi-plus</v-icon>
                                    </button>
                                </div>

                                <!-- Preços -->
                                <div v-if="showPrices" class="item-prices">
                                    <div v-if="item.quantity > 1" class="item-unit-price">
                                        {{ brl(item.price) }} × {{ item.quantity }}
                                    </div>
                                    <div class="item-total-price">
                                        {{ brl(item.price * item.quantity) }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </article>
                </div>

                <!-- Sugestões -->
                <div v-if="suggestions.length" class="suggestions-section">
                    <h3 class="suggestions-title">
                        <v-icon color="primary">mdi-plus-circle-outline</v-icon>
                        Adicione ao pedido
                    </h3>
                    <div class="suggestions-scroll">
                        <article v-for="p in suggestions" :key="p.id" class="suggestion-card-inline">
                            <div class="suggestion-inline-image"
                                @click="router.push({ name: 'storefront-product', params: { storeSlug: route.params.storeSlug, productSlug: p.slug } })">
                                <img v-if="primaryImageOf(p)" :src="primaryImageOf(p)" :alt="p.name" loading="lazy">
                                <v-icon v-else size="24" color="grey-lighten-1">mdi-image-off-outline</v-icon>
                            </div>
                            <div class="suggestion-inline-body">
                                <h4 class="suggestion-inline-name">{{ p.name }}</h4>
                                <div v-if="showPrices" class="suggestion-inline-price">
                                    {{ brl(p.price) }}
                                </div>
                                <button class="suggestion-inline-add" @click="addSuggestion(p)">
                                    <v-icon size="14">mdi-plus</v-icon>
                                    Adicionar
                                </button>
                            </div>
                        </article>
                    </div>
                </div>
            </section>

            <!-- LADO DIREITO: RESUMO -->
            <aside class="cart-summary">
                <div class="summary-card">
                    <h2 class="summary-title">Resumo do pedido</h2>

                    <!-- Cupom -->
                    <div class="coupon-section">
                        <div v-if="!appliedCoupon" class="coupon-form">
                            <v-text-field v-model="couponInput" placeholder="Cupom de desconto" variant="outlined"
                                density="comfortable" hide-details prepend-inner-icon="mdi-ticket-percent-outline"
                                :error="!!couponError" :disabled="couponLoading" @keyup.enter="applyCoupon"
                                @input="couponError = ''">
                                <template #append-inner>
                                    <v-btn v-if="couponInput.trim()" size="x-small" variant="flat" color="primary"
                                        :loading="couponLoading" @click="applyCoupon">
                                        Aplicar
                                    </v-btn>
                                </template>
                            </v-text-field>
                            <p v-if="couponError" class="coupon-error">
                                <v-icon size="14">mdi-alert-circle-outline</v-icon>
                                {{ couponError }}
                            </p>
                        </div>

                        <div v-else class="applied-coupon">
                            <div class="applied-coupon-content">
                                <v-icon color="success" size="20">mdi-check-decagram</v-icon>
                                <div class="min-width-0 flex-grow-1">
                                    <div class="applied-coupon-code">
                                        Cupom "{{ appliedCoupon.code }}"
                                    </div>
                                    <div class="applied-coupon-desc">
                                        <template v-if="appliedCoupon.type === 'PERCENTAGE'">
                                            {{ appliedCoupon.value }}% de desconto aplicado
                                        </template>
                                        <template v-else-if="appliedCoupon.type === 'FIXED'">
                                            {{ brl(appliedCoupon.value) }} de desconto
                                        </template>
                                        <template v-else>
                                            Frete grátis
                                        </template>
                                    </div>
                                </div>
                                <button class="applied-coupon-remove" aria-label="Remover cupom" @click="removeCoupon">
                                    <v-icon size="16">mdi-close</v-icon>
                                </button>
                            </div>
                        </div>
                    </div>

                    <v-divider class="my-4" />

                    <!-- Cálculos -->
                    <div v-if="showPrices" class="calc-list">
                        <div class="calc-row">
                            <span class="calc-label">
                                Subtotal ({{ cart.itemCount }} {{ cart.itemCount === 1 ? 'item' : 'itens' }})
                            </span>
                            <span class="calc-value">{{ brl(cart.subtotal) }}</span>
                        </div>

                        <div v-if="discount > 0" class="calc-row calc-discount">
                            <span class="calc-label">
                                <v-icon size="14">mdi-tag-outline</v-icon>
                                Desconto
                            </span>
                            <span class="calc-value">−{{ brl(discount) }}</span>
                        </div>

                        <div class="calc-row">
                            <span class="calc-label">Frete</span>
                            <span v-if="appliedCoupon?.free_shipping || amountToFreeShipping === 0"
                                class="calc-value calc-free">
                                Grátis
                            </span>
                            <span v-else class="calc-value calc-muted">
                                Calculado no checkout
                            </span>
                        </div>
                    </div>

                    <v-divider v-if="showPrices" class="my-4" />

                    <!-- Total -->
                    <div v-if="showPrices" class="calc-total">
                        <span class="total-label">Total</span>
                        <div class="total-value-wrapper">
                            <div class="total-value">{{ brl(total) }}</div>
                            <div v-if="cart.subtotal >= 100" class="total-installment">
                                ou 3× de {{ brl(total / 3) }} sem juros
                            </div>
                        </div>
                    </div>

                    <!-- Modo sem preço -->
                    <div v-else class="no-price-notice">
                        <v-icon color="success">mdi-whatsapp</v-icon>
                        <p>Valor será combinado via WhatsApp após enviar o pedido</p>
                    </div>

                    <!-- Botão principal -->
                    <v-btn color="primary" variant="flat" size="large" rounded="pill" class="text-none checkout-btn"
                        block :disabled="belowMinimum || cart.items.some(i => isOutOfStock(i) || exceedsStock(i))"
                        append-icon="mdi-arrow-right" @click="goToCheckout">
                        {{ showPrices ? 'Ir para o pagamento' : 'Finalizar pedido' }}
                    </v-btn>

                    <p class="checkout-security">
                        <v-icon size="14">mdi-lock-outline</v-icon>
                        Compra segura · Ambiente criptografado
                    </p>

                    <!-- Métodos de pagamento aceitos -->
                    <div class="payment-methods">
                        <div class="payment-methods-title">Aceitamos:</div>
                        <div class="payment-icons">
                            <span class="payment-icon" title="Pix">🇧🇷 Pix</span>
                            <span class="payment-icon" title="Cartão de crédito">💳 Crédito</span>
                            <span class="payment-icon" title="Boleto">🧾 Boleto</span>
                        </div>
                    </div>
                </div>
            </aside>
        </div>

        <!-- ==================== DIALOG: REMOVER ITEM ==================== -->
        <v-dialog v-model="confirmRemove.open" max-width="420" persistent>
            <v-card v-if="confirmRemove.item" rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-trash-can-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Remover do carrinho?
                    </v-card-title>
                </v-card-item>
                <v-card-text>
                    <p class="text-body-2 mb-0">
                        <strong>{{ confirmRemove.item.name }}</strong> será removido.
                        Você pode adicioná-lo de novo depois.
                    </p>
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" @click="confirmRemove.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" class="text-none" @click="doRemove">
                        Remover
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== DIALOG: LIMPAR CARRINHO ==================== -->
        <v-dialog v-model="confirmClear.open" max-width="420" persistent>
            <v-card rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-cart-remove</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Limpar carrinho?
                    </v-card-title>
                </v-card-item>
                <v-card-text>
                    <p class="text-body-2 mb-0">
                        Todos os {{ cart.itemCount }} {{ cart.itemCount === 1 ? 'item' : 'itens' }}
                        serão removidos e o cupom aplicado (se houver) será descartado.
                    </p>
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" @click="confirmClear.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" class="text-none" @click="doClear">
                        Limpar tudo
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<style scoped>
.cart-page {
    --theme-color: rgb(var(--v-theme-primary));
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.min-width-0 {
    min-width: 0;
}

/* ============================================================ */
/*  Header                                                      */
/* ============================================================ */
.cart-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

.back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: rgba(var(--v-theme-on-surface), 0.6);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    margin-bottom: 4px;
    font-family: inherit;
    transition: color 0.15s ease;
}

.back-btn:hover {
    color: var(--theme-color);
}

.cart-title {
    font-size: clamp(1.75rem, 3vw, 2.25rem);
    font-weight: 900;
    letter-spacing: -0.02em;
    color: rgb(var(--v-theme-on-surface));
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
}

.cart-count {
    font-size: 1rem;
    font-weight: 500;
    color: rgba(var(--v-theme-on-surface), 0.5);
}

/* ============================================================ */
/*  Empty state                                                 */
/* ============================================================ */
.empty-state {
    text-align: center;
    padding: 60px 20px;
}

.empty-emoji {
    font-size: 80px;
    margin-bottom: 16px;
    animation: gentle-bounce 2.5s ease-in-out infinite;
}

@keyframes gentle-bounce {

    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(-8px);
    }
}

.empty-title {
    font-size: 1.5rem;
    font-weight: 800;
    margin: 0 0 8px;
    color: rgb(var(--v-theme-on-surface));
}

.empty-desc {
    font-size: 0.9375rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin: 0 0 24px;
    line-height: 1.5;
}

.suggestions-empty {
    margin-top: 60px;
    text-align: left;
}

.suggestions-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.125rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
    margin: 0 0 16px;
}

.suggestions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
}

@media (max-width: 599px) {
    .suggestions-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

.suggestion-card {
    background: rgb(var(--v-theme-surface));
    border: 1px solid rgba(var(--v-border-color), 0.08);
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s ease;
}

.suggestion-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
}

.suggestion-image {
    aspect-ratio: 1;
    background: rgba(var(--v-theme-surface-variant), 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
}

.suggestion-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.suggestion-body {
    padding: 12px;
}

.suggestion-name {
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

.suggestion-price {
    font-size: 1rem;
    font-weight: 800;
    color: var(--theme-color);
}

/* ============================================================ */
/*  Layout com itens                                            */
/* ============================================================ */
.cart-layout {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 32px;
    align-items: start;
}

@media (max-width: 899px) {
    .cart-layout {
        grid-template-columns: 1fr;
        gap: 24px;
    }
}

.cart-items {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

/* ============================================================ */
/*  Shipping progress                                           */
/* ============================================================ */
.shipping-progress {
    background: linear-gradient(135deg,
            color-mix(in srgb, var(--theme-color) 6%, transparent),
            color-mix(in srgb, var(--theme-color) 2%, transparent));
    border: 1px solid color-mix(in srgb, var(--theme-color) 15%, transparent);
    border-radius: 14px;
    padding: 16px;
}

.shipping-progress.achieved {
    background: linear-gradient(135deg,
            rgba(var(--v-theme-success), 0.08),
            rgba(var(--v-theme-success), 0.03));
    border-color: rgba(var(--v-theme-success), 0.2);
}

.shipping-progress-content {
    display: flex;
    align-items: center;
    gap: 12px;
}

.progress-text {
    font-size: 0.875rem;
    color: rgb(var(--v-theme-on-surface));
}

/* ============================================================ */
/*  Cart item                                                   */
/* ============================================================ */
.items-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.cart-item {
    display: flex;
    gap: 16px;
    padding: 16px;
    background: rgb(var(--v-theme-surface));
    border: 1px solid rgba(var(--v-border-color), 0.08);
    border-radius: 14px;
    transition: all 0.15s ease;
}

.cart-item:hover {
    border-color: rgba(var(--v-theme-primary), 0.2);
}

.cart-item.is-out {
    opacity: 0.6;
}

.cart-item.exceeds-stock {
    border-color: rgba(var(--v-theme-warning), 0.4);
    background: rgba(var(--v-theme-warning), 0.02);
}

.item-image {
    position: relative;
    width: 100px;
    height: 100px;
    flex-shrink: 0;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(var(--v-theme-surface-variant), 0.4);
    cursor: pointer;
}

.item-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.2s ease;
}

.item-image:hover img {
    transform: scale(1.05);
}

.image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.item-badge-out {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 100px;
    backdrop-filter: blur(4px);
}

@media (max-width: 599px) {
    .item-image {
        width: 80px;
        height: 80px;
    }
}

.item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.item-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
}

.item-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
    margin: 0;
    cursor: pointer;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.item-name:hover {
    color: var(--theme-color);
}

.item-remove {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: rgba(var(--v-theme-on-surface), 0.4);
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
}

.item-remove:hover {
    color: rgb(var(--v-theme-error));
    background: rgba(var(--v-theme-error), 0.08);
}

.item-sku {
    align-self: flex-start;
    font-size: 0.7rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    background: rgba(var(--v-theme-on-surface), 0.06);
    padding: 2px 8px;
    border-radius: 4px;
    color: rgba(var(--v-theme-on-surface), 0.6);
    font-weight: 600;
}

.item-alert {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 6px;
    width: fit-content;
}

.alert-error {
    color: rgb(var(--v-theme-error));
    background: rgba(var(--v-theme-error), 0.08);
}

.alert-warning {
    color: rgb(var(--v-theme-warning));
    background: rgba(var(--v-theme-warning), 0.1);
}

.item-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: auto;
    padding-top: 8px;
    flex-wrap: wrap;
}

.qty-selector {
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(var(--v-border-color), 0.2);
    border-radius: 100px;
    overflow: hidden;
    background: rgb(var(--v-theme-surface));
}

.qty-btn {
    width: 32px;
    height: 32px;
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
    width: 40px;
    height: 32px;
    border: none;
    text-align: center;
    font-size: 0.875rem;
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

.item-prices {
    text-align: right;
    min-width: 0;
}

.item-unit-price {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.5);
}

.item-total-price {
    font-size: 1.125rem;
    font-weight: 800;
    color: rgb(var(--v-theme-on-surface));
}

/* ============================================================ */
/*  Suggestions inline (dentro do carrinho)                     */
/* ============================================================ */
.suggestions-section {
    margin-top: 16px;
    padding: 20px;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-radius: 14px;
}

.suggestions-scroll {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
    margin-top: 12px;
    scrollbar-width: thin;
}

.suggestion-card-inline {
    flex: 0 0 200px;
    background: rgb(var(--v-theme-surface));
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(var(--v-border-color), 0.08);
    display: flex;
    flex-direction: column;
}

.suggestion-inline-image {
    aspect-ratio: 16/10;
    background: rgba(var(--v-theme-surface-variant), 0.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.suggestion-inline-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.suggestion-inline-body {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
}

.suggestion-inline-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgb(var(--v-theme-on-surface));
    margin: 0;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    min-height: 2.6em;
}

.suggestion-inline-price {
    font-size: 0.9375rem;
    font-weight: 800;
    color: var(--theme-color);
}

.suggestion-inline-add {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: color-mix(in srgb, var(--theme-color) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-color) 25%, transparent);
    color: var(--theme-color);
    padding: 6px 8px;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
}

.suggestion-inline-add:hover {
    background: color-mix(in srgb, var(--theme-color) 18%, transparent);
}

/* ============================================================ */
/*  Summary                                                     */
/* ============================================================ */
.cart-summary {
    position: sticky;
    top: 84px;
}

@media (max-width: 899px) {
    .cart-summary {
        position: static;
    }
}

.summary-card {
    background: rgb(var(--v-theme-surface));
    border: 1px solid rgba(var(--v-border-color), 0.1);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.summary-title {
    font-size: 1.125rem;
    font-weight: 800;
    color: rgb(var(--v-theme-on-surface));
    margin: 0 0 16px;
}

/* Coupon */
.coupon-error {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-error));
    margin: 6px 0 0 4px;
}

.applied-coupon {
    background: rgba(var(--v-theme-success), 0.06);
    border: 1px dashed rgba(var(--v-theme-success), 0.3);
    border-radius: 12px;
    padding: 12px;
}

.applied-coupon-content {
    display: flex;
    align-items: center;
    gap: 10px;
}

.applied-coupon-code {
    font-size: 0.875rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.applied-coupon-desc {
    font-size: 0.75rem;
    color: rgb(var(--v-theme-success));
    font-weight: 600;
}

.applied-coupon-remove {
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    color: rgba(var(--v-theme-on-surface), 0.4);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
}

.applied-coupon-remove:hover {
    color: rgb(var(--v-theme-error));
    background: rgba(var(--v-theme-error), 0.08);
}

/* Calc */
.calc-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.calc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.875rem;
}

.calc-label {
    display: flex;
    align-items: center;
    gap: 4px;
    color: rgba(var(--v-theme-on-surface), 0.7);
}

.calc-value {
    font-weight: 600;
    color: rgb(var(--v-theme-on-surface));
}

.calc-discount .calc-value {
    color: rgb(var(--v-theme-success));
}

.calc-free {
    color: rgb(var(--v-theme-success)) !important;
    font-weight: 700 !important;
}

.calc-muted {
    color: rgba(var(--v-theme-on-surface), 0.5) !important;
    font-size: 0.75rem !important;
    font-weight: 400 !important;
}

.calc-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
}

.total-label {
    font-size: 1rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.total-value-wrapper {
    text-align: right;
}

.total-value {
    font-size: 1.75rem;
    font-weight: 900;
    color: var(--theme-color);
    line-height: 1;
}

.total-installment {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin-top: 4px;
}

.no-price-notice {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(var(--v-theme-success), 0.08);
    border-radius: 10px;
    margin-bottom: 16px;
}

.no-price-notice p {
    font-size: 0.8125rem;
    color: rgb(var(--v-theme-on-surface));
    margin: 0;
    line-height: 1.4;
}

.checkout-btn {
    margin-top: 4px;
}

.checkout-security {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.5);
    margin: 12px 0 16px;
}

.payment-methods {
    padding-top: 16px;
    border-top: 1px dashed rgba(var(--v-border-color), 0.15);
}

.payment-methods-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(var(--v-theme-on-surface), 0.5);
    margin-bottom: 8px;
}

.payment-icons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.payment-icon {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 6px;
    background: rgba(var(--v-theme-on-surface), 0.05);
    color: rgba(var(--v-theme-on-surface), 0.7);
}
</style>
