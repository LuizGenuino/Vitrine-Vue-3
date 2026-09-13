<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useRealtime } from '@/composables/useRealtime'
import { supabase } from '@/lib/supabase'

import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue'
import EmptyState from '@/components/base/EmptyState.vue'

import type { Coupon } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const auth = useAuthStore()
const notify = useNotifications()
const { currentStoreId, currentRole } = storeToRefs(auth)

const canManage = computed(() =>
    currentRole.value && ['OWNER', 'ADMIN', 'MANAGER'].includes(currentRole.value),
)

/* -------------------------------------------------------------------------- */
/*  Types & metadata                                                          */
/* -------------------------------------------------------------------------- */

type CouponType = 'PERCENTAGE' | 'FIXED' | 'SHIPPING'
type CouponStatus = 'active' | 'scheduled' | 'expired' | 'exhausted' | 'paused'

interface CouponWithUsage extends Coupon {
    computed_status?: CouponStatus
    order_count?: number
    total_discount?: number
}

const typeMeta: Record<CouponType, { label: string; icon: string; color: string; description: string }> = {
    PERCENTAGE: { label: 'Percentual', icon: 'mdi-percent-outline', color: 'primary', description: 'Desconto em % sobre o subtotal' },
    FIXED: { label: 'Valor fixo', icon: 'mdi-currency-brl', color: 'success', description: 'Desconto de um valor exato em R$' },
    SHIPPING: { label: 'Frete grátis', icon: 'mdi-truck-outline', color: 'info', description: 'Zera o custo de frete do pedido' },
}

const statusMeta: Record<CouponStatus, { label: string; color: string; icon: string }> = {
    active: { label: 'Ativo', color: 'success', icon: 'mdi-check-circle-outline' },
    scheduled: { label: 'Agendado', color: 'info', icon: 'mdi-clock-outline' },
    expired: { label: 'Expirado', color: 'grey', icon: 'mdi-calendar-remove-outline' },
    exhausted: { label: 'Esgotado', color: 'warning', icon: 'mdi-alert-octagon-outline' },
    paused: { label: 'Pausado', color: 'grey', icon: 'mdi-pause-circle-outline' },
}

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

const brl = (v: number | string | null | undefined) =>
    Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

const fmtDateTime = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'

const daysUntil = (iso: string | null): number | null => {
    if (!iso) return null
    const diff = new Date(iso).getTime() - Date.now()
    return Math.ceil(diff / 86_400_000)
}

/* -------------------------------------------------------------------------- */
/*  Cálculo de status                                                         */
/* -------------------------------------------------------------------------- */

function computeStatus(c: Coupon): CouponStatus {
    if (!c.is_active) return 'paused'
    const now = new Date()
    if (c.valid_from && new Date(c.valid_from) > now) return 'scheduled'
    if (c.valid_until && new Date(c.valid_until) < now) return 'expired'
    if (c.max_uses !== null && c.max_uses !== undefined && (c.uses_count ?? 0) >= c.max_uses) return 'exhausted'
    return 'active'
}

/* -------------------------------------------------------------------------- */
/*  Filtros                                                                   */
/* -------------------------------------------------------------------------- */

interface Filters {
    search: string
    type: CouponType | ''
    status: CouponStatus | ''
}

const filters = reactive<Filters>({
    search: '',
    type: '',
    status: '',
})

const pagination = reactive({ page: 1, pageSize: 25 })
const totalItems = ref(0)

/* -------------------------------------------------------------------------- */
/*  Query — lista de cupons                                                   */
/* -------------------------------------------------------------------------- */

const couponsQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return []

    const from = (pagination.page - 1) * pagination.pageSize
    const to = from + pagination.pageSize - 1

    let query = supabase
        .from('coupons')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to)

    if (filters.search) query = query.ilike('code', `%${filters.search}%`)
    if (filters.type) query = query.eq('type', filters.type)

    const { data, error, count } = await query
    if (error) throw error
    totalItems.value = count ?? 0
    return (data ?? []) as Coupon[]
}, { watchSource: [currentStoreId] })

const coupons = computed<CouponWithUsage[]>(() =>
    (couponsQuery.data.value ?? []).map(c => ({
        ...c,
        computed_status: computeStatus(c),
    })),
)

const filteredCoupons = computed(() => {
    if (!filters.status) return coupons.value
    return coupons.value.filter(c => c.computed_status === filters.status)
})

/* -------------------------------------------------------------------------- */
/*  Query — uso agregado (quantos pedidos e desconto total gerado)            */
/* -------------------------------------------------------------------------- */

const usageMap = ref<Record<string, { order_count: number; total_discount: number }>>({})

watch(coupons, async (list) => {
    if (!list.length) { usageMap.value = {}; return }

    const { data } = await supabase
        .from('orders')
        .select('coupon_id, discount')
        .in('coupon_id', list.map(c => c.id))
        .in('status', ['PAID', 'DELIVERED'])
        .is('deleted_at', null)

    const map: typeof usageMap.value = {}
    for (const o of data ?? []) {
        const key = o.coupon_id as string
        if (!map[key]) map[key] = { order_count: 0, total_discount: 0 }
        map[key].order_count++
        map[key].total_discount += Number(o.discount ?? 0)
    }
    usageMap.value = map
}, { immediate: true })

/* -------------------------------------------------------------------------- */
/*  Métricas globais                                                          */
/* -------------------------------------------------------------------------- */

const metrics = computed(() => {
    const list = coupons.value
    const active = list.filter(c => c.computed_status === 'active').length
    const scheduled = list.filter(c => c.computed_status === 'scheduled').length
    const totalDiscount = Object.values(usageMap.value).reduce((s, v) => s + v.total_discount, 0)
    const totalOrders = Object.values(usageMap.value).reduce((s, v) => s + v.order_count, 0)

    return {
        total: list.length,
        active,
        scheduled,
        totalOrders,
        totalDiscount,
    }
})

/* -------------------------------------------------------------------------- */
/*  Form dialog                                                               */
/* -------------------------------------------------------------------------- */

interface CouponForm {
    id: string | null
    code: string
    type: CouponType
    value: number
    min_order_value: number | null
    max_uses: number | null
    valid_from: string
    valid_until: string
    is_active: boolean
}

const emptyForm: CouponForm = {
    id: null,
    code: '',
    type: 'PERCENTAGE',
    value: 10,
    min_order_value: null,
    max_uses: null,
    valid_from: '',
    valid_until: '',
    is_active: true,
}

const formDialog = reactive({
    open: false,
    editing: false,
    form: { ...emptyForm },
})

function openCreate() {
    formDialog.editing = false
    formDialog.form = { ...emptyForm, code: generateCode() }
    formDialog.open = true
}

function openEdit(coupon: Coupon) {
    formDialog.editing = true
    formDialog.form = {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type as CouponType,
        value: Number(coupon.value),
        min_order_value: coupon.min_order_value !== null ? Number(coupon.min_order_value) : null,
        max_uses: coupon.max_uses,
        valid_from: coupon.valid_from ? coupon.valid_from.slice(0, 16) : '',
        valid_until: coupon.valid_until ? coupon.valid_until.slice(0, 16) : '',
        is_active: coupon.is_active,
    }
    formDialog.open = true
}

function openDuplicate(coupon: Coupon) {
    formDialog.editing = false
    formDialog.form = {
        id: null,
        code: `${coupon.code}-COPY-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        type: coupon.type as CouponType,
        value: Number(coupon.value),
        min_order_value: coupon.min_order_value !== null ? Number(coupon.min_order_value) : null,
        max_uses: coupon.max_uses,
        valid_from: '',
        valid_until: '',
        is_active: true,
    }
    formDialog.open = true
}

function generateCode(prefix = ''): string {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase()
    return prefix ? `${prefix}-${random}` : random
}

/* Validação do form */
const formErrors = computed(() => {
    const errs: Record<string, string> = {}
    const f = formDialog.form

    if (!f.code.trim()) errs.code = 'Código obrigatório'
    else if (!/^[A-Z0-9_-]+$/.test(f.code)) errs.code = 'Use apenas letras maiúsculas, números, hífen e underline'
    else if (f.code.length < 3) errs.code = 'Mínimo 3 caracteres'

    if (f.type === 'PERCENTAGE') {
        if (f.value <= 0) errs.value = 'Deve ser maior que 0'
        if (f.value > 100) errs.value = 'Máximo 100%'
    } else if (f.type === 'FIXED') {
        if (f.value <= 0) errs.value = 'Deve ser maior que R$ 0'
    }

    if (f.valid_from && f.valid_until && new Date(f.valid_from) >= new Date(f.valid_until)) {
        errs.valid_until = 'Data final deve ser posterior à inicial'
    }

    if (f.max_uses !== null && f.max_uses <= 0) errs.max_uses = 'Deve ser maior que 0'

    return errs
})

const isFormValid = computed(() => Object.keys(formErrors.value).length === 0)

/* Preview do cupom aplicado em pedido de exemplo */
const previewOrderValue = ref(150)

const previewCalculation = computed(() => {
    const f = formDialog.form
    const subtotal = previewOrderValue.value

    if (f.min_order_value && subtotal < f.min_order_value) {
        return {
            applies: false,
            reason: `Pedido mínimo: ${brl(f.min_order_value)}`,
            subtotal,
            discount: 0,
            total: subtotal,
        }
    }

    let discount = 0
    if (f.type === 'PERCENTAGE') discount = subtotal * (f.value / 100)
    else if (f.type === 'FIXED') discount = Math.min(f.value, subtotal)
    else if (f.type === 'SHIPPING') discount = 0 // frete separado

    return {
        applies: true,
        reason: '',
        subtotal,
        discount,
        total: Math.max(0, subtotal - discount),
        freeShipping: f.type === 'SHIPPING',
    }
})

/* Save */
const { execute: saveCoupon, loading: saving } = useAsyncAction(
    async () => {
        if (!currentStoreId.value) throw new Error('Sem loja ativa')
        if (!isFormValid.value) throw new Error('Corrija os erros do formulário')

        const f = formDialog.form
        const payload = {
            code: f.code.trim().toUpperCase(),
            type: f.type,
            value: f.value,
            min_order_value: f.min_order_value || null,
            max_uses: f.max_uses,
            valid_from: f.valid_from ? new Date(f.valid_from).toISOString() : null,
            valid_until: f.valid_until ? new Date(f.valid_until).toISOString() : null,
            is_active: f.is_active,
        }

        if (formDialog.editing && f.id) {
            const { error } = await supabase.from('coupons').update(payload).eq('id', f.id)
            if (error) {
                if (error.code === '23505') throw new Error('Já existe um cupom com esse código')
                throw error
            }
        } else {
            const { error } = await supabase.from('coupons').insert({
                ...payload,
                store_id: currentStoreId.value,
            })
            if (error) {
                if (error.code === '23505') throw new Error('Já existe um cupom com esse código')
                throw error
            }
        }

        formDialog.open = false
        await couponsQuery.refresh()
    },
    { successMsg: 'Cupom salvo' },
)

/* -------------------------------------------------------------------------- */
/*  Toggle ativo/pausado                                                      */
/* -------------------------------------------------------------------------- */

const { execute: toggleActive } = useAsyncAction(
    async (coupon: Coupon) => {
        await supabase
            .from('coupons')
            .update({ is_active: !coupon.is_active })
            .eq('id', coupon.id)
        await couponsQuery.refresh()
    },
    { successMsg: 'Status atualizado' },
)

/* -------------------------------------------------------------------------- */
/*  Delete                                                                    */
/* -------------------------------------------------------------------------- */

const confirmDelete = reactive({
    open: false,
    coupon: null as Coupon | null,
})

function askDelete(coupon: Coupon) {
    confirmDelete.coupon = coupon
    confirmDelete.open = true
}

const { execute: doDelete, loading: deleting } = useAsyncAction(
    async () => {
        if (!confirmDelete.coupon) return
        await supabase
            .from('coupons')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', confirmDelete.coupon.id)
        confirmDelete.open = false
        await couponsQuery.refresh()
    },
    { successMsg: 'Cupom excluído' },
)

/* -------------------------------------------------------------------------- */
/*  Copiar código                                                             */
/* -------------------------------------------------------------------------- */

async function copyCode(code: string) {
    await navigator.clipboard.writeText(code)
    notify.success(`Código "${code}" copiado`)
}

async function copyShareableLink(coupon: Coupon) {
    const store = auth.currentStore
    if (!store?.slug) {
        notify.error('Configure o slug da loja primeiro')
        return
    }
    const url = `${window.location.origin}/s/${store.slug}?cupom=${coupon.code}`
    await navigator.clipboard.writeText(url)
    notify.success('Link com cupom pré-aplicado copiado')
}

/* -------------------------------------------------------------------------- */
/*  Realtime                                                                  */
/* -------------------------------------------------------------------------- */

useRealtime<Coupon>({
    table: 'coupons',
    event: '*',
    scopedToStore: true,
    onChange: () => couponsQuery.refresh(),
})

/* -------------------------------------------------------------------------- */
/*  Watchers                                                                  */
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

watch(
    [() => filters.search, () => filters.type, () => pagination.page, () => pagination.pageSize],
    () => couponsQuery.refresh(),
)

function clearFilters() {
    filters.search = ''
    filters.type = ''
    filters.status = ''
    searchInput.value = ''
    pagination.page = 1
}

const hasActiveFilters = computed(() =>
    !!filters.search || !!filters.type || !!filters.status,
)

/* -------------------------------------------------------------------------- */
/*  Auto-uppercase do código no form                                          */
/* -------------------------------------------------------------------------- */

watch(() => formDialog.form.code, (v) => {
    const upper = v.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    if (upper !== v) formDialog.form.code = upper
})

/* -------------------------------------------------------------------------- */
/*  Headers                                                                   */
/* -------------------------------------------------------------------------- */

const headers = [
    { title: 'Código', key: 'code', sortable: false },
    { title: 'Tipo', key: 'type', sortable: false, align: 'center' as const },
    { title: 'Valor', key: 'value', sortable: false, align: 'end' as const },
    { title: 'Uso', key: 'usage', sortable: false, align: 'center' as const },
    { title: 'Validade', key: 'validity', sortable: false },
    { title: 'Status', key: 'status', sortable: false, align: 'center' as const },
    { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 100 },
]

onMounted(() => couponsQuery.refresh())
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- ==================== HEADER ==================== -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">Cupons de desconto</h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Crie campanhas com desconto para atrair novos clientes e aumentar vendas.
                </p>
            </div>

            <v-btn v-if="canManage" color="primary" prepend-icon="mdi-plus" rounded="pill" elevation="0"
                class="text-none px-6" @click="openCreate">
                Novo cupom
            </v-btn>
        </header>

        <!-- ==================== MÉTRICAS ==================== -->
        <v-row dense>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="couponsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Cupons ativos" :value="metrics.active"
                    icon="mdi-ticket-percent-outline" description="Disponíveis agora" color="success"
                    @click="filters.status = 'active'" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="couponsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Agendados" :value="metrics.scheduled" icon="mdi-clock-outline"
                    description="Iniciam no futuro" color="info" @click="filters.status = 'scheduled'" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="couponsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Pedidos com cupom" :value="metrics.totalOrders" icon="mdi-cart-check"
                    description="Vendas influenciadas" color="primary" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="couponsQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Descontos concedidos" :value="brl(metrics.totalDiscount)"
                    icon="mdi-cash-refund" description="Total dispensado" color="warning" />
            </v-col>
        </v-row>

        <!-- ==================== FILTROS ==================== -->
        <v-card rounded="xl" border flat class="pa-4">
            <v-row dense align="center">
                <v-col cols="12" md="4">
                    <v-text-field v-model="searchInput" prepend-inner-icon="mdi-magnify"
                        placeholder="Buscar por código..." variant="outlined" density="comfortable" hide-details
                        rounded="pill" clearable />
                </v-col>
                <v-col cols="6" md="3">
                    <v-select v-model="filters.type" :items="[
                        { title: 'Todos os tipos', value: '' },
                        ...Object.entries(typeMeta).map(([k, v]) => ({ title: v.label, value: k })),
                    ]" variant="outlined" density="comfortable" hide-details rounded="pill"
                        prepend-inner-icon="mdi-shape-outline" />
                </v-col>
                <v-col cols="6" md="3">
                    <v-select v-model="filters.status" :items="[
                        { title: 'Todos os status', value: '' },
                        ...Object.entries(statusMeta).map(([k, v]) => ({ title: v.label, value: k })),
                    ]" variant="outlined" density="comfortable" hide-details rounded="pill"
                        prepend-inner-icon="mdi-toggle-switch-outline" />
                </v-col>
                <v-col cols="12" md="2" class="d-flex justify-end">
                    <v-btn v-if="hasActiveFilters" variant="text" color="medium-emphasis" class="text-none"
                        prepend-icon="mdi-filter-off-outline" @click="clearFilters">
                        Limpar
                    </v-btn>
                </v-col>
            </v-row>
        </v-card>

        <!-- ==================== TABELA ==================== -->
        <v-card rounded="xl" border flat class="overflow-hidden">
            <v-data-table-server :headers="headers" :items="filteredCoupons" :items-length="totalItems"
                :loading="couponsQuery.loading.value" :items-per-page="pagination.pageSize" :page="pagination.page"
                :items-per-page-options="[10, 25, 50, 100]" hover density="comfortable" class="coupons-table"
                @update:options="(o) => {
                    if (o.page !== pagination.page) pagination.page = o.page
                    if (o.itemsPerPage !== pagination.pageSize) pagination.pageSize = o.itemsPerPage
                }">
                <!-- Código -->
                <template #item.code="{ item }">
                    <div class="d-flex align-center ga-2 py-2">
                        <code class="coupon-code">{{ item.code }}</code>
                        <v-btn icon="mdi-content-copy" size="x-small" variant="text" @click="copyCode(item.code)" />
                    </div>
                </template>

                <!-- Tipo -->
                <template #item.type="{ item }">
                    <v-chip size="small" :color="typeMeta[item.type as CouponType].color" variant="tonal"
                        :prepend-icon="typeMeta[item.type as CouponType].icon">
                        {{ typeMeta[item.type as CouponType].label }}
                    </v-chip>
                </template>

                <!-- Valor -->
                <template #item.value="{ item }">
                    <div class="font-weight-bold">
                        <template v-if="item.type === 'PERCENTAGE'">
                            {{ item.value }}%
                        </template>
                        <template v-else-if="item.type === 'FIXED'">
                            {{ brl(item.value) }}
                        </template>
                        <template v-else>
                            Grátis
                        </template>
                    </div>
                    <div v-if="item.min_order_value" class="text-caption text-medium-emphasis">
                        Mín. {{ brl(item.min_order_value) }}
                    </div>
                </template>

                <!-- Uso -->
                <template #item.usage="{ item }">
                    <div class="d-flex flex-column align-center">
                        <div class="text-body-2 font-weight-bold">
                            {{ item.uses_count ?? 0 }}
                            <span class="text-caption text-medium-emphasis font-weight-regular">
                                / {{ item.max_uses ?? '∞' }}
                            </span>
                        </div>
                        <v-progress-linear v-if="item.max_uses"
                            :model-value="((item.uses_count ?? 0) / item.max_uses) * 100"
                            :color="(item.uses_count ?? 0) / item.max_uses >= 0.9 ? 'warning' : 'primary'" height="4"
                            rounded style="width: 80px" class="mt-1" />
                        <div v-if="usageMap[item.id]?.total_discount" class="text-caption text-success mt-1">
                            −{{ brl(usageMap[item.id].total_discount) }}
                        </div>
                    </div>
                </template>

                <!-- Validade -->
                <template #item.validity="{ item }">
                    <div class="text-caption">
                        <div v-if="item.valid_from || item.valid_until">
                            <span v-if="item.valid_from">
                                <v-icon size="12" color="medium-emphasis">mdi-calendar-start</v-icon>
                                {{ fmtDate(item.valid_from) }}
                            </span>
                            <span v-if="item.valid_from && item.valid_until"> · </span>
                            <span v-if="item.valid_until">
                                <v-icon size="12" color="medium-emphasis">mdi-calendar-end</v-icon>
                                {{ fmtDate(item.valid_until) }}
                            </span>
                        </div>
                        <div v-else class="text-medium-emphasis italic">
                            Sem validade
                        </div>
                        <div v-if="item.valid_until && item.computed_status === 'active'"
                            class="text-caption font-weight-medium mt-1"
                            :class="daysUntil(item.valid_until)! <= 3 ? 'text-error' : daysUntil(item.valid_until)! <= 7 ? 'text-warning' : 'text-medium-emphasis'">
                            <template v-if="daysUntil(item.valid_until)! === 0">
                                Expira hoje!
                            </template>
                            <template v-else-if="daysUntil(item.valid_until)! === 1">
                                Expira amanhã
                            </template>
                            <template v-else>
                                {{ daysUntil(item.valid_until) }} dias restantes
                            </template>
                        </div>
                    </div>
                </template>

                <!-- Status -->
                <template #item.status="{ item }">
                    <v-chip size="small" :color="statusMeta[item.computed_status!].color" variant="tonal"
                        :prepend-icon="statusMeta[item.computed_status!].icon">
                        {{ statusMeta[item.computed_status!].label }}
                    </v-chip>
                </template>

                <!-- Ações -->
                <template #item.actions="{ item }">
                    <div class="d-flex justify-end ga-1">
                        <v-tooltip :text="item.is_active ? 'Pausar' : 'Ativar'">
                            <template #activator="{ props: tp }">
                                <v-btn v-bind="tp" :icon="item.is_active ? 'mdi-pause' : 'mdi-play'" variant="text"
                                    size="small" :color="item.is_active ? 'warning' : 'success'" :disabled="!canManage"
                                    @click="toggleActive(item)" />
                            </template>
                        </v-tooltip>

                        <v-menu location="bottom end">
                            <template #activator="{ props: mp }">
                                <v-btn v-bind="mp" icon="mdi-dots-vertical" variant="text" size="small" />
                            </template>
                            <v-list density="compact" min-width="220">
                                <v-list-item prepend-icon="mdi-pencil-outline" title="Editar" :disabled="!canManage"
                                    @click="openEdit(item)" />
                                <v-list-item prepend-icon="mdi-content-duplicate" title="Duplicar"
                                    :disabled="!canManage" @click="openDuplicate(item)" />
                                <v-list-item prepend-icon="mdi-link-variant" title="Copiar link com cupom"
                                    @click="copyShareableLink(item)" />
                                <v-list-item prepend-icon="mdi-content-copy" title="Copiar código"
                                    @click="copyCode(item.code)" />
                                <v-divider class="my-1" />
                                <v-list-item prepend-icon="mdi-trash-can-outline" title="Excluir" base-color="error"
                                    :disabled="!canManage" @click="askDelete(item)" />
                            </v-list>
                        </v-menu>
                    </div>
                </template>

                <template #no-data>
                    <EmptyState title="Nenhum cupom cadastrado" :description="hasActiveFilters
                        ? 'Ajuste os filtros para ver mais resultados.'
                        : 'Crie seu primeiro cupom para começar campanhas promocionais.'"
                        icon="mdi-ticket-percent-outline" />
                </template>
            </v-data-table-server>
        </v-card>

        <!-- ==================== DIALOG DE FORMULÁRIO ==================== -->
        <v-dialog v-model="formDialog.open" max-width="820" persistent scrollable>
            <v-card rounded="xl" class="form-dialog">
                <v-toolbar color="surface" border="b" density="comfortable">
                    <v-btn icon="mdi-close" variant="text" @click="formDialog.open = false" />
                    <v-toolbar-title class="font-weight-black">
                        {{ formDialog.editing ? 'Editar cupom' : 'Novo cupom' }}
                    </v-toolbar-title>
                </v-toolbar>

                <v-card-text class="pa-6">
                    <v-row>
                        <!-- =========== COLUNA ESQUERDA: FORM =========== -->
                        <v-col cols="12" md="7">
                            <!-- Código -->
                            <div class="mb-4">
                                <div class="text-subtitle-2 font-weight-bold mb-2">Código do cupom</div>
                                <div class="d-flex ga-2">
                                    <v-text-field v-model="formDialog.form.code" placeholder="EX: BLACKFRIDAY2026"
                                        variant="outlined" density="comfortable" hide-details
                                        prepend-inner-icon="mdi-ticket-percent-outline" :error="!!formErrors.code" />
                                    <v-btn variant="tonal" icon="mdi-refresh"
                                        @click="formDialog.form.code = generateCode()" />
                                </div>
                                <div v-if="formErrors.code" class="text-caption text-error mt-1">
                                    {{ formErrors.code }}
                                </div>
                                <div v-else class="text-caption text-medium-emphasis mt-1">
                                    Apenas letras maiúsculas, números, hífen e underline
                                </div>
                            </div>

                            <!-- Tipo -->
                            <div class="mb-4">
                                <div class="text-subtitle-2 font-weight-bold mb-2">Tipo de desconto</div>
                                <div class="type-picker">
                                    <v-card v-for="(meta, key) in typeMeta" :key="key" variant="outlined" rounded="lg"
                                        class="type-card pa-3 cursor-pointer"
                                        :class="{ active: formDialog.form.type === key }"
                                        @click="formDialog.form.type = key as CouponType">
                                        <div class="d-flex align-center ga-2">
                                            <v-avatar :color="meta.color" variant="tonal" size="32">
                                                <v-icon size="18">{{ meta.icon }}</v-icon>
                                            </v-avatar>
                                            <div class="min-width-0">
                                                <div class="text-body-2 font-weight-bold">{{ meta.label }}</div>
                                                <div class="text-caption text-medium-emphasis text-truncate">
                                                    {{ meta.description }}
                                                </div>
                                            </div>
                                        </div>
                                    </v-card>
                                </div>
                            </div>

                            <!-- Valor -->
                            <v-row dense>
                                <v-col v-if="formDialog.form.type !== 'SHIPPING'" cols="12" md="6">
                                    <v-text-field v-model.number="formDialog.form.value"
                                        :label="formDialog.form.type === 'PERCENTAGE' ? 'Percentual de desconto *' : 'Valor de desconto *'"
                                        :prefix="formDialog.form.type === 'PERCENTAGE' ? '' : 'R$'"
                                        :suffix="formDialog.form.type === 'PERCENTAGE' ? '%' : ''" type="number"
                                        :max="formDialog.form.type === 'PERCENTAGE' ? 100 : undefined" min="0"
                                        step="0.01" variant="outlined" density="comfortable" :error="!!formErrors.value"
                                        :messages="formErrors.value" />
                                </v-col>
                                <v-col :cols="formDialog.form.type === 'SHIPPING' ? 12 : 12"
                                    :md="formDialog.form.type === 'SHIPPING' ? 12 : 6">
                                    <v-text-field v-model.number="formDialog.form.min_order_value"
                                        label="Pedido mínimo (opcional)" prefix="R$" type="number" min="0" step="0.01"
                                        variant="outlined" density="comfortable"
                                        hint="Deixe vazio para não exigir valor mínimo" persistent-hint />
                                </v-col>
                            </v-row>

                            <v-divider class="my-4" />

                            <!-- Limite de uso -->
                            <div class="mb-4">
                                <div class="text-subtitle-2 font-weight-bold mb-2">Limite de uso</div>
                                <v-text-field v-model.number="formDialog.form.max_uses"
                                    label="Quantidade máxima de usos (opcional)" type="number" min="1"
                                    variant="outlined" density="comfortable" prepend-inner-icon="mdi-counter"
                                    hint="Deixe vazio para usos ilimitados" persistent-hint
                                    :error="!!formErrors.max_uses" :messages="formErrors.max_uses" />
                            </div>

                            <!-- Validade -->
                            <div class="mb-4">
                                <div class="text-subtitle-2 font-weight-bold mb-2">Período de validade</div>
                                <v-row dense>
                                    <v-col cols="12" md="6">
                                        <v-text-field v-model="formDialog.form.valid_from" type="datetime-local"
                                            label="Válido a partir de" variant="outlined" density="comfortable"
                                            prepend-inner-icon="mdi-calendar-start" />
                                    </v-col>
                                    <v-col cols="12" md="6">
                                        <v-text-field v-model="formDialog.form.valid_until" type="datetime-local"
                                            label="Válido até" variant="outlined" density="comfortable"
                                            prepend-inner-icon="mdi-calendar-end" :error="!!formErrors.valid_until"
                                            :messages="formErrors.valid_until" />
                                    </v-col>
                                </v-row>
                                <div class="text-caption text-medium-emphasis mt-1">
                                    Deixe vazio para cupom sem prazo de expiração
                                </div>
                            </div>

                            <!-- Ativo -->
                            <v-switch v-model="formDialog.form.is_active" color="success" hide-details
                                density="compact">
                                <template #label>
                                    <div>
                                        <div class="text-body-2 font-weight-medium">
                                            Cupom ativo
                                        </div>
                                        <div class="text-caption text-medium-emphasis">
                                            Se desativado, não poderá ser aplicado mesmo dentro da validade
                                        </div>
                                    </div>
                                </template>
                            </v-switch>
                        </v-col>

                        <!-- =========== COLUNA DIREITA: PREVIEW =========== -->
                        <v-col cols="12" md="5">
                            <div class="sticky-preview">
                                <div class="text-subtitle-2 font-weight-bold mb-3">
                                    Simulação de aplicação
                                </div>

                                <!-- Card de simulação -->
                                <v-card variant="tonal" rounded="lg" class="pa-4 mb-3">
                                    <div class="text-caption text-medium-emphasis mb-2">
                                        Valor do pedido de teste
                                    </div>
                                    <v-text-field v-model.number="previewOrderValue" prefix="R$" type="number" min="0"
                                        step="10" variant="outlined" density="compact" hide-details class="mb-3" />

                                    <v-divider class="my-3" />

                                    <div class="d-flex justify-space-between text-body-2 mb-2">
                                        <span>Subtotal</span>
                                        <span>{{ brl(previewCalculation.subtotal) }}</span>
                                    </div>

                                    <template v-if="previewCalculation.applies">
                                        <div v-if="previewCalculation.discount > 0"
                                            class="d-flex justify-space-between text-body-2 text-success mb-2">
                                            <span>Desconto ({{ formDialog.form.code || 'CUPOM' }})</span>
                                            <span>−{{ brl(previewCalculation.discount) }}</span>
                                        </div>
                                        <div v-if="previewCalculation.freeShipping"
                                            class="d-flex justify-space-between text-body-2 text-info mb-2">
                                            <span>Frete</span>
                                            <span class="font-weight-bold">GRÁTIS</span>
                                        </div>
                                        <v-divider class="my-2" />
                                        <div class="d-flex justify-space-between text-h6 font-weight-black">
                                            <span>Total</span>
                                            <span class="text-success">{{ brl(previewCalculation.total) }}</span>
                                        </div>
                                    </template>
                                    <template v-else>
                                        <v-alert type="warning" variant="tonal" density="compact" rounded="lg"
                                            class="mt-2" icon="mdi-alert-outline">
                                            <div class="text-caption">
                                                Cupom não se aplica: {{ previewCalculation.reason }}
                                            </div>
                                        </v-alert>
                                    </template>
                                </v-card>

                                <!-- Dicas -->
                                <v-card variant="tonal" color="info" rounded="lg" class="pa-3">
                                    <div class="text-caption d-flex align-start ga-2">
                                        <v-icon size="16">mdi-lightbulb-outline</v-icon>
                                        <div>
                                            <strong>Dica:</strong>
                                            <span v-if="formDialog.form.type === 'PERCENTAGE'">
                                                Cupons percentuais funcionam melhor em datas comemorativas.
                                            </span>
                                            <span v-else-if="formDialog.form.type === 'FIXED'">
                                                Ideal para valores acima do ticket médio.
                                            </span>
                                            <span v-else>
                                                Frete grátis é o incentivo #1 do e-commerce brasileiro.
                                            </span>
                                        </div>
                                    </div>
                                </v-card>
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
                        :disabled="!isFormValid" @click="saveCoupon">
                        {{ formDialog.editing ? 'Salvar' : 'Criar cupom' }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== CONFIRMAÇÃO DE EXCLUSÃO ==================== -->
        <v-dialog v-model="confirmDelete.open" max-width="460" persistent>
            <v-card v-if="confirmDelete.coupon" rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-alert-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Excluir cupom "{{ confirmDelete.coupon.code }}"?
                    </v-card-title>
                </v-card-item>

                <v-card-text>
                    <p class="text-body-2 mb-2">
                        O cupom será movido para a lixeira e não poderá mais ser aplicado.
                    </p>
                    <v-alert v-if="usageMap[confirmDelete.coupon.id]?.order_count" type="info" variant="tonal"
                        density="compact" rounded="lg">
                        <div class="text-caption">
                            Este cupom já foi usado em
                            <strong>{{ usageMap[confirmDelete.coupon.id].order_count }} pedido(s)</strong>
                            — o histórico é preservado.
                        </div>
                    </v-alert>
                </v-card-text>

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="deleting" @click="confirmDelete.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" rounded="pill" class="text-none px-6" :loading="deleting"
                        @click="doDelete">
                        Excluir
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<style scoped>
.coupons-table :deep(thead th) {
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
/*  Coupon code chip                                            */
/* ============================================================ */
.coupon-code {
    background: linear-gradient(135deg,
            rgba(var(--v-theme-primary), 0.1),
            rgba(var(--v-theme-primary), 0.05));
    color: rgb(var(--v-theme-primary));
    padding: 4px 10px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    border: 1px dashed rgba(var(--v-theme-primary), 0.3);
    display: inline-block;
}

/* ============================================================ */
/*  Type picker                                                 */
/* ============================================================ */
.type-picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
}

.type-card {
    transition: all 0.15s ease;
    border-color: rgba(var(--v-border-color), 0.15) !important;
}

.type-card:hover {
    border-color: rgba(var(--v-theme-primary), 0.4) !important;
    transform: translateY(-1px);
}

.type-card.active {
    border-color: rgb(var(--v-theme-primary)) !important;
    background: rgba(var(--v-theme-primary), 0.06);
    box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

/* ============================================================ */
/*  Sticky preview                                              */
/* ============================================================ */
.sticky-preview {
    position: sticky;
    top: 0;
}

.form-dialog {
    max-height: 90vh;
    display: flex;
    flex-direction: column;
}
</style>
