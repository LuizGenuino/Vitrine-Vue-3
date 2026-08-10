<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useRealtime } from '@/composables/useRealtime'

import { customersService } from '@/services/customers.service'
import { supabase } from '@/lib/supabase'

import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue'
import EmptyState from '@/components/base/EmptyState.vue'

import type { Customer, Order, OrderStatus } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const router = useRouter()
const auth = useAuthStore()
const notify = useNotifications()
const { currentStoreId, currentRole } = storeToRefs(auth)

const canManage = computed(() =>
    currentRole.value && ['SUDO', 'OWNER', 'ADMIN', 'MANAGER'].includes(currentRole.value),
)

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface CustomerWithStats extends Customer {
    addresses?: { count: number }[]
    orders_count?: number
    total_spent?: number
    last_order_at?: string | null
}

interface OrderHistory extends Order {
    items_count: { count: number }[]
}

/* -------------------------------------------------------------------------- */
/*  Formatters & metadata                                                     */
/* -------------------------------------------------------------------------- */

const brl = (v: number | string | null | undefined) =>
    Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

const fmtRelative = (iso: string | null) => {
    if (!iso) return 'Nunca'
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86_400_000)
    if (days === 0) return 'Hoje'
    if (days === 1) return 'Ontem'
    if (days < 30) return `há ${days} dias`
    if (days < 365) return `há ${Math.floor(days / 30)} meses`
    return `há ${Math.floor(days / 365)} ano(s)`
}

function formatDoc(doc: string | null): string {
    if (!doc) return '—'
    const digits = doc.replace(/\D/g, '')
    if (digits.length === 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    }
    if (digits.length === 14) {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    }
    return doc
}

function formatPhone(phone: string | null): string {
    if (!phone) return '—'
    const d = phone.replace(/\D/g, '')
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
    return phone
}

function initialsOf(name: string): string {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

const statusMeta: Record<OrderStatus, { label: string; color: string; icon: string }> = {
    PENDING: { label: 'Pendente', color: 'warning', icon: 'mdi-clock-outline' },
    PAID: { label: 'Pago', color: 'success', icon: 'mdi-check-circle-outline' },
    DELIVERED: { label: 'Entregue', color: 'primary', icon: 'mdi-truck-delivery-outline' },
    CANCELLED: { label: 'Cancelado', color: 'error', icon: 'mdi-close-circle-outline' },
    REFUNDED: { label: 'Reembolsado', color: 'grey', icon: 'mdi-cash-refund' },
}

/* -------------------------------------------------------------------------- */
/*  Filtros                                                                   */
/* -------------------------------------------------------------------------- */

interface Filters {
    search: string
    tag: string | null
    segment: '' | 'vip' | 'recurrent' | 'inactive' | 'new'
    hasEmail: boolean
    hasPhone: boolean
}

const filters = reactive<Filters>({
    search: '',
    tag: null,
    segment: '',
    hasEmail: false,
    hasPhone: false,
})

const pagination = reactive({ page: 1, pageSize: 25 })
const totalItems = ref(0)
const sortBy = ref('created_at')
const sortAsc = ref(false)

/* -------------------------------------------------------------------------- */
/*  Query — listagem                                                          */
/* -------------------------------------------------------------------------- */

const customersQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return []

    const from = (pagination.page - 1) * pagination.pageSize
    const to = from + pagination.pageSize - 1

    let query = supabase
        .from('customers')
        .select(
            `*, addresses:customer_addresses(count)`,
            { count: 'exact' },
        )
        .is('deleted_at', null)
        .order(sortBy.value, { ascending: sortAsc.value })
        .range(from, to)

    if (filters.search) {
        const term = filters.search.trim()
        query = query.or(
            `full_name.ilike.%${term}%,`
            + `email.ilike.%${term}%,`
            + `phone.ilike.%${term}%,`
            + `cpf_cnpj.ilike.%${term}%`,
        )
    }
    if (filters.tag) query = query.contains('tags', [filters.tag])
    if (filters.hasEmail) query = query.not('email', 'is', null)
    if (filters.hasPhone) query = query.not('phone', 'is', null)

    const { data, error, count } = await query
    if (error) throw error
    totalItems.value = count ?? 0
    return (data ?? []) as CustomerWithStats[]
}, { watchSource: [currentStoreId] })

const customers = computed(() => customersQuery.data.value ?? [])

/* -------------------------------------------------------------------------- */
/*  Query — estatísticas de compras (por cliente exibido)                     */
/*  Traz total_spent, orders_count e last_order_at só para a página atual     */
/* -------------------------------------------------------------------------- */

const statsMap = ref<Record<string, {
    orders_count: number
    total_spent: number
    last_order_at: string | null
}>>({})

watch(customers, async (list) => {
    if (!list.length) { statsMap.value = {}; return }

    const ids = list.map(c => c.id)
    const { data } = await supabase
        .from('orders')
        .select('customer_id, total, created_at, status')
        .in('customer_id', ids)
        .in('status', ['PAID', 'DELIVERED'])
        .is('deleted_at', null)

    const map: typeof statsMap.value = {}
    for (const id of ids) {
        map[id] = { orders_count: 0, total_spent: 0, last_order_at: null }
    }
    for (const o of data ?? []) {
        const key = o.customer_id as string
        if (!map[key]) continue
        map[key].orders_count++
        map[key].total_spent += Number(o.total)
        if (!map[key].last_order_at || o.created_at > map[key].last_order_at!) {
            map[key].last_order_at = o.created_at
        }
    }
    statsMap.value = map
}, { immediate: true })

/* -------------------------------------------------------------------------- */
/*  Métricas globais do topo                                                  */
/* -------------------------------------------------------------------------- */

const globalStatsQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return null

    const [customersResp, ordersResp] = await Promise.all([
        supabase.from('customers').select('id, created_at', { count: 'exact', head: false })
            .is('deleted_at', null),
        supabase.from('orders').select('customer_id, total, created_at, status')
            .in('status', ['PAID', 'DELIVERED']).is('deleted_at', null),
    ])

    const allCustomers = customersResp.data ?? []
    const allOrders = ordersResp.data ?? []

    const now = new Date()
    const start30 = new Date(now.getTime() - 30 * 86_400_000)

    const newLast30 = allCustomers.filter(c => new Date(c.created_at) >= start30).length

    const spendPerCustomer: Record<string, number> = {}
    for (const o of allOrders) {
        const k = o.customer_id as string
        if (!k) continue
        spendPerCustomer[k] = (spendPerCustomer[k] ?? 0) + Number(o.total)
    }

    const totalRevenue = Object.values(spendPerCustomer).reduce((s, v) => s + v, 0)
    const activeCount = Object.keys(spendPerCustomer).length
    const avgLtv = activeCount ? totalRevenue / activeCount : 0

    return {
        total: allCustomers.length,
        newLast30,
        activeCount,
        avgLtv,
    }
}, { watchSource: [currentStoreId] })

const metrics = computed(() => globalStatsQuery.data.value ?? {
    total: 0, newLast30: 0, activeCount: 0, avgLtv: 0,
})

/* -------------------------------------------------------------------------- */
/*  Tags disponíveis (agregadas de todos os clientes)                         */
/* -------------------------------------------------------------------------- */

const allTagsQuery = useSupabaseQuery(async () => {
    const { data } = await supabase
        .from('customers')
        .select('tags')
        .is('deleted_at', null)
        .not('tags', 'is', null)

    const set = new Set<string>()
    for (const row of data ?? []) {
        for (const t of (row.tags as string[] | null) ?? []) set.add(t)
    }
    return Array.from(set).sort()
}, { watchSource: [currentStoreId] })

const availableTags = computed(() => allTagsQuery.data.value ?? [])

function tagColor(tag: string): string {
    // Hash simples para dar cor consistente por tag
    let hash = 0
    for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
    const colors = ['primary', 'success', 'warning', 'info', 'error', 'purple', 'teal', 'orange']
    return colors[Math.abs(hash) % colors.length]
}

/* -------------------------------------------------------------------------- */
/*  Segmento derivado                                                         */
/* -------------------------------------------------------------------------- */

function segmentOf(c: CustomerWithStats): 'vip' | 'recurrent' | 'inactive' | 'new' | null {
    const stats = statsMap.value[c.id]
    if (!stats) return null

    if (stats.total_spent >= 1000) return 'vip'
    if (stats.orders_count >= 3) return 'recurrent'

    const daysSinceLast = stats.last_order_at
        ? (Date.now() - new Date(stats.last_order_at).getTime()) / 86_400_000
        : Infinity
    if (daysSinceLast > 90 && stats.orders_count > 0) return 'inactive'

    const daysSinceRegister = (Date.now() - new Date(c.created_at).getTime()) / 86_400_000
    if (daysSinceRegister <= 30) return 'new'

    return null
}

const segmentMeta = {
    vip: { label: 'VIP', icon: 'mdi-crown-outline', color: 'warning' },
    recurrent: { label: 'Recorrente', icon: 'mdi-repeat-variant', color: 'success' },
    inactive: { label: 'Inativo', icon: 'mdi-account-clock', color: 'grey' },
    new: { label: 'Novo', icon: 'mdi-account-star-outline', color: 'info' },
}

const filteredCustomers = computed(() => {
    if (!filters.segment) return customers.value
    return customers.value.filter(c => segmentOf(c) === filters.segment)
})

/* -------------------------------------------------------------------------- */
/*  Form dialog — criar/editar                                                */
/* -------------------------------------------------------------------------- */

const formDialog = reactive({
    open: false,
    editing: false,
    form: {
        id: null as string | null,
        full_name: '',
        email: '',
        phone: '',
        cpf_cnpj: '',
        birth_date: '' as string | '',
        tags: [] as string[],
        newTag: '',
    },
})

function openCreate() {
    formDialog.editing = false
    formDialog.form = {
        id: null, full_name: '', email: '', phone: '',
        cpf_cnpj: '', birth_date: '', tags: [], newTag: '',
    }
    formDialog.open = true
}

function openEdit(customer: Customer) {
    formDialog.editing = true
    formDialog.form = {
        id: customer.id,
        full_name: customer.full_name,
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        cpf_cnpj: customer.cpf_cnpj ?? '',
        birth_date: customer.birth_date ?? '',
        tags: [...(customer.tags ?? [])],
        newTag: '',
    }
    formDialog.open = true
}

function addTagToForm() {
    const tag = formDialog.form.newTag.trim()
    if (tag && !formDialog.form.tags.includes(tag)) {
        formDialog.form.tags.push(tag)
    }
    formDialog.form.newTag = ''
}

function removeTagFromForm(tag: string) {
    formDialog.form.tags = formDialog.form.tags.filter(t => t !== tag)
}

const { execute: saveCustomer, loading: saving } = useAsyncAction(
    async () => {
        if (!currentStoreId.value) throw new Error('Sem loja ativa')
        const f = formDialog.form
        if (!f.full_name.trim()) throw new Error('Informe o nome do cliente')

        const payload = {
            full_name: f.full_name.trim(),
            email: f.email.trim() || null,
            phone: f.phone.trim() || null,
            cpf_cnpj: f.cpf_cnpj.trim() || null,
            birth_date: f.birth_date || null,
            tags: f.tags,
        }

        if (formDialog.editing && f.id) {
            const { error } = await supabase.from('customers').update(payload).eq('id', f.id)
            if (error) throw error
        } else {
            const { error } = await supabase.from('customers').insert({
                ...payload,
                store_id: currentStoreId.value,
            })
            if (error) {
                if (error.code === '23505') throw new Error('Já existe um cliente com esse e-mail')
                throw error
            }
        }

        formDialog.open = false
        await Promise.all([customersQuery.refresh(), globalStatsQuery.refresh(), allTagsQuery.refresh()])
    },
    { successMsg: 'Cliente salvo com sucesso' },
)

/* -------------------------------------------------------------------------- */
/*  Detail drawer — histórico de compras                                      */
/* -------------------------------------------------------------------------- */

const detailDrawer = reactive({
    open: false,
    loading: false,
    customer: null as CustomerWithStats | null,
    orders: [] as OrderHistory[],
    addresses: [] as any[],
})

async function openDetail(customer: CustomerWithStats) {
    detailDrawer.open = true
    detailDrawer.loading = true
    detailDrawer.customer = customer
    detailDrawer.orders = []
    detailDrawer.addresses = []

    try {
        const [ordersResp, addressesResp] = await Promise.all([
            supabase
                .from('orders')
                .select('*, items_count:order_items(count)')
                .eq('customer_id', customer.id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(50),
            supabase
                .from('customer_addresses')
                .select('*')
                .eq('customer_id', customer.id)
                .is('deleted_at', null)
                .order('is_default', { ascending: false }),
        ])

        detailDrawer.orders = (ordersResp.data ?? []) as unknown as OrderHistory[]
        detailDrawer.addresses = addressesResp.data ?? []
    } catch (e: any) {
        notify.error(e.message ?? 'Erro ao carregar detalhes')
    } finally {
        detailDrawer.loading = false
    }
}

const customerLifetimeStats = computed(() => {
    const orders = detailDrawer.orders.filter(o => ['PAID', 'DELIVERED'].includes(o.status))
    const totalSpent = orders.reduce((s, o) => s + Number(o.total), 0)
    const avgTicket = orders.length ? totalSpent / orders.length : 0
    return {
        ordersCount: orders.length,
        totalSpent,
        avgTicket,
        totalOrders: detailDrawer.orders.length,
    }
})

function sendWhatsApp(customer: Customer) {
    if (!customer.phone) return notify.error('Cliente sem telefone')
    const phone = customer.phone.replace(/\D/g, '')
    const text = encodeURIComponent(`Olá ${customer.full_name.split(' ')[0]}!`)
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank')
}

function sendEmail(customer: Customer) {
    if (!customer.email) return notify.error('Cliente sem e-mail')
    window.location.href = `mailto:${customer.email}`
}

/* -------------------------------------------------------------------------- */
/*  LGPD — anonimização                                                       */
/* -------------------------------------------------------------------------- */

const confirmAnonymize = reactive({
    open: false,
    customer: null as Customer | null,
    typedConfirmation: '',
})

function askAnonymize(customer: Customer) {
    confirmAnonymize.open = true
    confirmAnonymize.customer = customer
    confirmAnonymize.typedConfirmation = ''
}

const canConfirmAnonymize = computed(() =>
    confirmAnonymize.typedConfirmation.trim().toUpperCase() === 'ANONIMIZAR',
)

const { execute: doAnonymize, loading: anonymizing } = useAsyncAction(
    async () => {
        if (!confirmAnonymize.customer) return
        await customersService.anonymize(confirmAnonymize.customer.id)
        confirmAnonymize.open = false
        detailDrawer.open = false
        await customersQuery.refresh()
    },
    { successMsg: 'Cliente anonimizado (LGPD)' },
)

/* -------------------------------------------------------------------------- */
/*  Realtime                                                                  */
/* -------------------------------------------------------------------------- */

useRealtime<Customer>({
    table: 'customers',
    event: '*',
    scopedToStore: true,
    onChange: () => {
        customersQuery.refresh()
        globalStatsQuery.refresh()
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
/*  Watchers                                                                  */
/* -------------------------------------------------------------------------- */

watch(
    [() => filters.search, () => filters.tag, () => filters.hasEmail,
    () => filters.hasPhone, () => pagination.page, () => pagination.pageSize,
    () => sortBy.value, () => sortAsc.value],
    () => customersQuery.refresh(),
)

function clearFilters() {
    filters.search = ''
    filters.tag = null
    filters.segment = ''
    filters.hasEmail = false
    filters.hasPhone = false
    searchInput.value = ''
    pagination.page = 1
}

const hasActiveFilters = computed(() =>
    !!filters.search || !!filters.tag || !!filters.segment
    || filters.hasEmail || filters.hasPhone,
)

/* -------------------------------------------------------------------------- */
/*  Exportar CSV                                                              */
/* -------------------------------------------------------------------------- */

function exportCsv() {
    const header = ['Nome', 'E-mail', 'Telefone', 'CPF/CNPJ', 'Nascimento', 'Tags', 'Pedidos', 'Total gasto', 'Última compra', 'Cadastrado em']
    const csvRows = filteredCustomers.value.map(c => {
        const s = statsMap.value[c.id] ?? { orders_count: 0, total_spent: 0, last_order_at: null }
        return [
            c.full_name,
            c.email ?? '',
            c.phone ?? '',
            c.cpf_cnpj ?? '',
            c.birth_date ?? '',
            (c.tags ?? []).join(', '),
            s.orders_count,
            s.total_spent.toFixed(2),
            s.last_order_at ? fmtDate(s.last_order_at) : '',
            fmtDate(c.created_at),
        ]
    })
    const csv = [header, ...csvRows]
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
        .join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

/* -------------------------------------------------------------------------- */
/*  Headers                                                                   */
/* -------------------------------------------------------------------------- */

const headers = [
    { title: 'Cliente', key: 'full_name', sortable: true },
    { title: 'Contato', key: 'contact', sortable: false },
    { title: 'Segmento', key: 'segment', sortable: false, align: 'center' as const },
    { title: 'Pedidos', key: 'orders_count', sortable: false, align: 'center' as const },
    { title: 'Total gasto', key: 'total_spent', sortable: false, align: 'end' as const },
    { title: 'Última compra', key: 'last_order', sortable: false },
    { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 80 },
]

onMounted(() => customersQuery.refresh())
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- ==================== HEADER ==================== -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">Clientes</h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Gerencie sua base, veja histórico de compras e segmente contatos.
                </p>
            </div>

            <div class="d-flex ga-2 flex-column flex-sm-row">
                <v-btn variant="outlined" prepend-icon="mdi-download" rounded="pill" class="text-none"
                    :disabled="!customers.length" @click="exportCsv">
                    Exportar
                </v-btn>
                <v-btn v-if="canManage" color="primary" prepend-icon="mdi-account-plus-outline" rounded="pill"
                    elevation="0" class="text-none px-6" @click="openCreate">
                    Novo cliente
                </v-btn>
            </div>
        </header>

        <!-- ==================== MÉTRICAS ==================== -->
        <v-row dense>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="globalStatsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Total de clientes" :value="metrics.total"
                    icon="mdi-account-group-outline" description="Cadastrados na sua base" color="primary" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="globalStatsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Novos (30 dias)" :value="metrics.newLast30"
                    icon="mdi-account-star-outline" description="Cadastros recentes" color="info" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="globalStatsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Ativos" :value="metrics.activeCount" icon="mdi-account-check-outline"
                    description="Com pelo menos 1 compra" color="success" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="globalStatsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="LTV médio" :value="brl(metrics.avgLtv)" icon="mdi-chart-line-variant"
                    description="Valor médio por cliente ativo" color="warning" />
            </v-col>
        </v-row>

        <!-- ==================== FILTROS ==================== -->
        <v-card rounded="xl" border flat class="pa-4">
            <v-row dense align="center">
                <v-col cols="12" md="4">
                    <v-text-field v-model="searchInput" prepend-inner-icon="mdi-magnify"
                        placeholder="Nome, e-mail, telefone ou CPF/CNPJ..." variant="outlined" density="comfortable"
                        hide-details rounded="pill" clearable />
                </v-col>
                <v-col cols="6" md="2">
                    <v-select v-model="filters.segment" :items="[
                        { title: 'Todos os segmentos', value: '' },
                        { title: '👑 VIP', value: 'vip' },
                        { title: '🔁 Recorrente', value: 'recurrent' },
                        { title: '⭐ Novos', value: 'new' },
                        { title: '💤 Inativos', value: 'inactive' },
                    ]" variant="outlined" density="comfortable" hide-details rounded="pill" />
                </v-col>
                <v-col cols="6" md="3">
                    <v-select v-model="filters.tag" :items="[
                        { title: 'Todas as tags', value: null },
                        ...availableTags.map(t => ({ title: t, value: t })),
                    ]" variant="outlined" density="comfortable" hide-details rounded="pill"
                        prepend-inner-icon="mdi-tag-outline" />
                </v-col>
                <v-col cols="6" md="1">
                    <v-checkbox v-model="filters.hasEmail" label="C/ e-mail" density="compact" hide-details
                        color="primary" />
                </v-col>
                <v-col cols="6" md="1">
                    <v-checkbox v-model="filters.hasPhone" label="C/ fone" density="compact" hide-details
                        color="primary" />
                </v-col>
                <v-col cols="12" md="1" class="d-flex justify-end">
                    <v-btn v-if="hasActiveFilters" variant="text" color="medium-emphasis" class="text-none"
                        prepend-icon="mdi-filter-off-outline" size="small" @click="clearFilters">
                        Limpar
                    </v-btn>
                </v-col>
            </v-row>
        </v-card>

        <!-- ==================== TABELA ==================== -->
        <v-card rounded="xl" border flat class="overflow-hidden">
            <v-data-table-server :headers="headers" :items="filteredCustomers" :items-length="totalItems"
                :loading="customersQuery.loading.value" :items-per-page="pagination.pageSize" :page="pagination.page"
                :sort-by="[{ key: sortBy, order: sortAsc ? 'asc' : 'desc' }]"
                :items-per-page-options="[10, 25, 50, 100]" hover density="comfortable" class="customers-table"
                @update:options="(o) => {
                    if (o.page !== pagination.page) pagination.page = o.page
                    if (o.itemsPerPage !== pagination.pageSize) pagination.pageSize = o.itemsPerPage
                    const sb = o.sortBy?.[0]
                    if (sb) {
                        if (sb.key !== sortBy) sortBy = sb.key
                        sortAsc = sb.order === 'asc'
                    }
                }">
                <!-- Nome -->
                <template #item.full_name="{ item }">
                    <div class="d-flex align-center ga-3 py-2 cursor-pointer" @click="openDetail(item)">
                        <v-avatar size="42" color="primary" variant="tonal">
                            <span class="text-body-2 font-weight-bold">
                                {{ initialsOf(item.full_name) }}
                            </span>
                        </v-avatar>
                        <div class="min-width-0">
                            <div class="text-body-1 font-weight-bold text-truncate" style="max-width: 220px">
                                {{ item.full_name }}
                            </div>
                            <div v-if="item.tags?.length" class="d-flex flex-wrap ga-1 mt-1">
                                <v-chip v-for="tag in item.tags.slice(0, 3)" :key="tag" size="x-small" variant="tonal"
                                    :color="tagColor(tag)">
                                    {{ tag }}
                                </v-chip>
                                <v-chip v-if="item.tags.length > 3" size="x-small" variant="tonal" color="grey">
                                    +{{ item.tags.length - 3 }}
                                </v-chip>
                            </div>
                        </div>
                    </div>
                </template>

                <!-- Contato -->
                <template #item.contact="{ item }">
                    <div class="d-flex flex-column ga-1">
                        <div v-if="item.email" class="d-flex align-center ga-1 text-caption">
                            <v-icon size="14" color="medium-emphasis">mdi-email-outline</v-icon>
                            <span class="text-truncate" style="max-width: 200px">{{ item.email }}</span>
                        </div>
                        <div v-if="item.phone" class="d-flex align-center ga-1 text-caption">
                            <v-icon size="14" color="medium-emphasis">mdi-phone-outline</v-icon>
                            <span>{{ formatPhone(item.phone) }}</span>
                        </div>
                        <div v-if="!item.email && !item.phone" class="text-caption text-disabled">
                            Sem contato
                        </div>
                    </div>
                </template>

                <!-- Segmento -->
                <template #item.segment="{ item }">
                    <v-chip v-if="segmentOf(item)" size="x-small" :color="segmentMeta[segmentOf(item)!].color"
                        variant="tonal" :prepend-icon="segmentMeta[segmentOf(item)!].icon">
                        {{ segmentMeta[segmentOf(item)!].label }}
                    </v-chip>
                    <span v-else class="text-caption text-disabled">—</span>
                </template>

                <!-- Pedidos -->
                <template #item.orders_count="{ item }">
                    <v-chip size="small" variant="tonal"
                        :color="(statsMap[item.id]?.orders_count ?? 0) > 0 ? 'success' : 'grey'">
                        {{ statsMap[item.id]?.orders_count ?? 0 }}
                    </v-chip>
                </template>

                <!-- Total gasto -->
                <template #item.total_spent="{ item }">
                    <span class="font-weight-bold">
                        {{ brl(statsMap[item.id]?.total_spent ?? 0) }}
                    </span>
                </template>

                <!-- Última compra -->
                <template #item.last_order="{ item }">
                    <div class="text-body-2">
                        {{ fmtRelative(statsMap[item.id]?.last_order_at ?? null) }}
                    </div>
                    <div v-if="statsMap[item.id]?.last_order_at" class="text-caption text-medium-emphasis">
                        {{ fmtDate(statsMap[item.id].last_order_at) }}
                    </div>
                </template>

                <!-- Ações -->
                <template #item.actions="{ item }">
                    <div class="d-flex justify-end ga-1">
                        <v-tooltip text="Ver detalhes">
                            <template #activator="{ props: tp }">
                                <v-btn v-bind="tp" icon="mdi-eye-outline" variant="text" size="small" color="primary"
                                    @click="openDetail(item)" />
                            </template>
                        </v-tooltip>
                        <v-menu location="bottom end">
                            <template #activator="{ props: mp }">
                                <v-btn v-bind="mp" icon="mdi-dots-vertical" variant="text" size="small" />
                            </template>
                            <v-list density="compact" min-width="200">
                                <v-list-item prepend-icon="mdi-pencil-outline" title="Editar" :disabled="!canManage"
                                    @click="openEdit(item)" />
                                <v-list-item prepend-icon="mdi-whatsapp" title="WhatsApp" :disabled="!item.phone"
                                    @click="sendWhatsApp(item)" />
                                <v-list-item prepend-icon="mdi-email-outline" title="Enviar e-mail"
                                    :disabled="!item.email" @click="sendEmail(item)" />
                                <v-divider class="my-1" />
                                <v-list-item prepend-icon="mdi-account-off-outline" title="Anonimizar (LGPD)"
                                    base-color="error" :disabled="!canManage" @click="askAnonymize(item)" />
                            </v-list>
                        </v-menu>
                    </div>
                </template>

                <template #no-data>
                    <EmptyState title="Nenhum cliente encontrado" :description="hasActiveFilters
                        ? 'Ajuste os filtros para ver mais resultados.'
                        : 'Cadastre seu primeiro cliente ou espere que apareçam com as vendas.'"
                        icon="mdi-account-group-outline" />
                </template>
            </v-data-table-server>
        </v-card>

        <!-- ==================== DRAWER DE DETALHES ==================== -->
        <v-navigation-drawer v-model="detailDrawer.open" location="right" temporary width="520" class="detail-drawer">
            <template v-if="detailDrawer.customer">
                <!--  Header  -->
                <div class="drawer-header pa-6">
                    <div class="d-flex justify-space-between align-start mb-4">
                        <v-btn icon="mdi-close" variant="text" size="small" @click="detailDrawer.open = false" />
                        <div class="d-flex ga-1">
                            <v-btn v-if="canManage" icon="mdi-pencil-outline" variant="text" size="small"
                                @click="openEdit(detailDrawer.customer!)" />
                            <v-btn v-if="detailDrawer.customer.phone" icon="mdi-whatsapp" variant="text" size="small"
                                color="success" @click="sendWhatsApp(detailDrawer.customer!)" />
                            <v-btn v-if="detailDrawer.customer.email" icon="mdi-email-outline" variant="text"
                                size="small" color="primary" @click="sendEmail(detailDrawer.customer!)" />
                        </div>
                    </div>

                    <div class="d-flex ga-4 align-center">
                        <v-avatar size="72" color="primary" variant="tonal">
                            <span class="text-h5 font-weight-black">
                                {{ initialsOf(detailDrawer.customer.full_name) }}
                            </span>
                        </v-avatar>
                        <div class="min-width-0 flex-grow-1">
                            <h2 class="text-h6 font-weight-black text-truncate">
                                {{ detailDrawer.customer.full_name }}
                            </h2>
                            <div class="text-caption text-medium-emphasis">
                                Cliente desde {{ fmtDate(detailDrawer.customer.created_at) }}
                            </div>
                            <v-chip v-if="segmentOf(detailDrawer.customer)" size="x-small"
                                :color="segmentMeta[segmentOf(detailDrawer.customer)!].color" variant="tonal"
                                :prepend-icon="segmentMeta[segmentOf(detailDrawer.customer)!].icon" class="mt-2">
                                {{ segmentMeta[segmentOf(detailDrawer.customer)!].label }}
                            </v-chip>
                        </div>
                    </div>

                    <!--  Stats resumo  -->
                    <v-row dense class="mt-5">
                        <v-col cols="4">
                            <div class="stat-mini">
                                <div class="text-caption text-medium-emphasis">Pedidos</div>
                                <div class="text-h6 font-weight-black">
                                    {{ customerLifetimeStats.ordersCount }}
                                </div>
                            </div>
                        </v-col>
                        <v-col cols="4">
                            <div class="stat-mini">
                                <div class="text-caption text-medium-emphasis">Gasto total</div>
                                <div class="text-h6 font-weight-black">
                                    {{ brl(customerLifetimeStats.totalSpent) }}
                                </div>
                            </div>
                        </v-col>
                        <v-col cols="4">
                            <div class="stat-mini">
                                <div class="text-caption text-medium-emphasis">Ticket</div>
                                <div class="text-h6 font-weight-black">
                                    {{ brl(customerLifetimeStats.avgTicket) }}
                                </div>
                            </div>
                        </v-col>
                    </v-row>
                </div>

                <v-divider />

                <div class="drawer-body pa-6">
                    <!--  Informações de contato  -->
                    <div class="mb-6">
                        <div class="text-overline mb-2">Contato</div>
                        <div class="info-list">
                            <div class="info-row">
                                <v-icon size="18" color="medium-emphasis">mdi-email-outline</v-icon>
                                <span>{{ detailDrawer.customer.email || '—' }}</span>
                            </div>
                            <div class="info-row">
                                <v-icon size="18" color="medium-emphasis">mdi-phone-outline</v-icon>
                                <span>{{ formatPhone(detailDrawer.customer.phone) }}</span>
                            </div>
                            <div class="info-row">
                                <v-icon size="18" color="medium-emphasis">mdi-card-account-details-outline</v-icon>
                                <span>{{ formatDoc(detailDrawer.customer.cpf_cnpj) }}</span>
                            </div>
                            <div class="info-row">
                                <v-icon size="18" color="medium-emphasis">mdi-cake-variant-outline</v-icon>
                                <span>{{ fmtDate(detailDrawer.customer.birth_date) }}</span>
                            </div>
                        </div>
                    </div>

                    <!--  Tags  -->
                    <div v-if="detailDrawer.customer.tags?.length" class="mb-6">
                        <div class="text-overline mb-2">Tags</div>
                        <div class="d-flex flex-wrap ga-1">
                            <v-chip v-for="tag in detailDrawer.customer.tags" :key="tag" size="small" variant="tonal"
                                :color="tagColor(tag)">
                                {{ tag }}
                            </v-chip>
                        </div>
                    </div>

                    <!--  Endereços  -->
                    <div v-if="detailDrawer.addresses.length" class="mb-6">
                        <div class="text-overline mb-2">
                            Endereços ({{ detailDrawer.addresses.length }})
                        </div>
                        <div class="d-flex flex-column ga-2">
                            <v-card v-for="addr in detailDrawer.addresses" :key="addr.id" variant="tonal" rounded="lg"
                                class="pa-3">
                                <div class="d-flex justify-space-between align-start">
                                    <div class="text-body-2">
                                        <div v-if="addr.label" class="font-weight-bold">{{ addr.label }}</div>
                                        <div>{{ addr.street }}, {{ addr.number || 's/n' }}</div>
                                        <div v-if="addr.complement" class="text-medium-emphasis">
                                            {{ addr.complement }}
                                        </div>
                                        <div class="text-caption text-medium-emphasis">
                                            {{ addr.neighborhood }} · {{ addr.city }}/{{ addr.state }} · {{
                                                addr.postal_code }}
                                        </div>
                                    </div>
                                    <v-chip v-if="addr.is_default" size="x-small" color="primary" variant="flat">
                                        Padrão
                                    </v-chip>
                                </div>
                            </v-card>
                        </div>
                    </div>

                    <!--  Histórico de compras  -->
                    <div class="mb-6">
                        <div class="d-flex align-center justify-space-between mb-2">
                            <div class="text-overline">
                                Histórico de compras
                                <v-chip v-if="detailDrawer.orders.length" size="x-small" variant="tonal" class="ml-1">
                                    {{ detailDrawer.orders.length }}
                                </v-chip>
                            </div>
                        </div>

                        <v-skeleton-loader v-if="detailDrawer.loading" v-for="i in 3" :key="'sk-' + i"
                            type="list-item-two-line" class="mb-2" />

                        <template v-else-if="detailDrawer.orders.length">
                            <div class="orders-timeline">
                                <div v-for="order in detailDrawer.orders" :key="order.id"
                                    class="order-item cursor-pointer"
                                    @click="router.push({ name: 'order-detail', params: { id: order.id } })">
                                    <v-avatar :color="statusMeta[order.status].color" variant="tonal" size="36"
                                        class="flex-shrink-0">
                                        <v-icon size="18">{{ statusMeta[order.status].icon }}</v-icon>
                                    </v-avatar>

                                    <div class="flex-grow-1 min-width-0">
                                        <div class="d-flex justify-space-between align-start">
                                            <div class="min-width-0">
                                                <div class="text-body-2 font-weight-bold">
                                                    #{{ order.order_number }}
                                                </div>
                                                <div class="text-caption text-medium-emphasis">
                                                    {{ fmtDate(order.created_at) }}
                                                    · {{ order.items_count?.[0]?.count ?? 0 }} item(s)
                                                </div>
                                            </div>
                                            <div class="text-right flex-shrink-0">
                                                <div class="text-body-2 font-weight-black">
                                                    {{ brl(order.total) }}
                                                </div>
                                                <v-chip size="x-small" :color="statusMeta[order.status].color"
                                                    variant="tonal">
                                                    {{ statusMeta[order.status].label }}
                                                </v-chip>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </template>

                        <div v-else class="text-center py-6">
                            <v-icon size="40" color="grey-lighten-1">mdi-cart-outline</v-icon>
                            <p class="text-body-2 text-medium-emphasis mt-2 mb-0">
                                Nenhuma compra ainda
                            </p>
                        </div>
                    </div>

                    <!--  Ação LGPD  -->
                    <div v-if="canManage" class="mt-8">
                        <v-btn variant="text" color="error" size="small" prepend-icon="mdi-account-off-outline"
                            class="text-none" @click="askAnonymize(detailDrawer.customer!)">
                            Anonimizar cliente (LGPD)
                        </v-btn>
                    </div>
                </div>
            </template>
        </v-navigation-drawer>

        <!-- ==================== DIALOG DE FORM ==================== -->
        <v-dialog v-model="formDialog.open" max-width="640" persistent>
            <v-card rounded="xl">
                <v-toolbar color="surface" border="b" density="comfortable">
                    <v-btn icon="mdi-close" variant="text" @click="formDialog.open = false" />
                    <v-toolbar-title class="font-weight-black">
                        {{ formDialog.editing ? 'Editar cliente' : 'Novo cliente' }}
                    </v-toolbar-title>
                </v-toolbar>

                <v-card-text class="pa-6">
                    <v-row>
                        <v-col cols="12">
                            <v-text-field v-model="formDialog.form.full_name" label="Nome completo *" variant="outlined"
                                density="comfortable" prepend-inner-icon="mdi-account-outline" autofocus />
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-text-field v-model="formDialog.form.email" label="E-mail" type="email" variant="outlined"
                                density="comfortable" prepend-inner-icon="mdi-email-outline" />
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-text-field v-model="formDialog.form.phone" label="Telefone" variant="outlined"
                                density="comfortable" prepend-inner-icon="mdi-phone-outline"
                                placeholder="(11) 99999-9999" />
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-text-field v-model="formDialog.form.cpf_cnpj" label="CPF ou CNPJ" variant="outlined"
                                density="comfortable" prepend-inner-icon="mdi-card-account-details-outline" />
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-text-field v-model="formDialog.form.birth_date" type="date" label="Data de nascimento"
                                variant="outlined" density="comfortable"
                                prepend-inner-icon="mdi-cake-variant-outline" />
                        </v-col>

                        <v-col cols="12">
                            <div class="text-subtitle-2 font-weight-bold mb-2">Tags</div>
                            <div class="d-flex flex-wrap ga-1 mb-2">
                                <v-chip v-for="tag in formDialog.form.tags" :key="tag" closable size="small"
                                    variant="tonal" :color="tagColor(tag)" @click:close="removeTagFromForm(tag)">
                                    {{ tag }}
                                </v-chip>
                            </div>
                            <v-text-field v-model="formDialog.form.newTag"
                                placeholder="Digite e pressione Enter para adicionar" variant="outlined"
                                density="compact" hide-details prepend-inner-icon="mdi-tag-plus-outline"
                                @keyup.enter="addTagToForm">
                                <template #append-inner>
                                    <v-btn v-if="formDialog.form.newTag.trim()" icon="mdi-check" size="x-small"
                                        color="primary" variant="flat" @click="addTagToForm" />
                                </template>
                            </v-text-field>
                            <div v-if="availableTags.length" class="mt-2">
                                <span class="text-caption text-medium-emphasis mr-1">Sugestões:</span>
                                <v-chip
                                    v-for="tag in availableTags.filter(t => !formDialog.form.tags.includes(t)).slice(0, 6)"
                                    :key="tag" size="x-small" variant="outlined" class="ma-1 cursor-pointer"
                                    @click="formDialog.form.tags.push(tag)">
                                    + {{ tag }}
                                </v-chip>
                            </div>
                        </v-col>
                    </v-row>
                </v-card-text>

                <v-divider />

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="saving" @click="formDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6" :loading="saving"
                        @click="saveCustomer">
                        {{ formDialog.editing ? 'Salvar' : 'Cadastrar' }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== DIALOG DE ANONIMIZAÇÃO LGPD ==================== -->
        <v-dialog v-model="confirmAnonymize.open" max-width="520" persistent>
            <v-card v-if="confirmAnonymize.customer" rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-shield-alert-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Anonimizar cliente (LGPD)
                    </v-card-title>
                </v-card-item>

                <v-card-text>
                    <p class="text-body-2 mb-4">
                        Esta ação é <strong>irreversível</strong>. Todos os dados pessoais de
                        <strong>{{ confirmAnonymize.customer.full_name }}</strong> serão apagados
                        (nome, e-mail, telefone, CPF/CNPJ, data de nascimento) e substituídos por "ANONIMIZADO".
                    </p>

                    <v-alert type="info" variant="tonal" density="compact" rounded="lg" class="mb-4">
                        <div class="text-caption">
                            Os pedidos, valores e histórico de compras <strong>permanecem intactos</strong>
                            para fins fiscais, mas ficarão dissociados de qualquer identificação pessoal.
                        </div>
                    </v-alert>

                    <v-text-field v-model="confirmAnonymize.typedConfirmation"
                        label='Digite "ANONIMIZAR" para confirmar' variant="outlined" density="comfortable" />
                </v-card-text>

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="anonymizing"
                        @click="confirmAnonymize.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" class="text-none" rounded="pill" :loading="anonymizing"
                        :disabled="!canConfirmAnonymize" @click="doAnonymize">
                        Anonimizar permanentemente
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<style scoped>
.customers-table :deep(thead th) {
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

/* ============================================================ */
/*  Drawer                                                      */
/* ============================================================ */
.detail-drawer :deep(.v-navigation-drawer__content) {
    display: flex;
    flex-direction: column;
}

.drawer-header {
    background: linear-gradient(135deg,
            rgba(var(--v-theme-primary), 0.06) 0%,
            rgba(var(--v-theme-primary), 0.02) 100%);
}

.drawer-body {
    flex: 1;
    overflow-y: auto;
}

/* Stats mini */
.stat-mini {
    background: rgb(var(--v-theme-surface));
    border-radius: 10px;
    padding: 10px 12px;
    text-align: center;
    border: 1px solid rgba(var(--v-border-color), 0.1);
}

/* Info list */
.info-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.info-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.875rem;
    color: rgb(var(--v-theme-on-surface));
}

/* ============================================================ */
/*  Timeline de pedidos                                         */
/* ============================================================ */
.orders-timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.order-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(var(--v-border-color), 0.1);
    transition: all 0.15s ease;
}

.order-item:hover {
    border-color: rgba(var(--v-theme-primary), 0.4);
    background: rgba(var(--v-theme-primary), 0.03);
    transform: translateX(2px);
}
</style>
