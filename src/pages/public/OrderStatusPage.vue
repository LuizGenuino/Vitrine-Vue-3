<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useStorefrontStore } from '@/stores/storefront.store'
import { useNotifications } from '@/stores/notifications.store'
import { supabase } from '@/lib/supabase'

import type { OrderStatus, PaymentStatus } from '@/types/models'

const route = useRoute()
const router = useRouter()
const sf = useStorefrontStore()
const notify = useNotifications()

const { store, themeColor } = storeToRefs(sf)

/* ============================================================================
   Formatadores
============================================================================ */
const brl = (v: number | string | null | undefined) =>
    Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })

const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric',
    })

const fmtRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.round(diff / 60_000)
    if (mins < 1) return 'agora mesmo'
    if (mins < 60) return `há ${mins} min`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `há ${hours}h`
    const days = Math.round(hours / 24)
    if (days < 30) return `há ${days} dia(s)`
    return fmtDate(iso)
}

/* ============================================================================
   Meta de status (visual + textos amigáveis ao cliente)
============================================================================ */
interface StatusMeta {
    label: string
    color: string
    icon: string
    customerMsg: string
    step: number
}

const statusMeta: Record<OrderStatus, StatusMeta> = {
    PENDING: {
        label: 'Aguardando pagamento',
        color: 'warning',
        icon: 'mdi-clock-outline',
        customerMsg: 'Seu pedido foi registrado! Assim que confirmarmos o pagamento, começamos a preparar.',
        step: 1,
    },
    PAID: {
        label: 'Pagamento confirmado',
        color: 'success',
        icon: 'mdi-check-circle-outline',
        customerMsg: 'Recebemos seu pagamento e estamos preparando seu pedido com carinho 💛',
        step: 2,
    },
    DELIVERED: {
        label: 'Pedido entregue',
        color: 'primary',
        icon: 'mdi-package-variant-closed-check',
        customerMsg: 'Seu pedido foi entregue! Esperamos que você ame 😍',
        step: 3,
    },
    CANCELLED: {
        label: 'Pedido cancelado',
        color: 'error',
        icon: 'mdi-close-circle-outline',
        customerMsg: 'Este pedido foi cancelado. Se você não solicitou o cancelamento, fale conosco.',
        step: 0,
    },
    REFUNDED: {
        label: 'Pedido reembolsado',
        color: 'grey',
        icon: 'mdi-cash-refund',
        customerMsg: 'O valor deste pedido foi estornado. O prazo de crédito depende do seu banco.',
        step: 0,
    },
}

const paymentStatusMeta: Record<PaymentStatus, { label: string; color: string; icon: string }> = {
    PENDING: { label: 'Aguardando confirmação', color: 'warning', icon: 'mdi-clock-outline' },
    APPROVED: { label: 'Aprovado', color: 'success', icon: 'mdi-check-circle' },
    DECLINED: { label: 'Recusado', color: 'error', icon: 'mdi-close-circle' },
    REFUNDED: { label: 'Estornado', color: 'grey', icon: 'mdi-cash-refund' },
    CHARGEBACK: { label: 'Contestado', color: 'error', icon: 'mdi-alert-circle' },
}

const paymentMethodLabel: Record<string, { label: string; icon: string }> = {
    PIX: { label: 'PIX', icon: 'mdi-qrcode' },
    CREDIT_CARD: { label: 'Cartão', icon: 'mdi-credit-card-outline' },
    BOLETO: { label: 'Boleto', icon: 'mdi-barcode' },
    WHATSAPP: { label: 'WhatsApp', icon: 'mdi-whatsapp' },
    CASH: { label: 'Dinheiro', icon: 'mdi-cash' },
}

/* ============================================================================
   Estado
============================================================================ */
interface OrderDetail {
    id: string
    order_number: string
    status: OrderStatus
    subtotal: number
    discount: number
    shipping: number
    total: number
    notes: string | null
    tracking_code: string | null
    created_at: string
    updated_at: string
    paid_at: string | null
    delivered_at: string | null
    customer: {
        full_name: string
        email: string
        phone: string | null
    } | null
    address: {
        zipcode: string
        street: string
        number: string
        complement: string | null
        neighborhood: string
        city: string
        state: string
    } | null
    items: Array<{
        id: string
        quantity: number
        unit_price: number
        total: number
        product_name: string
        product_image: string | null
        product_slug: string | null
        attributes_snapshot: Record<string, string> | null
    }>
    payment: {
        method: string
        status: PaymentStatus
        gateway: string | null
        paid_at: string | null
        installments: number | null
        pix_qr_code: string | null
        pix_expires_at: string | null
        boleto_url: string | null
        boleto_barcode: string | null
    } | null
}

const order = ref<OrderDetail | null>(null)
const loading = ref(true)
const errorCode = ref<'NOT_FOUND' | 'INVALID_TOKEN' | 'NETWORK' | null>(null)

/* ============================================================================
   Carregamento
============================================================================ */
async function loadOrder() {
    loading.value = true
    errorCode.value = null

    const orderNumber = route.params.orderNumber as string
    const token = (route.query.token as string) || ''

    console.log(`Carregando pedido ${orderNumber} com token ${token}...`)

    if (!orderNumber ) {
        errorCode.value = 'INVALID_TOKEN'
        loading.value = false
        return
    }

    try {
        // RPC pública que valida token (hash SHA-256 armazenado em orders.access_token_hash)
        const { data, error } = await supabase.rpc('get_public_order', {
            p_order_number: orderNumber,
            p_token: token,
        })

        if (error) throw error
        if (!data) {
            errorCode.value = 'NOT_FOUND'
            return
        }

        order.value = data as any
    } catch (e: any) {
        console.error('[OrderStatus] load error', e)
        errorCode.value = e?.code === 'PGRST116' ? 'NOT_FOUND' : 'NETWORK'
    } finally {
        loading.value = false
    }
}

/* ============================================================================
   Realtime (escuta mudanças no pedido + pagamento)
============================================================================ */
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null

function subscribeRealtime() {
    if (!order.value) return
    realtimeChannel = supabase
        .channel(`public-order-${order.value.id}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.value.id}` },
            (payload) => {
                const oldStatus = order.value?.status
                const newStatus = (payload.new as any).status
                if (oldStatus !== newStatus) {
                    notify.success(`Status atualizado: ${statusMeta[newStatus as OrderStatus].label}`)
                }
                loadOrder()
            },
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'order_payments', filter: `order_id=eq.${order.value.id}` },
            () => loadOrder(),
        )
        .subscribe()
}

function unsubscribeRealtime() {
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel)
        realtimeChannel = null
    }
}

/* ============================================================================
   Computeds
============================================================================ */
const statusData = computed(() =>
    order.value ? statusMeta[order.value.status] : null,
)

const paymentData = computed(() =>
    order.value?.payment ? paymentStatusMeta[order.value.payment.status] : null,
)

const timelineSteps = computed(() => {
    if (!order.value) return []
    const s = order.value.status
    const isCancelled = s === 'CANCELLED' || s === 'REFUNDED'

    return [
        {
            key: 'PLACED',
            title: 'Pedido realizado',
            icon: 'mdi-cart-check',
            date: order.value.created_at,
            done: true,
            active: false,
        },
        {
            key: 'PAID',
            title: 'Pagamento confirmado',
            icon: 'mdi-credit-card-check-outline',
            date: order.value.paid_at,
            done: !!order.value.paid_at,
            active: s === 'PENDING',
            cancelled: isCancelled && !order.value.paid_at,
        },
        {
            key: 'PREPARING',
            title: 'Preparando pedido',
            icon: 'mdi-package-variant',
            date: order.value.paid_at,
            done: s === 'DELIVERED',
            active: s === 'PAID',
            cancelled: isCancelled,
        },
        {
            key: 'DELIVERED',
            title: 'Entregue',
            icon: 'mdi-truck-check-outline',
            date: order.value.delivered_at,
            done: s === 'DELIVERED',
            active: false,
            cancelled: isCancelled,
        },
    ]
})

const showPixDetails = computed(() =>
    order.value?.status === 'PENDING' &&
    order.value?.payment?.method === 'PIX' &&
    !!order.value?.payment?.pix_qr_code,
)

const showBoletoDetails = computed(() =>
    order.value?.status === 'PENDING' &&
    order.value?.payment?.method === 'BOLETO' &&
    !!order.value?.payment?.boleto_url,
)

const pixExpired = computed(() => {
    const exp = order.value?.payment?.pix_expires_at
    if (!exp) return false
    return new Date(exp).getTime() < Date.now()
})

const pixCountdown = ref('')
let countdownTimer: number | undefined

function updateCountdown() {
    const exp = order.value?.payment?.pix_expires_at
    if (!exp) { pixCountdown.value = ''; return }
    const diff = new Date(exp).getTime() - Date.now()
    if (diff <= 0) { pixCountdown.value = 'Expirado'; return }
    const mins = Math.floor(diff / 60_000)
    const secs = Math.floor((diff % 60_000) / 1000)
    pixCountdown.value = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/* ============================================================================
   Ações
============================================================================ */
async function copyToClipboard(text: string, label = 'Copiado') {
    try {
        await navigator.clipboard.writeText(text)
        notify.success(label)
    } catch {
        notify.error('Não foi possível copiar')
    }
}

function openWhatsApp() {
    const wpp = (store.value as any)?.settings?.whatsapp_number
    if (!wpp) { notify.error('Loja sem WhatsApp cadastrado'); return }
    const phone = wpp.replace(/\D/g, '')
    const msg = encodeURIComponent(
        `Olá! Gostaria de tirar uma dúvida sobre o pedido *#${order.value?.order_number}*.`,
    )
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
}

function trackShipping() {
    const code = order.value?.tracking_code
    if (!code) return
    window.open(`https://rastreamento.correios.com.br/app/index.php?objeto=${code}`, '_blank')
}

function goToStore() {
    router.push({ name: 'storefront', params: { storeSlug: route.params.storeSlug } })
}

async function printOrder() {
    window.print()
}

/* ============================================================================
   Lifecycle
============================================================================ */
onMounted(async () => {
    await loadOrder()
    if (order.value) {
        subscribeRealtime()
        updateCountdown()
        countdownTimer = window.setInterval(updateCountdown, 1000)
    }
})

onUnmounted(() => {
    unsubscribeRealtime()
    if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
    <div class="order-status-page">
        <!-- ================= Loading ================= -->
        <div v-if="loading" class="d-flex flex-column align-center justify-center py-16">
            <v-progress-circular indeterminate :color="themeColor" size="64" width="4" />
            <div class="text-body-2 text-medium-emphasis mt-4">Carregando seu pedido...</div>
        </div>

        <!-- ================= Erros ================= -->
        <v-container v-else-if="errorCode" class="py-12" max-width="600">
            <v-card rounded="xl" flat border class="pa-8 text-center">
                <v-avatar :color="errorCode === 'NETWORK' ? 'warning' : 'error'" variant="tonal" size="72" class="mb-4">
                    <v-icon size="36">
                        {{ errorCode === 'NETWORK' ? 'mdi-wifi-off' : 'mdi-package-variant-remove' }}
                    </v-icon>
                </v-avatar>
                <h2 class="text-h5 font-weight-black mb-2">
                    {{ errorCode === 'NOT_FOUND' ? 'Pedido não encontrado' :
                        errorCode === 'INVALID_TOKEN' ? 'Link inválido' : 'Erro de conexão' }}
                </h2>
                <p class="text-body-2 text-medium-emphasis mb-6">
                    {{ errorCode === 'NOT_FOUND'
                        ? 'Verifique o número do pedido ou o link que você recebeu.'
                        : errorCode === 'INVALID_TOKEN'
                            ? 'O link de acompanhamento está incompleto ou expirou.'
                            : 'Não conseguimos carregar seu pedido agora. Tente novamente.' }}
                </p>
                <div class="d-flex justify-center ga-2 flex-wrap">
                    <v-btn variant="tonal" class="text-none" prepend-icon="mdi-refresh" @click="loadOrder">
                        Tentar novamente
                    </v-btn>
                    <v-btn :color="themeColor" variant="flat" class="text-none" prepend-icon="mdi-storefront"
                        @click="goToStore">
                        Ir para a loja
                    </v-btn>
                </div>
            </v-card>
        </v-container>

        <!-- ================= Conteúdo ================= -->
        <v-container v-else-if="order" class="py-6 py-md-8" max-width="960">
            <!-- Cabeçalho -->
            <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
                <div>
                    <div class="text-caption text-medium-emphasis">Pedido</div>
                    <div class="d-flex align-center ga-2">
                        <h1 class="text-h5 text-md-h4 font-weight-black">#{{ order.order_number }}</h1>
                        <v-btn icon="mdi-content-copy" variant="text" size="x-small"
                            @click="copyToClipboard(order.order_number, 'Número copiado')" />
                    </div>
                    <div class="text-caption text-medium-emphasis">
                        Feito em {{ fmtDateTime(order.created_at) }} · atualizado {{ fmtRelative(order.updated_at) }}
                    </div>
                </div>

                <div class="d-flex ga-2 no-print">
                    <v-btn variant="text" size="small" class="text-none" prepend-icon="mdi-printer-outline"
                        @click="printOrder">
                        Imprimir
                    </v-btn>
                    <v-btn v-if="(store as any)?.settings?.whatsapp_number" color="success" variant="tonal"
                        size="small" class="text-none" prepend-icon="mdi-whatsapp" @click="openWhatsApp">
                        Falar com a loja
                    </v-btn>
                </div>
            </div>

            <!-- Card principal de status -->
            <v-card rounded="xl" flat border class="status-hero pa-6 pa-md-8 mb-6"
                :class="`status-${statusData?.color}`">
                <div class="d-flex align-center ga-4 flex-wrap">
                    <v-avatar :color="statusData?.color" variant="tonal" size="72">
                        <v-icon size="36">{{ statusData?.icon }}</v-icon>
                    </v-avatar>
                    <div class="flex-grow-1 min-width-0">
                        <v-chip :color="statusData?.color" size="small" variant="flat" class="mb-2 font-weight-bold">
                            {{ statusData?.label }}
                        </v-chip>
                        <h2 class="text-h6 font-weight-black">
                            {{ statusData?.customerMsg }}
                        </h2>
                    </div>
                </div>

                <!-- Timeline -->
                <div class="timeline mt-6">
                    <div v-for="(step, i) in timelineSteps" :key="step.key" class="timeline-step" :class="{
                        'is-done': step.done,
                        'is-active': step.active,
                        'is-cancelled': step.cancelled,
                    }">
                        <div class="timeline-node">
                            <v-icon size="18">
                                {{ step.cancelled ? 'mdi-close' : step.done ? 'mdi-check' : step.icon }}
                            </v-icon>
                        </div>
                        <div class="timeline-content">
                            <div class="text-body-2 font-weight-bold">{{ step.title }}</div>
                            <div class="text-caption text-medium-emphasis">
                                <template v-if="step.cancelled">—</template>
                                <template v-else-if="step.date">{{ fmtDateTime(step.date) }}</template>
                                <template v-else-if="step.active">em andamento</template>
                                <template v-else>aguardando</template>
                            </div>
                        </div>
                        <div v-if="i < timelineSteps.length - 1" class="timeline-connector" />
                    </div>
                </div>
            </v-card>

            <!-- PIX pendente -->
            <v-card v-if="showPixDetails" rounded="xl" flat border color="warning" variant="tonal" class="pa-6 mb-6">
                <div class="d-flex align-center ga-3 mb-4">
                    <v-icon size="32">mdi-qrcode</v-icon>
                    <div>
                        <div class="text-h6 font-weight-black">Finalize seu pagamento via PIX</div>
                        <div class="text-caption">
                            <template v-if="!pixExpired">
                                Expira em <strong>{{ pixCountdown }}</strong>
                            </template>
                            <template v-else>
                                <v-chip color="error" size="x-small" variant="flat">Código expirado</v-chip>
                            </template>
                        </div>
                    </div>
                </div>

                <div v-if="!pixExpired" class="d-flex flex-column flex-md-row ga-4 align-md-center">
                    <div class="pix-qr-wrapper">
                        <img :src="`data:image/png;base64,${order.payment?.pix_qr_code}`" alt="QR Code PIX"
                            class="pix-qr" />
                    </div>
                    <div class="flex-grow-1">
                        <div class="text-body-2 font-weight-bold mb-2">Ou copie o código PIX:</div>
                        <v-textarea :model-value="order.payment?.pix_qr_code" readonly rows="3" variant="outlined"
                            density="compact" hide-details class="mb-3 pix-code" />
                        <v-btn block color="warning" variant="flat" class="text-none" prepend-icon="mdi-content-copy"
                            @click="copyToClipboard(order.payment?.pix_qr_code ?? '', 'Código PIX copiado')">
                            Copiar código PIX
                        </v-btn>
                        <div class="text-caption text-medium-emphasis mt-2">
                            💡 Abra o app do seu banco, escolha PIX Copia e Cola e cole o código.
                        </div>
                    </div>
                </div>
            </v-card>

            <!-- Boleto pendente -->
            <v-card v-if="showBoletoDetails" rounded="xl" flat border color="warning" variant="tonal" class="pa-6 mb-6">
                <div class="d-flex align-center ga-3 mb-4">
                    <v-icon size="32">mdi-barcode</v-icon>
                    <div class="flex-grow-1">
                        <div class="text-h6 font-weight-black">Boleto disponível</div>
                        <div class="text-caption">Pague em qualquer banco ou lotérica até o vencimento.</div>
                    </div>
                </div>

                <div v-if="order.payment?.boleto_barcode" class="mb-3">
                    <div class="text-caption font-weight-bold mb-1">Linha digitável:</div>
                    <v-text-field :model-value="order.payment.boleto_barcode" readonly variant="outlined"
                        density="compact" hide-details>
                        <template #append-inner>
                            <v-btn icon="mdi-content-copy" variant="text" size="small"
                                @click="copyToClipboard(order.payment?.boleto_barcode ?? '', 'Linha copiada')" />
                        </template>
                    </v-text-field>
                </div>

                <v-btn block color="warning" variant="flat" class="text-none" prepend-icon="mdi-file-download-outline"
                    :href="order.payment?.boleto_url ?? '#'" target="_blank">
                    Baixar boleto (PDF)
                </v-btn>
            </v-card>

            <!-- Rastreio -->
            <v-card v-if="order.tracking_code && order.status !== 'CANCELLED' && order.status !== 'REFUNDED'"
                rounded="xl" flat border color="primary" variant="tonal" class="pa-4 mb-6">
                <div class="d-flex align-center ga-3 flex-wrap">
                    <v-icon size="28">mdi-truck-fast-outline</v-icon>
                    <div class="flex-grow-1 min-width-0">
                        <div class="text-body-2 font-weight-bold">Código de rastreio</div>
                        <div class="text-caption font-mono">{{ order.tracking_code }}</div>
                    </div>
                    <v-btn color="primary" variant="flat" size="small" class="text-none"
                        prepend-icon="mdi-map-marker-path" @click="trackShipping">
                        Rastrear
                    </v-btn>
                </div>
            </v-card>

            <!-- Grid: itens + resumo -->
            <v-row>
                <!-- Itens -->
                <v-col cols="12" md="7">
                    <v-card rounded="xl" flat border class="pa-4 pa-md-6">
                        <h3 class="text-subtitle-1 font-weight-black mb-4">
                            <v-icon size="20" class="mr-1">mdi-package-variant-closed</v-icon>
                            Itens do pedido ({{ order.items.length }})
                        </h3>

                        <div class="d-flex flex-column ga-3">
                            <div v-for="item in order.items" :key="item.id" class="order-item d-flex ga-3 align-start">
                                <v-avatar :image="item.product_image ?? undefined" size="64" rounded="lg"
                                    color="grey-lighten-3">
                                    <v-icon v-if="!item.product_image" color="grey">mdi-image-off-outline</v-icon>
                                </v-avatar>

                                <div class="flex-grow-1 min-width-0">
                                    <div class="text-body-2 font-weight-bold text-truncate">
                                        {{ item.product_name }}
                                    </div>
                                    <div v-if="item.attributes_snapshot && Object.keys(item.attributes_snapshot).length"
                                        class="text-caption text-medium-emphasis">
                                        <span v-for="(v, k) in item.attributes_snapshot" :key="k" class="mr-2">
                                            <strong>{{ k }}:</strong> {{ v }}
                                        </span>
                                    </div>
                                    <div class="text-caption text-medium-emphasis mt-1">
                                        {{ item.quantity }} × {{ brl(item.unit_price) }}
                                    </div>
                                </div>

                                <div class="text-body-2 font-weight-bold">
                                    {{ brl(item.total) }}
                                </div>
                            </div>
                        </div>
                    </v-card>

                    <!-- Endereço -->
                    <v-card v-if="order.address" rounded="xl" flat border class="pa-4 pa-md-6 mt-4">
                        <h3 class="text-subtitle-1 font-weight-black mb-3">
                            <v-icon size="20" class="mr-1">mdi-map-marker-outline</v-icon>
                            Endereço de entrega
                        </h3>
                        <div class="text-body-2">
                            {{ order.address.street }}, {{ order.address.number }}
                            <span v-if="order.address.complement"> — {{ order.address.complement }}</span>
                        </div>
                        <div class="text-body-2 text-medium-emphasis">
                            {{ order.address.neighborhood }} · {{ order.address.city }}/{{ order.address.state }}
                        </div>
                        <div class="text-caption text-medium-emphasis">
                            CEP {{ order.address.zipcode }}
                        </div>
                    </v-card>
                </v-col>

                <!-- Resumo -->
                <v-col cols="12" md="5">
                    <v-card rounded="xl" flat border class="pa-4 pa-md-6 sticky-summary">
                        <h3 class="text-subtitle-1 font-weight-black mb-4">
                            <v-icon size="20" class="mr-1">mdi-receipt-text-outline</v-icon>
                            Resumo
                        </h3>

                        <div class="d-flex justify-space-between mb-2 text-body-2">
                            <span class="text-medium-emphasis">Subtotal</span>
                            <span>{{ brl(order.subtotal) }}</span>
                        </div>
                        <div v-if="Number(order.discount) > 0" class="d-flex justify-space-between mb-2 text-body-2">
                            <span class="text-medium-emphasis">Desconto</span>
                            <span class="text-success">− {{ brl(order.discount) }}</span>
                        </div>
                        <div class="d-flex justify-space-between mb-2 text-body-2">
                            <span class="text-medium-emphasis">Frete</span>
                            <span>
                                {{ Number(order.shipping) === 0 ? 'Grátis' : brl(order.shipping) }}
                            </span>
                        </div>
                        <v-divider class="my-3" />
                        <div class="d-flex justify-space-between align-center">
                            <span class="text-body-1 font-weight-bold">Total</span>
                            <span class="text-h5 font-weight-black"
                                :style="{ color: `rgb(var(--v-theme-${themeColor}))` }">
                                {{ brl(order.total) }}
                            </span>
                        </div>

                        <!-- Pagamento -->
                        <div v-if="order.payment" class="mt-4 pa-3 rounded-lg bg-surface-variant">
                            <div class="d-flex align-center ga-2 mb-1">
                                <v-icon size="18">{{ paymentMethodLabel[order.payment.method]?.icon ??
                                    'mdi-credit-card-outline'
                                }}</v-icon>
                                <span class="text-body-2 font-weight-bold">
                                    {{ paymentMethodLabel[order.payment.method]?.label ?? order.payment.method }}
                                </span>
                                <v-spacer />
                                <v-chip :color="paymentData?.color" size="x-small" variant="tonal">
                                    {{ paymentData?.label }}
                                </v-chip>
                            </div>
                            <div v-if="order.payment.installments && order.payment.installments > 1"
                                class="text-caption text-medium-emphasis">
                                {{ order.payment.installments }}× de {{ brl(Number(order.total) /
                                    order.payment.installments) }}
                            </div>
                            <div v-if="order.payment.paid_at" class="text-caption text-medium-emphasis">
                                Pago em {{ fmtDateTime(order.payment.paid_at) }}
                            </div>
                        </div>

                        <!-- Cliente -->
                        <div v-if="order.customer" class="mt-4">
                            <div class="text-caption text-medium-emphasis mb-1">Cliente</div>
                            <div class="text-body-2 font-weight-bold">{{ order.customer.full_name }}</div>
                            <div class="text-caption text-medium-emphasis">{{ order.customer.email }}</div>
                            <div v-if="order.customer.phone" class="text-caption text-medium-emphasis">
                                {{ order.customer.phone }}
                            </div>
                        </div>

                        <!-- Notas -->
                        <div v-if="order.notes" class="mt-4">
                            <div class="text-caption text-medium-emphasis mb-1">Observações</div>
                            <div class="text-body-2 font-italic">{{ order.notes }}</div>
                        </div>
                    </v-card>
                </v-col>
            </v-row>

            <!-- CTA final -->
            <div class="text-center mt-8 no-print">
                <v-btn :color="themeColor" variant="tonal" size="large" class="text-none" rounded="pill"
                    prepend-icon="mdi-storefront-outline" @click="goToStore">
                    Voltar para a loja
                </v-btn>
            </div>
        </v-container>
    </div>
</template>

<style scoped>
.order-status-page {
    min-height: 100dvh;
    background: rgb(var(--v-theme-background));
}

.min-width-0 {
    min-width: 0;
}

.font-mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
}

/* Status hero */
.status-hero {
    position: relative;
    overflow: hidden;
}

.status-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.03;
    pointer-events: none;
    background: radial-gradient(circle at top right, currentColor, transparent 60%);
}

/* Timeline */
.timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    position: relative;
}

.timeline-step {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 12px;
    padding: 8px 0;
    position: relative;
    align-items: center;
}

.timeline-node {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--v-theme-on-surface), 0.06);
    color: rgba(var(--v-theme-on-surface), 0.4);
    z-index: 2;
    transition: all 0.3s ease;
}

.timeline-step.is-done .timeline-node {
    background: rgb(var(--v-theme-success));
    color: white;
}

.timeline-step.is-active .timeline-node {
    background: rgb(var(--v-theme-warning));
    color: white;
    animation: pulse 2s infinite;
}

.timeline-step.is-cancelled .timeline-node {
    background: rgba(var(--v-theme-error), 0.15);
    color: rgb(var(--v-theme-error));
}

.timeline-connector {
    position: absolute;
    left: 17px;
    top: 44px;
    bottom: -8px;
    width: 2px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    z-index: 1;
}

.timeline-step.is-done+.timeline-step .timeline-connector,
.timeline-step.is-done .timeline-connector {
    background: rgb(var(--v-theme-success));
}

@keyframes pulse {

    0%,
    100% {
        box-shadow: 0 0 0 0 rgba(var(--v-theme-warning), 0.4);
    }

    50% {
        box-shadow: 0 0 0 8px rgba(var(--v-theme-warning), 0);
    }
}

/* PIX */
.pix-qr-wrapper {
    padding: 12px;
    background: white;
    border-radius: 12px;
    align-self: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.pix-qr {
    width: 180px;
    height: 180px;
    display: block;
}

.pix-code :deep(textarea) {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.75rem !important;
    word-break: break-all;
}

/* Order items */
.order-item {
    padding: 12px 0;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.order-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

/* Sticky summary */
@media (min-width: 960px) {
    .sticky-summary {
        position: sticky;
        top: 24px;
    }
}

.bg-surface-variant {
    background: rgba(var(--v-theme-surface-variant), 0.4);
}

/* Impressão */
@media print {
    .no-print {
        display: none !important;
    }

    .order-status-page {
        background: white;
    }

    .v-card {
        box-shadow: none !important;
        border: 1px solid #ddd !important;
    }
}
</style>
