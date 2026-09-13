<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { useRealtime } from '@/composables/useRealtime'
import { useAsyncAction } from '@/composables/useAsyncAction'

import { ordersService } from '@/services/orders.service'
import { supabase } from '@/lib/supabase'

import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue'
import EmptyState from '@/components/base/EmptyState.vue'

import type { Order, OrderStatus, PaymentStatus, Customer } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const router = useRouter()
const auth = useAuthStore()
const notify = useNotifications()
const { currentStoreId, currentRole } = storeToRefs(auth)

const canManage = computed(() =>
    currentRole.value && ['OWNER', 'ADMIN', 'MANAGER', 'SELLER'].includes(currentRole.value),
)

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface OrderRow extends Order {
    customer: Pick<Customer, 'id' | 'full_name' | 'email' | 'phone'> | null
    payments: { status: PaymentStatus; gateway: string; paid_at: string | null }[]
    items_count: { count: number }[]
}

/* -------------------------------------------------------------------------- */
/*  Formatters & metadata                                                     */
/* -------------------------------------------------------------------------- */

const brl = (v: number | string | null | undefined) =>
    Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
})

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short',
})

const fmtRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.round(diff / 60_000)
    if (mins < 1) return 'agora'
    if (mins < 60) return `${mins} min atrás`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h atrás`
    const days = Math.round(hours / 24)
    if (days < 7) return `${days}d atrás`
    return fmtDate(iso)
}

interface StatusMeta {
    label: string
    color: string
    icon: string
    description: string
}

const statusMeta: Record<OrderStatus, StatusMeta> = {
    PENDING: { label: 'Pendente', color: 'warning', icon: 'mdi-clock-outline', description: 'Aguardando pagamento' },
    PAID: { label: 'Pago', color: 'success', icon: 'mdi-check-circle-outline', description: 'Pagamento confirmado' },
    DELIVERED: { label: 'Entregue', color: 'primary', icon: 'mdi-truck-delivery-outline', description: 'Entregue ao cliente' },
    CANCELLED: { label: 'Cancelado', color: 'error', icon: 'mdi-close-circle-outline', description: 'Cancelado antes do pagamento' },
    REFUNDED: { label: 'Reembolsado', color: 'grey', icon: 'mdi-cash-refund', description: 'Estornado após pagamento' },
}

/**
 * Transições de status válidas — regras de negócio do domínio.
 * Ao chegar em PAID, o trigger `on_order_paid` cria SALEs no ledger.
 * Ao chegar em REFUNDED, o trigger cria CANCELLATIONs (repõe estoque).
 */
const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
    PENDING: ['PAID', 'CANCELLED'],
    PAID: ['DELIVERED', 'REFUNDED'],
    DELIVERED: ['REFUNDED'],
    CANCELLED: [],
    REFUNDED: [],
}

const paymentStatusMeta: Record<PaymentStatus, { label: string; color: string }> = {
    PENDING: { label: 'Pendente', color: 'warning' },
    APPROVED: { label: 'Aprovado', color: 'success' },
    DECLINED: { label: 'Recusado', color: 'error' },
    REFUNDED: { label: 'Estornado', color: 'grey' },
    CHARGEBACK: { label: 'Chargeback', color: 'error' },
}

/* -------------------------------------------------------------------------- */
/*  Filtros                                                                   */
/* -------------------------------------------------------------------------- */

interface Filters {
    search: string
    status: OrderStatus | ''
    dateFrom: string
    dateTo: string
    customerId: string | null
}

const filters = reactive<Filters>({
    search: '',
    status: (router.currentRoute.value.query.status as OrderStatus) || '',
    dateFrom: '',
    dateTo: '',
    customerId: null,
})

const pagination = reactive({ page: 1, pageSize: 25 })
const totalItems = ref(0)

const sortBy = ref('created_at')
const sortAsc = ref(false)

/* -------------------------------------------------------------------------- */
/*  Modo de visualização                                                      */
/* -------------------------------------------------------------------------- */

const viewMode = ref<'table' | 'kanban'>('kanban')

/* -------------------------------------------------------------------------- */
/*  Query — lista de pedidos                                                  */
/* -------------------------------------------------------------------------- */

const ordersQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return []

    const from = (pagination.page - 1) * pagination.pageSize
    const to = from + pagination.pageSize - 1

    let query = supabase
        .from('orders')
        .select(
            `*,
       customer:customers(id, full_name, email, phone),
       payments:order_payments(status, gateway, paid_at),
       items_count:order_items(count)`,
            { count: 'exact' },
        )
        .is('deleted_at', null)
        .order(sortBy.value, { ascending: sortAsc.value })
        .range(from, to)

    if (filters.status) query = query.eq('status', filters.status)
    if (filters.customerId) query = query.eq('customer_id', filters.customerId)
    if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00`)
    if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59`)
    if (filters.search) {
        // busca por order_number OU nome do cliente (via .or)
        query = query.or(
            `order_number.ilike.%${filters.search}%,`
            + `customer.full_name.ilike.%${filters.search}%`,
        )
    }

    const { data, error, count } = await query
    if (error) throw error
    totalItems.value = count ?? 0
    return (data ?? []) as unknown as OrderRow[]
}, { watchSource: [currentStoreId] })

const rows = computed(() => ordersQuery.data.value ?? [])

/* -------------------------------------------------------------------------- */
/*  Métricas do topo                                                          */
/* -------------------------------------------------------------------------- */

const metricsQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return null

    const { data } = await supabase
        .from('orders')
        .select('status, total, created_at')
        .is('deleted_at', null)

    const orders = data ?? []
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    return {
        pending: orders.filter(o => o.status === 'PENDING').length,
        paid: orders.filter(o => o.status === 'PAID').length,
        delivered: orders.filter(o => o.status === 'DELIVERED').length,
        monthRevenue: orders
            .filter(o => ['PAID', 'DELIVERED'].includes(o.status)
                && new Date(o.created_at) >= startOfMonth)
            .reduce((s, o) => s + Number(o.total), 0),
        avgTicket: (() => {
            const paid = orders.filter(o => ['PAID', 'DELIVERED'].includes(o.status))
            return paid.length ? paid.reduce((s, o) => s + Number(o.total), 0) / paid.length : 0
        })(),
    }
}, { watchSource: [currentStoreId] })

const metrics = computed(() => metricsQuery.data.value ?? {
    pending: 0, paid: 0, delivered: 0, monthRevenue: 0, avgTicket: 0,
})

/* -------------------------------------------------------------------------- */
/*  Kanban — agrupa por status                                                */
/* -------------------------------------------------------------------------- */

const kanbanColumns: OrderStatus[] = ['PENDING', 'PAID', 'DELIVERED', 'REFUNDED']

const kanbanGroups = computed(() => {
    const groups: Record<OrderStatus, OrderRow[]> = {
        PENDING: [], PAID: [], DELIVERED: [], CANCELLED: [], REFUNDED: [],
    }
    for (const row of rows.value) groups[row.status].push(row)
    return groups
})

/* -------------------------------------------------------------------------- */
/*  Detail dialog                                                             */
/* -------------------------------------------------------------------------- */

const detailDialog = reactive({
    open: false,
    loading: false,
    order: null as any,
})

async function openDetail(orderId: string) {
    detailDialog.open = true
    detailDialog.loading = true
    detailDialog.order = null
    try {
        detailDialog.order = await ordersService.getFull(orderId)
    } catch (e: any) {
        notify.error(e.message ?? 'Erro ao carregar pedido')
        detailDialog.open = false
    } finally {
        detailDialog.loading = false
    }
}

/* -------------------------------------------------------------------------- */
/*  Mudança de status                                                         */
/* -------------------------------------------------------------------------- */

const statusChangeDialog = reactive({
    open: false,
    order: null as OrderRow | null,
    newStatus: null as OrderStatus | null,
    note: '',
})

function askChangeStatus(order: OrderRow, newStatus: OrderStatus) {
    statusChangeDialog.open = true
    statusChangeDialog.order = order
    statusChangeDialog.newStatus = newStatus
    statusChangeDialog.note = ''
}

const statusChangeImpact = computed(() => {
    const next = statusChangeDialog.newStatus
    if (!next) return null
    switch (next) {
        case 'PAID':
            return { type: 'info' as const, text: 'O estoque será decrementado automaticamente (movimentos SALE).' }
        case 'REFUNDED':
            return { type: 'warning' as const, text: 'O estoque será restaurado (movimentos CANCELLATION) e o pagamento marcado como estornado.' }
        case 'DELIVERED':
            return { type: 'success' as const, text: 'O cliente será notificado (se integração de e-mail estiver ativa).' }
        case 'CANCELLED':
            return { type: 'error' as const, text: 'O pedido não poderá voltar a ser processado.' }
        default:
            return null
    }
})

const { execute: confirmChangeStatus, loading: changingStatus } = useAsyncAction(
    async () => {
        if (!statusChangeDialog.order || !statusChangeDialog.newStatus) return

        const orderId = statusChangeDialog.order.id
        const newStatus = statusChangeDialog.newStatus
        const note = statusChangeDialog.note.trim()

        // 1. Atualiza o status — trigger on_order_paid cuida do estoque
        await ordersService.updateStatus(orderId, newStatus)

        // 2. Se marcou como pago, também atualiza order_payments
        if (newStatus === 'PAID') {
            await supabase.from('order_payments')
                .update({ status: 'APPROVED', paid_at: new Date().toISOString() })
                .eq('order_id', orderId)
                .eq('status', 'PENDING')
        } else if (newStatus === 'REFUNDED') {
            await supabase.from('order_payments')
                .update({ status: 'REFUNDED' })
                .eq('order_id', orderId)
                .eq('status', 'APPROVED')
        }

        // 3. Append de observação (se houver)
        if (note) {
            const current = statusChangeDialog.order.notes ?? ''
            const timestamp = new Date().toLocaleString('pt-BR')
            const appended = [
                current,
                `[${timestamp}] ${statusMeta[newStatus].label}: ${note}`,
            ].filter(Boolean).join('\n')
            await supabase.from('orders').update({ notes: appended }).eq('id', orderId)
        }

        statusChangeDialog.open = false
        await Promise.all([ordersQuery.refresh(), metricsQuery.refresh()])
    },
    { successMsg: 'Status atualizado' },
)

/* -------------------------------------------------------------------------- */
/*  Ações rápidas na linha                                                    */
/* -------------------------------------------------------------------------- */

function copyOrderNumber(orderNumber: string) {
    navigator.clipboard.writeText(orderNumber)
        .then(() => notify.success('Número copiado'))
        .catch(() => notify.error('Não foi possível copiar'))
}

function sendWhatsApp(order: OrderRow) {
    if (!order.customer?.phone) {
        notify.error('Cliente sem telefone cadastrado')
        return
    }
    const phone = order.customer.phone.replace(/\D/g, '')
    const text = encodeURIComponent(
        `Olá ${order.customer.full_name}! Sobre seu pedido *#${order.order_number}*...`,
    )
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank')
}

/* -------------------------------------------------------------------------- */
/*  Realtime                                                                  */
/* -------------------------------------------------------------------------- */

useRealtime<Order>({
    table: 'orders',
    event: '*',
    scopedToStore: true,
    onChange: (payload) => {
        if (payload.eventType === 'INSERT') {
            notify.success(`🎉 Novo pedido: #${payload.new.order_number}`)
        }
        ordersQuery.refresh()
        metricsQuery.refresh()
    },
})

/* -------------------------------------------------------------------------- */
/*  Debounce da busca                                                         */
/* -------------------------------------------------------------------------- */

const searchInput = ref('')
let searchDebounce: number | undefined
watch(searchInput, (v) => {
    window.clearTimeout(searchDebounce)
    searchDebounce = window.setTimeout(() => {
        pagination.page = 1
        filters.search = v
    }, 400)
})

/* -------------------------------------------------------------------------- */
/*  Watchers gerais                                                           */
/* -------------------------------------------------------------------------- */

watch(
    [() => filters.status, () => filters.dateFrom, () => filters.dateTo,
    () => filters.customerId, () => pagination.page, () => pagination.pageSize,
    () => sortBy.value, () => sortAsc.value, () => filters.search],
    () => ordersQuery.refresh(),
)

function clearFilters() {
    filters.search = ''
    filters.status = ''
    filters.dateFrom = ''
    filters.dateTo = ''
    filters.customerId = null
    searchInput.value = ''
    pagination.page = 1
}

const hasActiveFilters = computed(() =>
    !!filters.search || !!filters.status || !!filters.dateFrom
    || !!filters.dateTo || !!filters.customerId,
)

/* -------------------------------------------------------------------------- */
/*  Tabela                                                                    */
/* -------------------------------------------------------------------------- */

const headers = [
    { title: 'Pedido', key: 'order_number', sortable: true },
    { title: 'Cliente', key: 'customer', sortable: false },
    { title: 'Data', key: 'created_at', sortable: true },
    { title: 'Itens', key: 'items_count', sortable: false, align: 'center' as const },
    { title: 'Total', key: 'total', sortable: true, align: 'end' as const },
    { title: 'Pagamento', key: 'payment', sortable: false, align: 'center' as const },
    { title: 'Status', key: 'status', sortable: true, align: 'center' as const },
    { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 80 },
]

/* -------------------------------------------------------------------------- */
/*  Exportar CSV                                                              */
/* -------------------------------------------------------------------------- */

function exportCsv() {
    const header = ['Pedido', 'Cliente', 'E-mail', 'Data', 'Total', 'Status', 'Pagamento']
    const csvRows = rows.value.map(r => [
        r.order_number,
        r.customer?.full_name ?? '',
        r.customer?.email ?? '',
        fmtDateTime(r.created_at),
        Number(r.total).toFixed(2),
        statusMeta[r.status].label,
        r.payments?.[0] ? paymentStatusMeta[r.payments[0].status].label : '—',
    ])
    const csv = [header, ...csvRows]
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
        .join('\n')

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

onMounted(() => ordersQuery.refresh())
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- ==================== HEADER ==================== -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">Pedidos</h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Acompanhe todas as vendas da sua loja em tempo real.
                </p>
            </div>

            <div class="d-flex ga-2 flex-column flex-sm-row">
                <v-btn variant="outlined" prepend-icon="mdi-download" rounded="pill" class="text-none"
                    :disabled="!rows.length" @click="exportCsv">
                    Exportar
                </v-btn>
                <v-btn-toggle v-model="viewMode" mandatory density="compact" variant="outlined" rounded="pill">
                    <v-btn value="table" icon="mdi-view-list" size="small" />
                    <v-btn value="kanban" icon="mdi-view-column-outline" size="small" />
                </v-btn-toggle>
            </div>
        </header>

        <!-- ==================== MÉTRICAS ==================== -->
        <v-row dense>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="metricsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Aguardando pagamento" :value="metrics.pending"
                    icon="mdi-clock-outline" description="Pedidos pendentes" color="warning"
                    @click="filters.status = 'PENDING'" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="metricsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Pagos" :value="metrics.paid" icon="mdi-check-circle-outline"
                    description="Prontos para envio" color="success" @click="filters.status = 'PAID'" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="metricsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Receita do mês" :value="brl(metrics.monthRevenue)"
                    icon="mdi-cash-multiple" description="Pedidos pagos + entregues" color="primary" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="metricsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Ticket médio" :value="brl(metrics.avgTicket)"
                    icon="mdi-chart-line-variant" description="Média por pedido pago" color="info" />
            </v-col>
        </v-row>

        <!-- ==================== FILTROS ==================== -->
        <v-card rounded="xl" border flat class="pa-4">
            <v-row dense align="center">
                <v-col cols="12" md="4">
                    <v-text-field v-model="searchInput" prepend-inner-icon="mdi-magnify"
                        placeholder="Buscar por número ou cliente..." variant="outlined" density="comfortable"
                        hide-details rounded="pill" clearable />
                </v-col>
                <v-col cols="6" md="2">
                    <v-select v-model="filters.status" :items="[
                        { title: 'Todos os status', value: '' },
                        ...Object.entries(statusMeta).map(([k, v]) => ({ title: v.label, value: k })),
                    ]" variant="outlined" density="comfortable" hide-details rounded="pill" />
                </v-col>
                <v-col cols="6" md="2">
                    <v-text-field v-model="filters.dateFrom" type="date" label="De" variant="outlined"
                        density="comfortable" hide-details rounded="pill" />
                </v-col>
                <v-col cols="6" md="2">
                    <v-text-field v-model="filters.dateTo" type="date" label="Até" variant="outlined"
                        density="comfortable" hide-details rounded="pill" />
                </v-col>
                <v-col cols="6" md="2" class="d-flex justify-end">
                    <v-btn v-if="hasActiveFilters" variant="text" color="medium-emphasis" class="text-none"
                        prepend-icon="mdi-filter-off-outline" @click="clearFilters">
                        Limpar
                    </v-btn>
                </v-col>
            </v-row>
        </v-card>

        <!-- ==================== TABELA ==================== -->
        <v-card v-if="viewMode === 'table'" rounded="xl" border flat class="overflow-hidden">
            <v-data-table-server :headers="headers" :items="rows" :items-length="totalItems"
                :loading="ordersQuery.loading.value" :items-per-page="pagination.pageSize" :page="pagination.page"
                :sort-by="[{ key: sortBy, order: sortAsc ? 'asc' : 'desc' }]"
                :items-per-page-options="[10, 25, 50, 100]" hover density="comfortable" class="orders-table"
                @update:options="(o) => {
                    if (o.page !== pagination.page) pagination.page = o.page
                    if (o.itemsPerPage !== pagination.pageSize) pagination.pageSize = o.itemsPerPage
                    const sb = o.sortBy?.[0]
                    if (sb) {
                        if (sb.key !== sortBy) sortBy = sb.key
                        sortAsc = sb.order === 'asc'
                    }
                }">
                <!-- --- Pedido --- -->
                <template #item.order_number="{ item }">
                    <div class="d-flex flex-column">
                        <span class="font-weight-bold text-primary cursor-pointer" @click="openDetail(item.id)">
                            #{{ item.order_number }}
                        </span>
                        <v-btn variant="text" size="x-small" density="compact" prepend-icon="mdi-content-copy"
                            class="text-none px-0" style="justify-content: flex-start"
                            @click.stop="copyOrderNumber(item.order_number)">
                            copiar
                        </v-btn>
                    </div>
                </template>

                <!-- --- Cliente --- -->
                <template #item.customer="{ item }">
                    <div v-if="item.customer" class="d-flex align-center ga-2 min-width-0">
                        <v-avatar size="32" color="primary" variant="tonal">
                            <span class="text-caption font-weight-bold">
                                {{item.customer.full_name.split(' ').map(w => w[0]).slice(0, 2).join('')}}
                            </span>
                        </v-avatar>
                        <div class="min-width-0">
                            <div class="text-body-2 font-weight-medium text-truncate" style="max-width: 200px">
                                {{ item.customer.full_name }}
                            </div>
                            <div class="text-caption text-medium-emphasis text-truncate" style="max-width: 200px">
                                {{ item.customer.email || item.customer.phone || '—' }}
                            </div>
                        </div>
                    </div>
                    <span v-else class="text-caption text-disabled italic">
                        Cliente avulso
                    </span>
                </template>

                <!-- --- Data --- -->
                <template #item.created_at="{ item }">
                    <div class="text-body-2">{{ fmtDate(item.created_at) }}</div>
                    <div class="text-caption text-medium-emphasis">{{ fmtRelative(item.created_at) }}</div>
                </template>

                <!-- --- Itens --- -->
                <template #item.items_count="{ item }">
                    <v-chip size="small" variant="tonal">
                        {{ item.items_count?.[0]?.count ?? 0 }}
                    </v-chip>
                </template>

                <!-- --- Total --- -->
                <template #item.total="{ item }">
                    <div class="font-weight-bold">{{ brl(item.total) }}</div>
                    <div v-if="Number(item.discount) > 0" class="text-caption text-success">
                        −{{ brl(item.discount) }} desc.
                    </div>
                </template>

                <!-- --- Pagamento --- -->
                <template #item.payment="{ item }">
                    <div v-if="item.payments?.[0]">
                        <v-chip size="x-small" :color="paymentStatusMeta[item.payments[0].status].color"
                            variant="tonal">
                            {{ paymentStatusMeta[item.payments[0].status].label }}
                        </v-chip>
                        <div class="text-caption text-medium-emphasis mt-1">
                            {{ item.payments[0].gateway }}
                        </div>
                    </div>
                    <span v-else class="text-caption text-disabled">—</span>
                </template>

                <!-- --- Status --- -->
                <template #item.status="{ item }">
                    <v-menu :disabled="!canManage || allowedTransitions[item.status].length === 0"
                        location="bottom end">
                        <template #activator="{ props: mp }">
                            <v-chip v-bind="mp" :color="statusMeta[item.status].color" variant="tonal" size="small"
                                :prepend-icon="statusMeta[item.status].icon"
                                :append-icon="canManage && allowedTransitions[item.status].length ? 'mdi-chevron-down' : undefined"
                                class="font-weight-medium cursor-pointer">
                                {{ statusMeta[item.status].label }}
                            </v-chip>
                        </template>
                        <v-list density="compact" min-width="220">
                            <v-list-subheader>Mudar para</v-list-subheader>
                            <v-list-item v-for="next in allowedTransitions[item.status]" :key="next"
                                :prepend-icon="statusMeta[next].icon" :title="statusMeta[next].label"
                                :subtitle="statusMeta[next].description" @click="askChangeStatus(item, next)" />
                        </v-list>
                    </v-menu>
                </template>

                <!-- --- Ações --- -->
                <template #item.actions="{ item }">
                    <div class="d-flex justify-end ga-1">
                        <v-tooltip text="Ver detalhes">
                            <template #activator="{ props: tp }">
                                <v-btn v-bind="tp" icon="mdi-eye-outline" variant="text" size="small" color="primary"
                                    @click="openDetail(item.id)" />
                            </template>
                        </v-tooltip>
                        <v-menu location="bottom end">
                            <template #activator="{ props: mp }">
                                <v-btn v-bind="mp" icon="mdi-dots-vertical" variant="text" size="small" />
                            </template>
                            <v-list density="compact" min-width="200">
                                <v-list-item prepend-icon="mdi-whatsapp" title="Contatar via WhatsApp"
                                    :disabled="!item.customer?.phone" @click="sendWhatsApp(item)" />
                                <v-list-item prepend-icon="mdi-content-copy" title="Copiar número"
                                    @click="copyOrderNumber(item.order_number)" />
                                <v-list-item prepend-icon="mdi-open-in-new" title="Abrir em nova aba"
                                    @click="router.push({ name: 'order-detail', params: { id: item.id } })" />
                            </v-list>
                        </v-menu>
                    </div>
                </template>

                <template #no-data>
                    <EmptyState title="Nenhum pedido encontrado" :description="hasActiveFilters
                        ? 'Ajuste os filtros para ver mais resultados.'
                        : 'Assim que um cliente comprar, o pedido aparecerá aqui.'" icon="mdi-cart-outline" />
                </template>
            </v-data-table-server>
        </v-card>

        <!-- ==================== KANBAN ==================== -->
        <div v-else class="kanban-board">
            <div v-for="col in kanbanColumns" :key="col" class="kanban-column">
                <div class="kanban-header" :class="`bg-${statusMeta[col].color}-lighten-5`">
                    <div class="d-flex align-center ga-2">
                        <v-icon :color="statusMeta[col].color" size="20">
                            {{ statusMeta[col].icon }}
                        </v-icon>
                        <span class="font-weight-bold">{{ statusMeta[col].label }}</span>
                    </div>
                    <v-chip size="x-small" variant="tonal" :color="statusMeta[col].color">
                        {{ kanbanGroups[col].length }}
                    </v-chip>
                </div>

                <div class="kanban-body">
                    <v-card v-for="order in kanbanGroups[col]" :key="order.id" border flat rounded="lg"
                        class="kanban-card cursor-pointer" @click="openDetail(order.id)">
                        <div class="d-flex justify-space-between align-start mb-1">
                            <span class="font-weight-bold text-primary">
                                #{{ order.order_number }}
                            </span>
                            <span class="text-caption text-medium-emphasis">
                                {{ fmtRelative(order.created_at) }}
                            </span>
                        </div>
                        <div class="text-body-2 text-truncate mb-2">
                            {{ order.customer?.full_name ?? 'Cliente avulso' }}
                        </div>
                        <div class="d-flex align-center justify-space-between">
                            <span class="font-weight-bold">{{ brl(order.total) }}</span>
                            <v-menu :disabled="!canManage || allowedTransitions[order.status].length === 0"
                                location="bottom end">
                                <template #activator="{ props: mp }">
                                    <v-btn v-bind="mp" icon="mdi-arrow-right-thick" size="x-small" variant="tonal"
                                        :color="statusMeta[order.status].color" @click.stop />
                                </template>
                                <v-list density="compact">
                                    <v-list-item v-for="next in allowedTransitions[order.status]" :key="next"
                                        :prepend-icon="statusMeta[next].icon" :title="statusMeta[next].label"
                                        @click="askChangeStatus(order, next)" />
                                </v-list>
                            </v-menu>
                        </div>
                    </v-card>

                    <div v-if="!kanbanGroups[col].length" class="kanban-empty">
                        Nenhum pedido
                    </div>
                </div>
            </div>
        </div>

        <!-- ==================== DIALOG DE MUDANÇA DE STATUS ==================== -->
        <v-dialog v-model="statusChangeDialog.open" max-width="520" persistent>
            <v-card v-if="statusChangeDialog.order && statusChangeDialog.newStatus" rounded="xl">
                <v-toolbar color="surface" border="b" density="comfortable">
                    <v-btn icon="mdi-close" variant="text" @click="statusChangeDialog.open = false" />
                    <v-toolbar-title class="font-weight-black">
                        Mudar status
                    </v-toolbar-title>
                </v-toolbar>

                <v-card-text class="pa-6">
                    <p class="text-body-2 mb-4">
                        Pedido <strong>#{{ statusChangeDialog.order.order_number }}</strong>
                    </p>

                    <div class="status-transition mb-4">
                        <v-chip :color="statusMeta[statusChangeDialog.order.status].color" variant="tonal"
                            :prepend-icon="statusMeta[statusChangeDialog.order.status].icon">
                            {{ statusMeta[statusChangeDialog.order.status].label }}
                        </v-chip>
                        <v-icon color="medium-emphasis">mdi-arrow-right</v-icon>
                        <v-chip :color="statusMeta[statusChangeDialog.newStatus].color" variant="flat"
                            :prepend-icon="statusMeta[statusChangeDialog.newStatus].icon">
                            {{ statusMeta[statusChangeDialog.newStatus].label }}
                        </v-chip>
                    </div>

                    <v-alert v-if="statusChangeImpact" :type="statusChangeImpact.type" variant="tonal" density="compact"
                        rounded="lg" class="mb-4">
                        <div class="text-caption">{{ statusChangeImpact.text }}</div>
                    </v-alert>

                    <v-textarea v-model="statusChangeDialog.note" label="Observação (opcional)"
                        placeholder="Ex: cliente ligou pedindo prazo, código de rastreio..." rows="3" variant="outlined"
                        density="comfortable" />
                </v-card-text>

                <v-divider />

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="changingStatus"
                        @click="statusChangeDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn :color="statusMeta[statusChangeDialog.newStatus].color" variant="flat" rounded="pill"
                        class="text-none px-6" :loading="changingStatus" @click="confirmChangeStatus">
                        Confirmar
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== DIALOG DE DETALHES ==================== -->
        <v-dialog v-model="detailDialog.open" max-width="800" scrollable>
            <v-card rounded="xl" class="detail-dialog">
                <v-toolbar color="surface" border="b" density="comfortable">
                    <v-btn icon="mdi-close" variant="text" @click="detailDialog.open = false" />
                    <v-toolbar-title class="font-weight-black">
                        <span v-if="detailDialog.order">
                            Pedido #{{ detailDialog.order.order_number }}
                        </span>
                        <span v-else>Carregando...</span>
                    </v-toolbar-title>
                    <v-spacer />
                    <v-btn v-if="detailDialog.order" variant="text" icon="mdi-open-in-new"
                        @click="router.push({ name: 'order-detail', params: { id: detailDialog.order.id } })" />
                </v-toolbar>

                <v-card-text v-if="detailDialog.loading" class="pa-6">
                    <v-skeleton-loader type="article, list-item-two-line@3" />
                </v-card-text>

                <v-card-text v-else-if="detailDialog.order" class="pa-6">
                    <!--  Status + Total  -->
                    <div class="d-flex align-center justify-space-between mb-6 flex-wrap ga-3">
                        <div>
                            <v-chip :color="statusMeta[detailDialog.order.status as OrderStatus].color" variant="tonal"
                                :prepend-icon="statusMeta[detailDialog.order.status as OrderStatus].icon">
                                {{ statusMeta[detailDialog.order.status as OrderStatus].label }}
                            </v-chip>
                            <div class="text-caption text-medium-emphasis mt-2">
                                Criado em {{ fmtDateTime(detailDialog.order.created_at) }}
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-caption text-medium-emphasis">Total</div>
                            <div class="text-h5 font-weight-black">
                                {{ brl(detailDialog.order.total) }}
                            </div>
                        </div>
                    </div>

                    <!--  Cliente  -->
                    <v-card v-if="detailDialog.order.customer" variant="tonal" rounded="lg" class="pa-4 mb-4">
                        <div class="text-overline mb-2">Cliente</div>
                        <div class="text-body-1 font-weight-bold">
                            {{ detailDialog.order.customer.full_name }}
                        </div>
                        <div class="text-caption text-medium-emphasis">
                            {{ detailDialog.order.customer.email }} · {{ detailDialog.order.customer.phone }}
                        </div>
                    </v-card>

                    <!--  Itens  -->
                    <div class="text-overline mb-2">Itens</div>
                    <v-table density="compact" class="mb-4">
                        <tbody>
                            <tr v-for="item in detailDialog.order.order_items" :key="item.id">
                                <td>
                                    <div class="text-body-2 font-weight-medium">{{ item.product?.name }}</div>
                                    <code class="sku-chip text-caption">{{ item.product?.sku }}</code>
                                </td>
                                <td class="text-center text-body-2">{{ item.quantity }}x</td>
                                <td class="text-right text-body-2 text-medium-emphasis">
                                    {{ brl(item.unit_price) }}
                                </td>
                                <td class="text-right text-body-2 font-weight-bold">
                                    {{ brl(item.total) }}
                                </td>
                            </tr>
                        </tbody>
                    </v-table>

                    <!--  Totais  -->
                    <div class="totals-box">
                        <div class="d-flex justify-space-between">
                            <span>Subtotal</span>
                            <span>{{ brl(detailDialog.order.subtotal) }}</span>
                        </div>
                        <div v-if="Number(detailDialog.order.discount) > 0"
                            class="d-flex justify-space-between text-success">
                            <span>Desconto</span>
                            <span>−{{ brl(detailDialog.order.discount) }}</span>
                        </div>
                        <div v-if="Number(detailDialog.order.shipping_cost) > 0" class="d-flex justify-space-between">
                            <span>Frete</span>
                            <span>{{ brl(detailDialog.order.shipping_cost) }}</span>
                        </div>
                        <v-divider class="my-2" />
                        <div class="d-flex justify-space-between text-h6 font-weight-black">
                            <span>Total</span>
                            <span>{{ brl(detailDialog.order.total) }}</span>
                        </div>
                    </div>

                    <!--  Observações  -->
                    <div v-if="detailDialog.order.notes" class="mt-4">
                        <div class="text-overline mb-2">Observações</div>
                        <v-card variant="tonal" rounded="lg" class="pa-3">
                            <pre class="notes-text">{{ detailDialog.order.notes }}</pre>
                        </v-card>
                    </div>
                </v-card-text>

                <v-divider />

                <v-card-actions v-if="detailDialog.order" class="pa-4 flex-wrap ga-2">
                    <v-btn v-if="detailDialog.order.customer?.phone" variant="tonal" color="success"
                        prepend-icon="mdi-whatsapp" class="text-none" @click="sendWhatsApp(detailDialog.order)">
                        WhatsApp
                    </v-btn>
                    <v-spacer />
                    <v-menu v-if="canManage && allowedTransitions[detailDialog.order.status as OrderStatus].length"
                        location="top end">
                        <template #activator="{ props: mp }">
                            <v-btn v-bind="mp" color="primary" variant="flat" rounded="pill" class="text-none"
                                prepend-icon="mdi-swap-horizontal">
                                Mudar status
                            </v-btn>
                        </template>
                        <v-list density="compact">
                            <v-list-item v-for="next in allowedTransitions[detailDialog.order.status as OrderStatus]"
                                :key="next" :prepend-icon="statusMeta[next].icon" :title="statusMeta[next].label"
                                @click="askChangeStatus(detailDialog.order, next); detailDialog.open = false" />
                        </v-list>
                    </v-menu>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<style scoped>
.orders-table :deep(thead th) {
    background: rgba(var(--v-theme-surface-variant), 0.3);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
}

.cursor-pointer {
    cursor: pointer;
}

.min-width-0 {
    min-width: 0;
}

/* SKU chip */
.sku-chip {
    background: rgba(var(--v-theme-on-surface), 0.06);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.7rem;
    color: rgb(var(--v-theme-on-surface));
    font-weight: 600;
    display: inline-block;
}

/* ============================================================ */
/*  Kanban                                                      */
/* ============================================================ */
.kanban-board {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
    overflow-x: auto;
}

.kanban-column {
    background: rgba(var(--v-theme-surface-variant), 0.15);
    border-radius: 12px;
    overflow: hidden;
    min-height: 300px;
    display: flex;
    flex-direction: column;
}

.kanban-header {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
}

.kanban-body {
    flex: 1;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    max-height: 70vh;
}

.kanban-card {
    padding: 12px;
    transition: all 0.15s ease;
    background: rgb(var(--v-theme-surface));
}

.kanban-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border-color: rgba(var(--v-theme-primary), 0.3) !important;
}

.kanban-empty {
    text-align: center;
    padding: 32px 16px;
    color: rgba(var(--v-theme-on-surface), 0.4);
    font-size: 0.875rem;
    font-style: italic;
}

/* ============================================================ */
/*  Status transition                                           */
/* ============================================================ */
.status-transition {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-radius: 12px;
    flex-wrap: wrap;
}

/* ============================================================ */
/*  Detail dialog                                               */
/* ============================================================ */
.detail-dialog {
    max-height: 90vh;
    display: flex;
    flex-direction: column;
}

.totals-box {
    background: rgba(var(--v-theme-surface-variant), 0.3);
    padding: 16px;
    border-radius: 12px;
}

.notes-text {
    white-space: pre-wrap;
    font-family: inherit;
    font-size: 0.875rem;
    margin: 0;
}
</style>
