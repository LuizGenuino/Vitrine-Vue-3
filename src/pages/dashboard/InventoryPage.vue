<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { useRealtime } from '@/composables/useRealtime'
import { useAsyncAction } from '@/composables/useAsyncAction'

import { inventoryService } from '@/services/inventory.service'
import { supabase } from '@/lib/supabase'

import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue'
import EmptyState from '@/components/base/EmptyState.vue'

import type { InventoryMove, Product, InventoryType } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const auth = useAuthStore()
const notify = useNotifications()
const { currentStoreId, currentRole } = storeToRefs(auth)

const LOW_STOCK_THRESHOLD = 5

const canManage = computed(() =>
    currentRole.value && ['OWNER', 'ADMIN', 'MANAGER'].includes(currentRole.value),
)

/* -------------------------------------------------------------------------- */
/*  Formatters & metadata                                                     */
/* -------------------------------------------------------------------------- */

const brl = (v: number | string | null | undefined) =>
    Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
})

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
})

interface MovementMeta {
    label: string
    icon: string
    color: string
    positive: boolean       // aumenta o saldo?
    description: string
}

const movementMeta: Record<InventoryType, MovementMeta> = {
    ENTRY: { label: 'Entrada', icon: 'mdi-arrow-down-bold-circle', color: 'success', positive: true, description: 'Reposição/compra' },
    SALE: { label: 'Venda', icon: 'mdi-cart-arrow-right', color: 'primary', positive: false, description: 'Saída por pedido pago' },
    ADJUSTMENT: { label: 'Ajuste', icon: 'mdi-tune-variant', color: 'info', positive: true, description: 'Correção manual' },
    LOSS: { label: 'Perda', icon: 'mdi-package-variant-remove', color: 'error', positive: false, description: 'Quebra, extravio, vencimento' },
    EXCHANGE: { label: 'Troca', icon: 'mdi-swap-horizontal', color: 'warning', positive: false, description: 'Troca com cliente' },
    CANCELLATION: { label: 'Cancelamento', icon: 'mdi-undo-variant', color: 'grey', positive: true, description: 'Estorno de venda/perda' },
}

/* -------------------------------------------------------------------------- */
/*  Filtros                                                                   */
/* -------------------------------------------------------------------------- */

interface Filters {
    productId: string | null
    type: InventoryType | ''
    dateFrom: string
    dateTo: string
    onlyLowStock: boolean
}

const filters = reactive<Filters>({
    productId: null,
    type: '',
    dateFrom: '',
    dateTo: '',
    onlyLowStock: false,
})

const pagination = reactive({ page: 1, pageSize: 25 })
const totalItems = ref(0)

/* -------------------------------------------------------------------------- */
/*  Query: histórico de movimentações                                         */
/* -------------------------------------------------------------------------- */

interface MovementWithProduct extends InventoryMove {
    product: { id: string; name: string; sku: string } | null
    created_by_profile?: { full_name: string } | null
}

const movementsQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return []

    const from = (pagination.page - 1) * pagination.pageSize
    const to = from + pagination.pageSize - 1

    let query = supabase
        .from('inventory_movements')
        .select(
            `*,
       product:products(id, name, sku),
       created_by_profile:profiles!created_by(full_name)`,
            { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(from, to)

    if (filters.productId) query = query.eq('product_id', filters.productId)
    if (filters.type) query = query.eq('type', filters.type)
    if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00`)
    if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59`)

    const { data, error, count } = await query
    if (error) throw error
    totalItems.value = count ?? 0
    return (data ?? []) as unknown as MovementWithProduct[]
}, { watchSource: [currentStoreId] })

const movements = computed<MovementWithProduct[]>(() => movementsQuery.data.value ?? [])

/* -------------------------------------------------------------------------- */
/*  Query: produtos (para filtros e ajustes)                                  */
/* -------------------------------------------------------------------------- */

const productsQuery = useSupabaseQuery(async () => {
    const { data } = await supabase
        .from('products')
        .select('id, name, sku, price, cost_price, status')
        .is('deleted_at', null)
        .order('name')
    return (data ?? []) as Product[]
}, { watchSource: [currentStoreId] })

const products = computed(() => productsQuery.data.value ?? [])

/* -------------------------------------------------------------------------- */
/*  Query: saldos atuais                                                      */
/* -------------------------------------------------------------------------- */

const balancesQuery = useSupabaseQuery(async () => {
    if (!products.value.length) return {}
    return inventoryService.getBalances(products.value.map(p => p.id))
}, { watchSource: [productsQuery.data] })

const stockMap = computed<Record<string, number>>(() => balancesQuery.data.value ?? {})

/* -------------------------------------------------------------------------- */
/*  Produtos com saldo (lista para tabela de estoque atual)                   */
/* -------------------------------------------------------------------------- */

interface ProductStock {
    product: Product
    balance: number
    totalCost: number
    totalValue: number
    status: 'in_stock' | 'low_stock' | 'out_of_stock'
}

const productStocks = computed<ProductStock[]>(() => {
    const list = products.value.map(product => {
        const balance = stockMap.value[product.id] ?? 0
        let status: ProductStock['status'] = 'in_stock'
        if (balance === 0) status = 'out_of_stock'
        else if (balance <= LOW_STOCK_THRESHOLD) status = 'low_stock'

        return {
            product,
            balance,
            totalCost: Number(product.cost_price ?? 0) * balance,
            totalValue: Number(product.price) * balance,
            status,
        }
    })

    return filters.onlyLowStock
        ? list.filter(s => s.status !== 'in_stock')
        : list
})

/* -------------------------------------------------------------------------- */
/*  Métricas globais                                                          */
/* -------------------------------------------------------------------------- */

const metrics = computed(() => {
    const stocks = products.value.map(p => stockMap.value[p.id] ?? 0)
    const totalUnits = stocks.reduce((s, v) => s + v, 0)
    const totalCost = products.value.reduce((s, p) =>
        s + Number(p.cost_price ?? 0) * (stockMap.value[p.id] ?? 0), 0)
    const totalValue = products.value.reduce((s, p) =>
        s + Number(p.price) * (stockMap.value[p.id] ?? 0), 0)
    const outOfStock = productStocks.value.filter(s => s.status === 'out_of_stock').length
    const lowStock = productStocks.value.filter(s => s.status === 'low_stock').length

    return { totalUnits, totalCost, totalValue, outOfStock, lowStock }
})

/* -------------------------------------------------------------------------- */
/*  Movement dialog (individual)                                              */
/* -------------------------------------------------------------------------- */

const movementDialog = reactive({
    open: false,
    productId: null as string | null,
    type: 'ADJUSTMENT' as InventoryType,
    quantity: 1,
    unitCost: 0,
    notes: '',
})

function openMovementDialog(productId?: string) {
    movementDialog.open = true
    movementDialog.productId = productId ?? null
    movementDialog.type = 'ENTRY'
    movementDialog.quantity = 1
    movementDialog.unitCost = productId
        ? Number(products.value.find(p => p.id === productId)?.cost_price ?? 0)
        : 0
    movementDialog.notes = ''
}

const { execute: saveMovement, loading: savingMovement } = useAsyncAction(
    async () => {
        if (!movementDialog.productId) throw new Error('Selecione um produto')
        if (movementDialog.quantity <= 0) throw new Error('A quantidade deve ser maior que zero')

        const meta = movementMeta[movementDialog.type]
        const signedQty = meta.positive
            ? Math.abs(movementDialog.quantity)
            : -Math.abs(movementDialog.quantity)

        await inventoryService.registerMovement({
            productId: movementDialog.productId,
            type: movementDialog.type,
            quantity: signedQty,
            unitCost: movementDialog.unitCost || undefined,
            referenceType: 'manual',
            notes: movementDialog.notes || undefined,
        })

        movementDialog.open = false
        await Promise.all([movementsQuery.refresh(), balancesQuery.refresh()])
    },
    { successMsg: 'Movimentação registrada' },
)

/* -------------------------------------------------------------------------- */
/*  Bulk adjustment dialog                                                    */
/* -------------------------------------------------------------------------- */

const selectedProducts = ref<string[]>([])

interface BulkRow {
    productId: string
    currentBalance: number
    targetBalance: number
}

const bulkDialog = reactive({
    open: false,
    reason: '',
    rows: [] as BulkRow[],
})

function openBulkDialog() {
    if (!selectedProducts.value.length) return
    bulkDialog.rows = selectedProducts.value.map(id => ({
        productId: id,
        currentBalance: stockMap.value[id] ?? 0,
        targetBalance: stockMap.value[id] ?? 0,
    }))
    bulkDialog.reason = ''
    bulkDialog.open = true
}

const bulkDeltas = computed(() =>
    bulkDialog.rows.map(r => ({
        ...r,
        delta: r.targetBalance - r.currentBalance,
        product: products.value.find(p => p.id === r.productId),
    })),
)

const bulkHasChanges = computed(() => bulkDeltas.value.some(r => r.delta !== 0))

const { execute: applyBulk, loading: applyingBulk } = useAsyncAction(
    async () => {
        const changes = bulkDeltas.value.filter(r => r.delta !== 0)
        if (!changes.length) throw new Error('Nenhuma alteração para aplicar')

        // Insere N movimentos em paralelo
        await Promise.all(
            changes.map(r =>
                inventoryService.registerMovement({
                    productId: r.productId,
                    type: 'ADJUSTMENT',
                    quantity: r.delta,
                    referenceType: 'manual',
                    notes: bulkDialog.reason || `Ajuste em lote (${r.currentBalance} → ${r.targetBalance})`,
                }),
            ),
        )

        bulkDialog.open = false
        selectedProducts.value = []
        await Promise.all([movementsQuery.refresh(), balancesQuery.refresh()])
    },
    { successMsg: 'Ajustes aplicados com sucesso' },
)

/* -------------------------------------------------------------------------- */
/*  Reverse (estorno) — cria movimento oposto                                 */
/* -------------------------------------------------------------------------- */

const { execute: reverseMovement } = useAsyncAction(
    async (m: MovementWithProduct) => {
        await inventoryService.registerMovement({
            productId: m.product_id,
            type: 'CANCELLATION',
            quantity: -m.quantity, // inverte o sinal do original
            referenceType: 'reversal',
            referenceId: m.id,
            notes: `Estorno do movimento ${m.id.slice(0, 8)}`,
        })
        await Promise.all([movementsQuery.refresh(), balancesQuery.refresh()])
    },
    { successMsg: 'Movimento estornado' },
)

/* -------------------------------------------------------------------------- */
/*  Realtime                                                                  */
/* -------------------------------------------------------------------------- */

useRealtime<InventoryMove>({
    table: 'inventory_movements',
    event: 'INSERT',
    scopedToStore: true,
    onChange: () => {
        balancesQuery.refresh()
        // Se o usuário está na primeira página, atualiza o histórico também
        if (pagination.page === 1) movementsQuery.refresh()
    },
})

/* -------------------------------------------------------------------------- */
/*  Watchers de filtros → refresh                                             */
/* -------------------------------------------------------------------------- */

watch(
    [() => filters.productId, () => filters.type, () => filters.dateFrom,
    () => filters.dateTo, () => pagination.page, () => pagination.pageSize],
    () => movementsQuery.refresh(),
)

function clearFilters() {
    filters.productId = null
    filters.type = ''
    filters.dateFrom = ''
    filters.dateTo = ''
    filters.onlyLowStock = false
    pagination.page = 1
}

const hasActiveFilters = computed(() =>
    !!filters.productId || !!filters.type || !!filters.dateFrom
    || !!filters.dateTo || filters.onlyLowStock,
)

/* -------------------------------------------------------------------------- */
/*  Tabs                                                                      */
/* -------------------------------------------------------------------------- */

const activeTab = ref<'stocks' | 'history'>('stocks')

const stockHeaders = [
    { title: '', key: 'select', sortable: false, width: 40 },
    { title: 'Produto', key: 'product' },
    { title: 'SKU', key: 'sku' },
    { title: 'Saldo', key: 'balance', align: 'end' as const },
    { title: 'Custo total', key: 'totalCost', align: 'end' as const },
    { title: 'Valor em vendas', key: 'totalValue', align: 'end' as const },
    { title: 'Status', key: 'status', align: 'center' as const },
    { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 80 },
]

const historyHeaders = [
    { title: 'Data', key: 'created_at', width: 160 },
    { title: 'Produto', key: 'product' },
    { title: 'Tipo', key: 'type', align: 'center' as const },
    { title: 'Qtd', key: 'quantity', align: 'end' as const },
    { title: 'Custo unit.', key: 'unit_cost', align: 'end' as const },
    { title: 'Observação', key: 'notes' },
    { title: 'Por', key: 'created_by', width: 140 },
    { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 60 },
]

/* -------------------------------------------------------------------------- */
/*  Exportação CSV                                                            */
/* -------------------------------------------------------------------------- */

function exportHistoryCsv() {
    const header = ['Data', 'Produto', 'SKU', 'Tipo', 'Quantidade', 'Custo unit.', 'Observação']
    const rows = movements.value.map(m => [
        fmtDateTime(m.created_at),
        m.product?.name ?? '',
        m.product?.sku ?? '',
        movementMeta[m.type].label,
        m.quantity.toString(),
        m.unit_cost ? brl(m.unit_cost) : '',
        m.notes ?? '',
    ])
    const csv = [header, ...rows]
        .map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        .join('\n')

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `estoque-historico-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

onMounted(() => {
    movementsQuery.refresh()
})
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- ==================== HEADER ==================== -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">Estoque</h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Ledger completo de movimentações — cada entrada, venda ou ajuste fica registrado.
                </p>
            </div>

            <div class="d-flex ga-2 flex-column flex-sm-row">
                <v-btn variant="outlined" prepend-icon="mdi-download" rounded="pill" class="text-none"
                    :disabled="!movements.length" @click="exportHistoryCsv">
                    Exportar CSV
                </v-btn>
                <v-btn v-if="canManage" color="primary" prepend-icon="mdi-plus" rounded="pill" elevation="0"
                    class="text-none px-6" @click="openMovementDialog()">
                    Nova movimentação
                </v-btn>
            </div>
        </header>

        <!-- ==================== MÉTRICAS ==================== -->
        <v-row dense>
            <v-col cols="12" sm="6" lg="3">
                <v-skeleton-loader v-if="balancesQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Unidades em estoque" :value="metrics.totalUnits"
                    icon="mdi-package-variant-closed" description="Soma total de todos os SKUs" color="primary" />
            </v-col>
            <v-col cols="12" sm="6" lg="3">
                <v-skeleton-loader v-if="balancesQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Valor de custo" :value="brl(metrics.totalCost)" icon="mdi-cash-minus"
                    description="Investido no estoque atual" color="info" />
            </v-col>
            <v-col cols="12" sm="6" lg="3">
                <v-skeleton-loader v-if="balancesQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Valor de venda" :value="brl(metrics.totalValue)" icon="mdi-cash"
                    description="Potencial se tudo for vendido" color="success" />
            </v-col>
            <v-col cols="12" sm="6" lg="3">
                <v-skeleton-loader v-if="balancesQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Alertas" :value="metrics.outOfStock + metrics.lowStock"
                    icon="mdi-alert-octagon-outline"
                    :description="`${metrics.outOfStock} esgotado(s) • ${metrics.lowStock} baixo(s)`"
                    :color="(metrics.outOfStock + metrics.lowStock) > 0 ? 'warning' : 'grey-lighten-1'"
                    @click="filters.onlyLowStock = true; activeTab = 'stocks'" />
            </v-col>
        </v-row>

        <!-- ==================== TABS ==================== -->
        <v-card rounded="xl" border flat class="overflow-hidden">
            <v-tabs v-model="activeTab" color="primary" align-tabs="start" class="tabs-nav">
                <v-tab value="stocks" class="text-none">
                    <v-icon start>mdi-package-variant</v-icon>
                    Saldo por produto
                </v-tab>
                <v-tab value="history" class="text-none">
                    <v-icon start>mdi-history</v-icon>
                    Histórico
                    <v-chip v-if="totalItems" size="x-small" variant="tonal" class="ml-2">
                        {{ totalItems }}
                    </v-chip>
                </v-tab>
            </v-tabs>

            <v-divider />

            <v-window v-model="activeTab">

                <!-- ============================================================= -->
                <!--  TAB 1 — SALDO POR PRODUTO                                    -->
                <!-- ============================================================= -->
                <v-window-item value="stocks">
                    <!--  Toolbar da aba  -->
                    <div class="pa-4 d-flex align-center justify-space-between flex-wrap ga-3">
                        <div class="d-flex align-center ga-3 flex-wrap">
                            <v-switch v-model="filters.onlyLowStock" label="Só alertas de estoque" color="warning"
                                density="compact" hide-details />
                            <span class="text-caption text-medium-emphasis">
                                {{ productStocks.length }} produto(s) exibido(s)
                            </span>
                        </div>

                        <div v-if="selectedProducts.length" class="d-flex align-center ga-2 selection-bar">
                            <v-chip color="primary" variant="flat" size="small">
                                {{ selectedProducts.length }} selecionado(s)
                            </v-chip>
                            <v-btn v-if="canManage" color="primary" variant="flat" rounded="pill" size="small"
                                prepend-icon="mdi-tune-variant" class="text-none" @click="openBulkDialog">
                                Ajustar em lote
                            </v-btn>
                            <v-btn variant="text" size="small" class="text-none" @click="selectedProducts = []">
                                Limpar
                            </v-btn>
                        </div>
                    </div>

                    <v-divider />

                    <v-data-table :headers="stockHeaders" :items="productStocks"
                        :loading="productsQuery.loading.value || balancesQuery.loading.value" item-value="product.id"
                        hover density="comfortable" :items-per-page="50">
                        <template #item.select="{ item }">
                            <v-checkbox-btn :model-value="selectedProducts.includes(item.product.id)"
                                :disabled="!canManage" @update:model-value="(v) => v
                                    ? selectedProducts.push(item.product.id)
                                    : selectedProducts = selectedProducts.filter(id => id !== item.product.id)" />
                        </template>

                        <template #item.product="{ item }">
                            <div class="font-weight-medium text-truncate" style="max-width: 320px">
                                {{ item.product.name }}
                            </div>
                        </template>

                        <template #item.sku="{ item }">
                            <code class="sku-chip">{{ item.product.sku }}</code>
                        </template>

                        <template #item.balance="{ item }">
                            <span class="font-weight-bold" :class="{
                                'text-error': item.status === 'out_of_stock',
                                'text-warning': item.status === 'low_stock',
                            }">
                                {{ item.balance }}
                            </span>
                            <span class="text-caption text-medium-emphasis ml-1">un</span>
                        </template>

                        <template #item.totalCost="{ item }">
                            <span class="text-body-2">{{ brl(item.totalCost) }}</span>
                        </template>

                        <template #item.totalValue="{ item }">
                            <span class="text-body-2 font-weight-medium">{{ brl(item.totalValue) }}</span>
                        </template>

                        <template #item.status="{ item }">
                            <v-chip size="x-small" :color="item.status === 'out_of_stock' ? 'error' :
                                item.status === 'low_stock' ? 'warning' : 'success'
                                " variant="tonal" :prepend-icon="item.status === 'out_of_stock' ? 'mdi-close-octagon' :
                                    item.status === 'low_stock' ? 'mdi-alert' : 'mdi-check-circle'
                                    ">
                                {{
                                    item.status === 'out_of_stock' ? 'Esgotado' :
                                        item.status === 'low_stock' ? 'Baixo' : 'Em estoque'
                                }}
                            </v-chip>
                        </template>

                        <template #item.actions="{ item }">
                            <v-tooltip text="Nova movimentação">
                                <template #activator="{ props: tp }">
                                    <v-btn v-bind="tp" icon="mdi-plus-circle-outline" variant="text" size="small"
                                        color="primary" :disabled="!canManage"
                                        @click="openMovementDialog(item.product.id)" />
                                </template>
                            </v-tooltip>
                        </template>

                        <template #no-data>
                            <EmptyState title="Nenhum produto encontrado"
                                description="Cadastre produtos para começar a controlar o estoque."
                                icon="mdi-package-variant-closed" />
                        </template>
                    </v-data-table>
                </v-window-item>

                <!-- ============================================================= -->
                <!--  TAB 2 — HISTÓRICO DE MOVIMENTAÇÕES                           -->
                <!-- ============================================================= -->
                <v-window-item value="history">
                    <!--  Filtros do histórico  -->
                    <div class="pa-4">
                        <v-row dense>
                            <v-col cols="12" md="4">
                                <v-select v-model="filters.productId" :items="[
                                    { title: 'Todos os produtos', value: null },
                                    ...products.map(p => ({ title: `${p.name} (${p.sku})`, value: p.id })),
                                ]" label="Produto" variant="outlined" density="comfortable" hide-details rounded="pill"
                                    prepend-inner-icon="mdi-package-variant" />
                            </v-col>
                            <v-col cols="6" md="2">
                                <v-select v-model="filters.type" :items="[
                                    { title: 'Todos os tipos', value: '' },
                                    ...Object.entries(movementMeta).map(([k, v]) => ({ title: v.label, value: k })),
                                ]" label="Tipo" variant="outlined" density="comfortable" hide-details rounded="pill" />
                            </v-col>
                            <v-col cols="6" md="2">
                                <v-text-field v-model="filters.dateFrom" type="date" label="De" variant="outlined"
                                    density="comfortable" hide-details rounded="pill" />
                            </v-col>
                            <v-col cols="6" md="2">
                                <v-text-field v-model="filters.dateTo" type="date" label="Até" variant="outlined"
                                    density="comfortable" hide-details rounded="pill" />
                            </v-col>
                            <v-col cols="6" md="2" class="d-flex align-center">
                                <v-btn v-if="hasActiveFilters" variant="text" color="medium-emphasis" class="text-none"
                                    prepend-icon="mdi-filter-off-outline" @click="clearFilters">
                                    Limpar
                                </v-btn>
                            </v-col>
                        </v-row>
                    </div>

                    <v-divider />

                    <v-data-table-server :headers="historyHeaders" :items="movements" :items-length="totalItems"
                        :loading="movementsQuery.loading.value" :items-per-page="pagination.pageSize"
                        :page="pagination.page" :items-per-page-options="[10, 25, 50, 100]" hover density="comfortable"
                        class="history-table" @update:options="(o) => {
                            if (o.page !== pagination.page) pagination.page = o.page
                            if (o.itemsPerPage !== pagination.pageSize) pagination.pageSize = o.itemsPerPage
                        }">
                        <template #item.created_at="{ item }">
                            <div class="text-body-2">{{ fmtDateTime(item.created_at) }}</div>
                        </template>

                        <template #item.product="{ item }">
                            <div class="d-flex flex-column">
                                <span class="text-body-2 font-weight-medium text-truncate" style="max-width: 260px">
                                    {{ item.product?.name ?? '—' }}
                                </span>
                                <code v-if="item.product" class="sku-chip text-caption" style="width: fit-content">
                  {{ item.product.sku }}
                </code>
                            </div>
                        </template>

                        <template #item.type="{ item }">
                            <v-chip size="x-small" :color="movementMeta[item.type].color" variant="tonal"
                                :prepend-icon="movementMeta[item.type].icon">
                                {{ movementMeta[item.type].label }}
                            </v-chip>
                        </template>

                        <template #item.quantity="{ item }">
                            <span class="font-weight-bold" :class="item.quantity > 0 ? 'text-success' : 'text-error'">
                                {{ item.quantity > 0 ? '+' : '' }}{{ item.quantity }}
                            </span>
                        </template>

                        <template #item.unit_cost="{ item }">
                            <span class="text-body-2 text-medium-emphasis">
                                {{ item.unit_cost ? brl(item.unit_cost) : '—' }}
                            </span>
                        </template>

                        <template #item.notes="{ item }">
                            <div class="text-caption text-truncate" style="max-width: 240px">
                                {{ item.notes || '—' }}
                            </div>
                            <div v-if="item.reference_type" class="text-caption text-disabled">
                                ref: {{ item.reference_type }}
                                <template v-if="item.reference_id">
                                    ({{ item.reference_id.slice(0, 8) }})
                                </template>
                            </div>
                        </template>

                        <template #item.created_by="{ item }">
                            <div class="text-caption text-medium-emphasis text-truncate">
                                {{ item.created_by_profile?.full_name ?? 'Sistema' }}
                            </div>
                        </template>

                        <template #item.actions="{ item }">
                            <v-menu location="bottom end">
                                <template #activator="{ props: mp }">
                                    <v-btn v-bind="mp" icon="mdi-dots-vertical" variant="text" size="small"
                                        :disabled="!canManage" />
                                </template>
                                <v-list density="compact" min-width="180">
                                    <v-list-item prepend-icon="mdi-undo-variant" title="Estornar"
                                        :disabled="item.type === 'CANCELLATION'" @click="reverseMovement(item)" />
                                    <v-list-item prepend-icon="mdi-plus-circle-outline" title="Nova movimentação"
                                        @click="openMovementDialog(item.product_id)" />
                                </v-list>
                            </v-menu>
                        </template>

                        <template #no-data>
                            <EmptyState title="Nenhuma movimentação" :description="hasActiveFilters
                                ? 'Ajuste os filtros para ver mais resultados.'
                                : 'Cadastre a primeira movimentação para começar.'" icon="mdi-history" />
                        </template>
                    </v-data-table-server>
                </v-window-item>

            </v-window>
        </v-card>

        <!-- ============================================================ -->
        <!--  DIALOG — NOVA MOVIMENTAÇÃO                                 -->
        <!-- ============================================================ -->
        <v-dialog v-model="movementDialog.open" max-width="560" persistent>
            <v-card rounded="xl">
                <v-toolbar color="surface" border="b" density="comfortable">
                    <v-btn icon="mdi-close" variant="text" @click="movementDialog.open = false" />
                    <v-toolbar-title class="font-weight-black">
                        Nova movimentação
                    </v-toolbar-title>
                </v-toolbar>

                <v-card-text class="pa-6">
                    <v-row>
                        <v-col cols="12">
                            <v-autocomplete v-model="movementDialog.productId"
                                :items="products.map(p => ({ title: `${p.name} (${p.sku})`, value: p.id }))"
                                label="Produto *" variant="outlined" density="comfortable"
                                prepend-inner-icon="mdi-package-variant" />
                            <v-alert v-if="movementDialog.productId" type="info" variant="tonal" density="compact"
                                rounded="lg" class="mt-2">
                                Saldo atual: <strong>{{ stockMap[movementDialog.productId] ?? 0 }} un</strong>
                            </v-alert>
                        </v-col>

                        <v-col cols="12">
                            <div class="text-subtitle-2 font-weight-bold mb-2">Tipo de movimentação</div>
                            <div class="movement-types-grid">
                                <v-card v-for="(meta, key) in movementMeta" :key="key" variant="outlined" rounded="lg"
                                    class="movement-type-card pa-3 cursor-pointer"
                                    :class="{ active: movementDialog.type === key }"
                                    @click="movementDialog.type = key as InventoryType">
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
                        </v-col>

                        <v-col cols="12" md="6">
                            <v-text-field v-model.number="movementDialog.quantity" label="Quantidade *" type="number"
                                min="1" variant="outlined" density="comfortable"
                                :prefix="movementMeta[movementDialog.type].positive ? '+' : '−'" />
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-text-field v-model.number="movementDialog.unitCost" label="Custo unitário" prefix="R$"
                                type="number" step="0.01" min="0" variant="outlined" density="comfortable"
                                hint="Opcional — usado no cálculo do CMV" persistent-hint />
                        </v-col>

                        <v-col cols="12">
                            <v-textarea v-model="movementDialog.notes" label="Observação"
                                placeholder="Motivo, número da nota, etc..." rows="2" variant="outlined"
                                density="comfortable" />
                        </v-col>

                        <!--  Preview do impacto  -->
                        <v-col v-if="movementDialog.productId" cols="12">
                            <v-alert :type="movementMeta[movementDialog.type].positive ? 'success' : 'warning'"
                                variant="tonal" rounded="lg" density="compact">
                                <div class="text-body-2">
                                    Novo saldo:
                                    <strong>
                                        {{ (stockMap[movementDialog.productId] ?? 0) +
                                            (movementMeta[movementDialog.type].positive
                                                ? Math.abs(movementDialog.quantity)
                                                : -Math.abs(movementDialog.quantity)) }} un
                                    </strong>
                                </div>
                            </v-alert>
                        </v-col>
                    </v-row>
                </v-card-text>

                <v-divider />

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="savingMovement"
                        @click="movementDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6"
                        :loading="savingMovement" @click="saveMovement">
                        Registrar
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ============================================================ -->
        <!--  DIALOG — AJUSTE EM LOTE                                    -->
        <!-- ============================================================ -->
        <v-dialog v-model="bulkDialog.open" max-width="820" persistent scrollable>
            <v-card rounded="xl" class="bulk-dialog">
                <v-toolbar color="surface" border="b" density="comfortable">
                    <v-btn icon="mdi-close" variant="text" @click="bulkDialog.open = false" />
                    <v-toolbar-title class="font-weight-black">
                        Ajuste em lote
                    </v-toolbar-title>
                    <v-spacer />
                    <v-chip size="small" variant="tonal">
                        {{ bulkDialog.rows.length }} produto(s)
                    </v-chip>
                </v-toolbar>

                <v-card-text class="pa-6">
                    <v-alert type="info" variant="tonal" density="compact" rounded="lg" class="mb-4"
                        icon="mdi-information-outline">
                        Informe o <strong>saldo final desejado</strong> para cada produto.
                        Um movimento de <strong>ajuste</strong> será gerado automaticamente para cada linha alterada.
                    </v-alert>

                    <v-text-field v-model="bulkDialog.reason" label="Motivo do ajuste"
                        placeholder="Ex: Inventário mensal, correção de balanço..." variant="outlined"
                        density="comfortable" prepend-inner-icon="mdi-comment-text-outline" class="mb-4" />

                    <v-table density="comfortable" class="bulk-table">
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th class="text-center">Atual</th>
                                <th class="text-center" style="width: 140px">Novo saldo</th>
                                <th class="text-center">Ajuste</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in bulkDeltas" :key="row.productId">
                                <td>
                                    <div class="text-body-2 font-weight-medium text-truncate" style="max-width: 300px">
                                        {{ row.product?.name }}
                                    </div>
                                    <code class="sku-chip text-caption">{{ row.product?.sku }}</code>
                                </td>
                                <td class="text-center">
                                    <span class="text-body-2 font-weight-bold">{{ row.currentBalance }}</span>
                                </td>
                                <td>
                                    <v-text-field :model-value="row.targetBalance" type="number" min="0"
                                        density="compact" variant="outlined" hide-details class="bulk-input"
                                        @update:model-value="(v) => {
                                            const idx = bulkDialog.rows.findIndex(r => r.productId === row.productId)
                                            if (idx >= 0) bulkDialog.rows[idx].targetBalance = Number(v)
                                        }" />
                                </td>
                                <td class="text-center">
                                    <v-chip v-if="row.delta !== 0" size="x-small"
                                        :color="row.delta > 0 ? 'success' : 'error'" variant="tonal">
                                        {{ row.delta > 0 ? '+' : '' }}{{ row.delta }}
                                    </v-chip>
                                    <span v-else class="text-caption text-disabled">—</span>
                                </td>
                            </tr>
                        </tbody>
                    </v-table>
                </v-card-text>

                <v-divider />

                <v-card-actions class="pa-4">
                    <div class="text-caption text-medium-emphasis">
                        <strong>{{bulkDeltas.filter(r => r.delta !== 0).length}}</strong>
                        movimentação(ões) serão registradas
                    </div>
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="applyingBulk" @click="bulkDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6" :loading="applyingBulk"
                        :disabled="!bulkHasChanges" @click="applyBulk">
                        Aplicar ajustes
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<style scoped>
.tabs-nav {
    background: rgba(var(--v-theme-surface-variant), 0.3);
}

/* SKU chip */
.sku-chip {
    background: rgba(var(--v-theme-on-surface), 0.06);
    padding: 2px 8px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-on-surface));
    font-weight: 600;
    display: inline-block;
}

/* Selection bar */
.selection-bar {
    background: rgba(var(--v-theme-primary), 0.06);
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(var(--v-theme-primary), 0.15);
}

/* Movement type picker */
.movement-types-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
}

.movement-type-card {
    transition: all 0.15s ease;
    border-color: rgba(var(--v-border-color), 0.15) !important;
}

.movement-type-card:hover {
    border-color: rgba(var(--v-theme-primary), 0.4) !important;
    transform: translateY(-1px);
}

.movement-type-card.active {
    border-color: rgb(var(--v-theme-primary)) !important;
    background: rgba(var(--v-theme-primary), 0.06);
    box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

.min-width-0 {
    min-width: 0;
}

.cursor-pointer {
    cursor: pointer;
}

/* Bulk dialog */
.bulk-dialog {
    height: 85vh;
    display: flex;
    flex-direction: column;
}

.bulk-table :deep(td) {
    padding: 8px 12px !important;
}

.bulk-input {
    max-width: 120px;
}

.bulk-input :deep(.v-field__input) {
    text-align: center;
    font-weight: 700;
    padding: 6px !important;
    min-height: 32px;
}

/* History table specific */
.history-table :deep(thead th) {
    background: rgba(var(--v-theme-surface-variant), 0.3);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
}
</style>
