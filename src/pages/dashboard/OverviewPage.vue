<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { useRealtime } from '@/composables/useRealtime'

import { productsService } from '@/services/products.service'
import { ordersService } from '@/services/orders.service'
import { inventoryService } from '@/services/inventory.service'
import { supabase } from '@/lib/supabase'

import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue'
import OnboardingChecklist from '@/components/dashboard/OnboardingChecklist.vue'

import type { Order, Product, Category } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Stores                                                                    */
/* -------------------------------------------------------------------------- */

const router = useRouter()
const auth = useAuthStore()
const notify = useNotifications()

const { profile, currentStore, currentStoreId } = storeToRefs(auth)

/* -------------------------------------------------------------------------- */
/*  Data fetching                                                             */
/*  Cada query é isolada — falha em uma não derruba a página inteira          */
/* -------------------------------------------------------------------------- */

/** Produtos (todos, ativos e não-deletados) */
const productsQuery = useSupabaseQuery(
    () => productsService.listAdvanced({ page: 1, pageSize: 200 }),
    { watchSource: [currentStoreId] },
)

/** Categorias da loja */
const categoriesQuery = useSupabaseQuery(async () => {
    const { data } = await supabase
        .from('categories')
        .select('id, name, is_active')
        .is('deleted_at', null)
    return (data ?? []) as Category[]
}, { watchSource: [currentStoreId] })

/** Estatísticas de pedidos (total, pagos, pendentes, receita) */
const orderStatsQuery = useSupabaseQuery(
    () => ordersService.getStats(),
    { watchSource: [currentStoreId] },
)

/** Últimos 5 pedidos */
const recentOrdersQuery = useSupabaseQuery(async () => {
    const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, total, created_at, customer:customers(full_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5)
    return (data ?? []) as (Order & { customer: { full_name: string } | null })[]
}, { watchSource: [currentStoreId] })

/** Saldos de estoque de todos os produtos */
const stockBalancesQuery = useSupabaseQuery(async () => {
    const products = productsQuery.data.value?.data ?? []
    if (!products.length) return {}
    return inventoryService.getBalances(products.map(p => p.id))
}, { watchSource: [productsQuery.data] })

/* -------------------------------------------------------------------------- */
/*  Realtime — recarrega estatísticas quando chega novo pedido                */
/* -------------------------------------------------------------------------- */

useRealtime<Order>({
    table: 'orders',
    event: 'INSERT',
    scopedToStore: true,
    onChange: (payload: any) => {
        notify.success(`🎉 Novo pedido: ${payload.new.order_number}`,
        )
        orderStatsQuery.refresh()
        recentOrdersQuery.refresh()
    },
})

/* -------------------------------------------------------------------------- */
/*  Métricas computadas                                                       */
/* -------------------------------------------------------------------------- */

const products = computed<Product[]>(() => productsQuery.data.value?.data ?? [])
const categories = computed<Category[]>(() => categoriesQuery.data.value ?? [])
const stockMap = computed<Record<string, number>>(() => stockBalancesQuery.data.value ?? {})
const orderStats = computed(() => orderStatsQuery.data.value ?? { total: 0, paid: 0, pending: 0, revenue: 0 })

const activeProducts = computed(() =>
    products.value.filter(p => p.status === 'ACTIVE' && !p.deleted_at).length,
)

const totalStock = computed(() =>
    Object.values(stockMap.value).reduce((acc, qty) => acc + qty, 0),
)

const LOW_STOCK_THRESHOLD = 5
const lowStockProducts = computed(() =>
    products.value.filter(p =>
        p.status === 'ACTIVE' &&
        (stockMap.value[p.id] ?? 0) <= LOW_STOCK_THRESHOLD,
    ),
)

const anyLoading = computed(() =>
    productsQuery.loading.value ||
    categoriesQuery.loading.value ||
    orderStatsQuery.loading.value,
)

/* -------------------------------------------------------------------------- */
/*  Onboarding — checklist real baseado nos dados                             */
/* -------------------------------------------------------------------------- */

interface OnboardingStep {
    key: string
    title: string
    description: string
    done: boolean
    action?: { label: string; to: any }
}

const onboardingSteps = computed<OnboardingStep[]>(() => [
    {
        key: 'store-info',
        title: 'Informações da loja',
        description: 'Nome, logo e dados de contato',
        done: !!(currentStore.value?.logo_url && currentStore.value?.email),
        action: { label: 'Editar', to: { name: 'settings' } },
    },
    {
        key: 'categories',
        title: 'Criar categorias',
        description: 'Organize seu catálogo em ao menos 1 categoria',
        done: categories.value.length > 0,
        action: { label: 'Criar', to: { name: 'categories' } },
    },
    {
        key: 'products',
        title: 'Cadastrar produtos',
        description: 'Publique pelo menos 1 produto ativo',
        done: activeProducts.value > 0,
        action: { label: 'Novo produto', to: { name: 'products' } },
    },
    {
        key: 'payment',
        title: 'Configurar pagamentos',
        description: 'Conecte um gateway para receber vendas',
        done: false, // TODO: verificar `integrations` quando disponível
        action: { label: 'Conectar', to: { name: 'integrations' } },
    },
])

const completedSteps = computed(() => onboardingSteps.value.filter(s => s.done).length)
const completion = computed(() => Math.round((completedSteps.value / onboardingSteps.value.length) * 100))
const readyToLaunch = computed(() => completion.value >= 75)

/* -------------------------------------------------------------------------- */
/*  URL pública da vitrine                                                    */
/* -------------------------------------------------------------------------- */

const publicUrl = computed(() =>
    currentStore.value?.slug
        ? `${window.location.origin}/s/${currentStore.value.slug}`
        : '',
)

/* -------------------------------------------------------------------------- */
/*  Formatadores                                                              */
/* -------------------------------------------------------------------------- */

const brl = (v: number) => v.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
})
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
})

const statusColor: Record<string, string> = {
    PENDING: 'warning',
    PAID: 'success',
    DELIVERED: 'primary',
    CANCELLED: 'error',
    REFUNDED: 'grey',
}
const statusLabel: Record<string, string> = {
    PENDING: 'Pendente',
    PAID: 'Pago',
    DELIVERED: 'Entregue',
    CANCELLED: 'Cancelado',
    REFUNDED: 'Reembolsado',
}

/* -------------------------------------------------------------------------- */
/*  Ações                                                                     */
/* -------------------------------------------------------------------------- */

const copying = ref(false)

async function copyPublicUrl() {
    if (!publicUrl.value) return
    copying.value = true
    try {
        await navigator.clipboard.writeText(publicUrl.value)
        notify.success('Link copiado! Cole no WhatsApp ou Instagram 🚀')
    } catch {
        notify.error('Não foi possível copiar o link')
    } finally {
        copying.value = false
    }
}

async function shareOnWhatsApp() {
    if (!publicUrl.value) return
    const text = encodeURIComponent(
        `Confira minha loja online: ${publicUrl.value}`,
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
}

const firstName = computed(() =>
    profile.value?.full_name?.split(' ')[0] ?? 'por aí',
)
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- =========================================================== -->
        <!--  HEADER                                                     -->
        <!-- =========================================================== -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">
                    Olá, {{ firstName }}! 👋
                </h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Veja como está o desempenho de
                    <strong>{{ currentStore?.name ?? 'sua vitrine' }}</strong> hoje.
                </p>
            </div>

            <div class="d-flex ga-3 flex-column flex-sm-row">
                <v-btn v-if="publicUrl" prepend-icon="mdi-eye-outline" variant="outlined" rounded="pill"
                    class="text-none" color="primary" :href="publicUrl" target="_blank">
                    Ver minha vitrine
                </v-btn>
                <v-btn color="primary" prepend-icon="mdi-plus" rounded="pill" elevation="0" class="text-none px-6"
                    @click="router.push({ name: 'products' })">
                    Novo produto
                </v-btn>
            </div>
        </header>

        <!-- =========================================================== -->
        <!--  MÉTRICAS                                                   -->
        <!-- =========================================================== -->
        <v-row>
            <v-col cols="12" sm="6" lg="3">
                <v-skeleton-loader v-if="anyLoading" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Produtos visíveis" :value="activeProducts"
                    icon="mdi-store-check-outline" description="Itens publicados na sua vitrine" color="primary"
                    @click="router.push({ name: 'products' })" />
            </v-col>

            <v-col cols="12" sm="6" lg="3">
                <v-skeleton-loader v-if="anyLoading" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Pedidos pagos" :value="orderStats.paid" icon="mdi-cart-check"
                    :description="`Receita: ${brl(orderStats.revenue)}`" color="success"
                    @click="router.push({ name: 'orders', query: { status: 'PAID' } })" />
            </v-col>

            <v-col cols="12" sm="6" lg="3">
                <v-skeleton-loader v-if="anyLoading" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Itens em estoque" :value="totalStock" icon="mdi-package-variant"
                    :description="`${products.length} SKUs cadastrados`" color="info" />
            </v-col>

            <v-col cols="12" sm="6" lg="3">
                <v-skeleton-loader v-if="anyLoading" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Alerta de estoque" :value="lowStockProducts.length"
                    icon="mdi-alert-octagon-outline" :description="lowStockProducts.length
                        ? 'Produtos que merecem atenção'
                        : 'Tudo em dia! 🎉'" :color="lowStockProducts.length > 0 ? 'warning' : 'grey-lighten-1'"
                    @click="lowStockProducts.length && router.push({ name: 'inventory' })" />
            </v-col>
        </v-row>

        <!-- =========================================================== -->
        <!--  ONBOARDING + PLANO + AÇÕES RÁPIDAS                         -->
        <!-- =========================================================== -->
        <v-row>
            <!--  ONBOARDING CHECKLIST  -->
            <v-col cols="12" lg="7">
                <v-card rounded="xl" border flat class="pa-6 h-100">
                    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-2">
                        <div>
                            <h2 class="text-h6 font-weight-bold">Configuração da loja</h2>
                            <p class="text-caption text-medium-emphasis">
                                Complete os passos para profissionalizar sua venda
                            </p>
                        </div>
                        <v-chip :color="readyToLaunch ? 'success' : 'warning'" variant="tonal" size="small">
                            {{ completion }}% concluído
                        </v-chip>
                    </div>

                    <v-progress-linear :model-value="completion" :color="readyToLaunch ? 'success' : 'warning'"
                        height="8" rounded class="mb-6" />

                    <OnboardingChecklist :steps="onboardingSteps"
                        @action="(step) => step.action && router.push(step.action.to)" />

                    <v-alert v-if="!readyToLaunch" icon="mdi-rocket-launch-outline" color="primary" variant="tonal"
                        rounded="lg" class="mt-6 border-dashed">
                        <div class="text-subtitle-2 font-weight-bold">Quase lá!</div>
                        <div class="text-caption">
                            Sua vitrine precisa de pelo menos um produto ativo e uma categoria
                            para ser publicada com sucesso.
                        </div>
                    </v-alert>

                    <v-alert v-else icon="mdi-check-decagram" color="success" variant="tonal" rounded="lg" class="mt-6">
                        <div class="text-subtitle-2 font-weight-bold">Sua vitrine está pronta! 🎉</div>
                        <div class="text-caption">
                            Compartilhe o link para começar a receber pedidos.
                        </div>
                    </v-alert>
                </v-card>
            </v-col>

            <!--  LATERAL DIREITA  -->
            <v-col cols="12" lg="5">
                <!--  PLANO ATIVO  -->
                <v-card rounded="xl" border flat class="pa-6 mb-6 plan-card">
                    <div class="d-flex justify-space-between align-center mb-4">
                        <span class="text-overline font-weight-bold opacity-70">Seu plano</span>
                        <v-chip color="primary" size="x-small" variant="flat" rounded="pill">
                            Ativo
                        </v-chip>
                    </div>

                    <h3 class="text-h5 font-weight-black">Free Trial</h3>
                    <p class="text-body-2 text-medium-emphasis mb-6">
                        Ideal para quem está começando a crescer.
                    </p>

                    <div class="d-flex justify-space-between text-caption mb-2">
                        <span class="font-weight-bold">Capacidade do catálogo</span>
                        <span class="text-medium-emphasis">
                            {{ products.length }} / 50 produtos
                        </span>
                    </div>
                    <v-progress-linear :model-value="(products.length / 50) * 100"
                        :color="products.length >= 45 ? 'warning' : 'primary'" height="6" rounded />

                    <div class="mt-6">
                        <v-btn block variant="tonal" color="primary" class="text-none" rounded="lg"
                            prepend-icon="mdi-arrow-up-bold-circle-outline" @click="router.push({ name: 'plans' })">
                            Fazer upgrade
                        </v-btn>
                    </div>
                </v-card>

                <!--  AÇÕES RÁPIDAS  -->
                <v-card rounded="xl" border flat class="pa-6 mb-6">
                    <h3 class="text-subtitle-1 font-weight-bold mb-4">Ações rápidas</h3>

                    <v-list class="pa-0" bg-color="transparent">
                        <v-list-item prepend-icon="mdi-content-copy" title="Copiar link da vitrine"
                            subtitle="Compartilhe em qualquer lugar" rounded="lg" class="border mb-2"
                            :disabled="!publicUrl || copying" @click="copyPublicUrl" />
                        <v-list-item prepend-icon="mdi-whatsapp" title="Compartilhar no WhatsApp"
                            subtitle="Envie sua vitrine para clientes" rounded="lg" class="border mb-2"
                            :disabled="!publicUrl" @click="shareOnWhatsApp" />
                        <v-list-item prepend-icon="mdi-account-multiple-plus-outline" title="Convidar equipe"
                            subtitle="Adicione vendedores e admins" rounded="lg" class="border"
                            @click="router.push({ name: 'team' })" />
                    </v-list>
                </v-card>

                <!--  ÚLTIMOS PEDIDOS  -->
                <v-card rounded="xl" border flat class="pa-6">
                    <div class="d-flex align-center justify-space-between mb-4">
                        <h3 class="text-subtitle-1 font-weight-bold">Últimos pedidos</h3>
                        <v-btn variant="text" size="small" class="text-none" @click="router.push({ name: 'orders' })">
                            Ver todos
                        </v-btn>
                    </div>

                    <template v-if="recentOrdersQuery.loading.value">
                        <v-skeleton-loader type="list-item-two-line" v-for="i in 3" :key="i" />
                    </template>

                    <template v-else-if="(recentOrdersQuery.data.value ?? []).length === 0">
                        <div class="text-center py-6">
                            <v-icon size="48" color="grey-lighten-1">mdi-cart-outline</v-icon>
                            <p class="text-body-2 text-medium-emphasis mt-2">
                                Nenhum pedido ainda.<br>
                                Compartilhe sua vitrine para começar!
                            </p>
                        </div>
                    </template>

                    <v-list v-else class="pa-0" bg-color="transparent">
                        <v-list-item v-for="order in recentOrdersQuery.data.value" :key="order.id"
                            class="border mb-2 rounded-lg px-3"
                            @click="router.push({ name: 'order-detail', params: { id: order.id } })">
                            <template #prepend>
                                <v-avatar color="grey-lighten-4" size="40">
                                    <v-icon color="grey-darken-2">mdi-receipt-text-outline</v-icon>
                                </v-avatar>
                            </template>
                            <v-list-item-title class="font-weight-medium">
                                #{{ order.order_number }}
                            </v-list-item-title>
                            <v-list-item-subtitle>
                                {{ order.customer?.full_name ?? 'Cliente avulso' }} · {{ fmtDate(order.created_at) }}
                            </v-list-item-subtitle>
                            <template #append>
                                <div class="text-right">
                                    <div class="font-weight-bold text-body-2">
                                        {{ brl(Number(order.total)) }}
                                    </div>
                                    <v-chip size="x-small" variant="tonal" :color="statusColor[order.status]"
                                        class="mt-1">
                                        {{ statusLabel[order.status] }}
                                    </v-chip>
                                </div>
                            </template>
                        </v-list-item>
                    </v-list>
                </v-card>
            </v-col>
        </v-row>

        <!-- =========================================================== -->
        <!--  ALERTA DE ESTOQUE BAIXO (só aparece quando relevante)      -->
        <!-- =========================================================== -->
        <v-card v-if="lowStockProducts.length > 0" rounded="xl" border flat class="pa-6" color="warning"
            variant="tonal">
            <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
                <div class="d-flex align-center ga-3">
                    <v-icon size="28" color="warning">mdi-alert-octagon</v-icon>
                    <div>
                        <h3 class="text-subtitle-1 font-weight-bold">Produtos com estoque baixo</h3>
                        <p class="text-caption text-medium-emphasis">
                            {{ lowStockProducts.length }} produto(s) com {{ LOW_STOCK_THRESHOLD }} ou menos unidades
                        </p>
                    </div>
                </div>
                <v-btn variant="text" size="small" class="text-none" @click="router.push({ name: 'inventory' })">
                    Gerenciar estoque
                </v-btn>
            </div>

            <v-row dense>
                <v-col v-for="p in lowStockProducts.slice(0, 6)" :key="p.id" cols="12" sm="6" md="4">
                    <v-card flat border rounded="lg" class="pa-3 d-flex align-center ga-3 cursor-pointer"
                        @click="router.push({ name: 'product-detail', params: { id: p.id } })">
                        <v-avatar color="warning" variant="tonal" size="36">
                            <v-icon>mdi-package-variant-closed</v-icon>
                        </v-avatar>
                        <div class="flex-grow-1 min-width-0">
                            <div class="text-body-2 font-weight-medium text-truncate">
                                {{ p.name }}
                            </div>
                            <div class="text-caption text-medium-emphasis">
                                SKU: {{ p.sku }}
                            </div>
                        </div>
                        <v-chip size="small" color="warning" variant="flat">
                            {{ stockMap[p.id] ?? 0 }} un
                        </v-chip>
                    </v-card>
                </v-col>
            </v-row>
        </v-card>

    </div>
</template>

<style scoped>
.border-dashed {
    border: 1px dashed currentColor !important;
}

.plan-card {
    background: linear-gradient(135deg,
            rgb(var(--v-theme-primary), 0.04) 0%,
            rgb(var(--v-theme-primary), 0.08) 100%);
}

.cursor-pointer {
    cursor: pointer;
}

.min-width-0 {
    min-width: 0;
}

.v-card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

/* Efeito sutil de elevação em cards clicáveis */
.cursor-pointer:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
</style>
