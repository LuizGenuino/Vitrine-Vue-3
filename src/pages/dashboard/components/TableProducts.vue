<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'

import EmptyState from '@/components/base/EmptyState.vue'

import type {
    Product, ProductWithRelations, Category, ProductStatus,
} from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Props & Emits                                                             */
/* -------------------------------------------------------------------------- */

interface Props {
    products: ProductWithRelations[]
    stockMap: Record<string, number>
    categories: Category[]
    totalItems: number
    loading: boolean
    canManage: boolean
    page: number
    itemsPerPage: number
    sortBy: string
    ascending: boolean
    lowStockThreshold?: number
}

const props = withDefaults(defineProps<Props>(), {
    lowStockThreshold: 5,
})

const emit = defineEmits<{
    edit: [product: ProductWithRelations]
    delete: [product: Product]
    duplicate: [product: Product]
    view: [product: Product]
    toggleStatus: [product: Product]
    toggleFeatured: [product: Product]
    adjustStock: [payload: { product: Product; delta: number; reason?: string }]
    'update:page': [n: number]
    'update:itemsPerPage': [n: number]
    'update:sortBy': [s: string]
    'update:ascending': [b: boolean]
}>()

/* -------------------------------------------------------------------------- */
/*  Estado local                                                              */
/* -------------------------------------------------------------------------- */

const display = useDisplay()
const stockLoadingId = ref<string | null>(null)
const stockDrafts = reactive<Record<string, number>>({})

// Stepper mobile: acúmulo antes de disparar movimentação
const quickAdjustDialog = reactive({
    open: false,
    product: null as Product | null,
    delta: 0,
    reason: '',
})

import { reactive } from 'vue'
import type { SortItem } from 'vuetify/lib/components/VDataTable/composables/sort.mjs'

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const brl = (v: number | string | null | undefined) =>
    Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const categoryMap = computed(
    () => new Map(props.categories.map(c => [c.id, c.name])),
)

const primaryImage = (p: ProductWithRelations): string => {
    const primary = p.product_images?.find(i => i.is_primary)
    return primary?.url ?? p.product_images?.[0]?.url ?? ''
}

const stockOf = (p: Product): number => props.stockMap[p.id] ?? 0

interface StockBadge {
    color: string
    label: string
    icon: string
}
function stockBadge(qty: number): StockBadge {
    if (qty <= 0)
        return { color: 'error', label: 'Esgotado', icon: 'mdi-close-octagon' }
    if (qty <= props.lowStockThreshold)
        return { color: 'warning', label: 'Baixo', icon: 'mdi-alert' }
    if (qty <= 20)
        return { color: 'info', label: 'Moderado', icon: 'mdi-package-variant' }
    return { color: 'success', label: 'Em estoque', icon: 'mdi-check-circle' }
}

const statusMeta: Record<ProductStatus, { label: string; color: string; icon: string }> = {
    ACTIVE: { label: 'Ativo', color: 'success', icon: 'mdi-eye-outline' },
    DRAFT: { label: 'Rascunho', color: 'grey', icon: 'mdi-file-document-edit-outline' },
    INACTIVE: { label: 'Inativo', color: 'warning', icon: 'mdi-eye-off-outline' },
    ARCHIVED: { label: 'Arquivado', color: 'grey', icon: 'mdi-archive-outline' },
}

/* -------------------------------------------------------------------------- */
/*  Ajuste de estoque via ledger                                              */
/*  Nunca chamamos UPDATE em products — sempre insert de movimento             */
/* -------------------------------------------------------------------------- */

function commitStockAdjustment(product: Product, targetQty: number) {
    const currentQty = stockOf(product)
    const delta = targetQty - currentQty
    if (delta === 0 || Number.isNaN(delta)) return

    stockLoadingId.value = product.id
    try {
        emit('adjustStock', {
            product,
            delta,
            reason: `Ajuste manual (${currentQty} → ${targetQty})`,
        })
    } finally {
        // O pai controla o feedback; liberamos assim que o evento é emitido.
        setTimeout(() => { stockLoadingId.value = null }, 300)
    }
}

function onStockBlur(product: Product, event: FocusEvent) {
    const input = event.target as HTMLInputElement
    const value = parseInt(input.value, 10)
    if (!Number.isNaN(value) && value >= 0) commitStockAdjustment(product, value)
    delete stockDrafts[product.id]
}

function stepStock(product: Product, direction: 1 | -1) {
    const current = stockDrafts[product.id] ?? stockOf(product)
    const next = Math.max(0, current + direction)
    stockDrafts[product.id] = next
    commitStockAdjustment(product, next)
}

/* -------------------------------------------------------------------------- */
/*  v-data-table-server integration                                           */
/* -------------------------------------------------------------------------- */

const headers = [
    { title: 'Produto', key: 'name', sortable: true, minWidth: 260 },
    { title: 'SKU', key: 'sku', sortable: true, align: 'start' as const },
    { title: 'Categoria', key: 'category', sortable: false },
    { title: 'Custo', key: 'cost_price', sortable: true, align: 'end' as const },
    { title: 'Preço', key: 'price', sortable: true, align: 'end' as const },
    { title: 'Estoque', key: 'stock', sortable: false, align: 'start' as const, width: 200 },
    { title: 'Status', key: 'status', sortable: true, align: 'center' as const },
    { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 120 },
]

function onOptionsChange(opts: any) {
    if (opts.page !== props.page) emit('update:page', opts.page)
    if (opts.itemsPerPage !== props.itemsPerPage) emit('update:itemsPerPage', opts.itemsPerPage)
    const sb = opts.sortBy?.[0]
    if (sb) {
        if (sb.key !== props.sortBy) emit('update:sortBy', sb.key)
        if ((sb.order === 'asc') !== props.ascending) emit('update:ascending', sb.order === 'asc')
    }
}

const currentSort = computed<SortItem[]>(() => [
    { key: props.sortBy, order: props.ascending ? 'asc' : 'desc' as const },
])

const isEmpty = computed(() => !props.loading && props.products.length === 0)
</script>

<template>
    <div class="products-table-wrapper">

        <!-- ============================================================= -->
        <!--  EMPTY STATE                                                  -->
        <!-- ============================================================= -->
        <EmptyState v-if="isEmpty" title="Nenhum produto encontrado"
            description="Ajuste os filtros ou cadastre seu primeiro produto para começar a vender."
            icon="mdi-package-variant-closed" />

        <!-- ============================================================= -->
        <!--  TABELA DESKTOP (v-data-table-server)                         -->
        <!-- ============================================================= -->
        <v-card v-else-if="display.mdAndUp.value" rounded="xl" border flat class="overflow-hidden">
            <v-data-table-server :headers="headers" :items="products" :items-length="totalItems"
                :items-per-page="itemsPerPage" :page="page" :sort-by="currentSort" :loading="loading"
                :items-per-page-options="[10, 25, 50, 100]" hover density="comfortable" class="products-table"
                @update:options="onOptionsChange">
                <!-- ------- COL PRODUTO ------- -->
                <template #item.name="{ item }">
                    <div class="d-flex align-center ga-3 py-2">
                        <v-avatar rounded="lg" size="52" color="grey-lighten-4" class="product-thumb cursor-pointer"
                            @click="emit('view', item)">
                            <v-img v-if="primaryImage(item)" :src="primaryImage(item)" cover />
                            <v-icon v-else color="grey">mdi-image-off-outline</v-icon>
                        </v-avatar>

                        <div class="min-width-0">
                            <div class="font-weight-bold text-truncate d-flex align-center ga-1"
                                style="max-width: 260px">
                                {{ item.name }}
                                <v-tooltip v-if="item.is_featured" text="Destaque">
                                    <template #activator="{ props: tp }">
                                        <v-icon v-bind="tp" size="16" color="warning">mdi-star</v-icon>
                                    </template>
                                </v-tooltip>
                            </div>
                            <div class="text-caption text-medium-emphasis text-truncate" style="max-width: 260px">
                                {{ item.slug }}
                            </div>
                        </div>
                    </div>
                </template>

                <!-- ------- COL SKU ------- -->
                <template #item.sku="{ item }">
                    <code class="sku-chip">{{ item.sku }}</code>
                </template>

                <!-- ------- COL CATEGORIA ------- -->
                <template #item.category="{ item }">
                    <v-chip v-if="item.category_id" size="small" variant="tonal" color="primary">
                        {{ item.category?.name ?? categoryMap.get(item.category_id) ?? '—' }}
                    </v-chip>
                    <span v-else class="text-caption text-disabled italic">
                        Sem categoria
                    </span>
                </template>

                <!-- ------- COL CUSTO ------- -->
                <template #item.cost_price="{ item }">
                    <span class="text-body-2 text-medium-emphasis">
                        {{ brl(item.cost_price) }}
                    </span>
                </template>

                <!-- ------- COL PREÇO ------- -->
                <template #item.price="{ item }">
                    <span class="font-weight-bold">{{ brl(item.price) }}</span>
                    <div v-if="item.cost_price" class="text-caption text-success">
                        +{{ Math.round(((Number(item.price) - Number(item.cost_price)) / Number(item.cost_price)) * 100)
                        }}%
                    </div>
                </template>

                <!-- ------- COL ESTOQUE ------- -->
                <template #item.stock="{ item }">
                    <div class="d-flex align-center ga-2">
                        <v-text-field :model-value="stockDrafts[item.id] ?? stockOf(item)" type="number" min="0"
                            density="compact" variant="outlined" hide-details rounded="lg" class="stock-input"
                            :disabled="!canManage || stockLoadingId === item.id" :loading="stockLoadingId === item.id"
                            @update:model-value="(v) => stockDrafts[item.id] = Number(v)"
                            @blur="onStockBlur(item, $event)" @keyup.enter="($event.target as HTMLInputElement).blur()">
                            <template #prepend-inner>
                                <v-icon size="16" :color="stockBadge(stockOf(item)).color">
                                    {{ stockBadge(stockOf(item)).icon }}
                                </v-icon>
                            </template>
                        </v-text-field>

                        <v-chip size="x-small" variant="tonal" :color="stockBadge(stockOf(item)).color"
                            class="hidden-lg-and-down font-weight-medium">
                            {{ stockBadge(stockOf(item)).label }}
                        </v-chip>
                    </div>
                </template>

                <!-- ------- COL STATUS ------- -->
                <template #item.status="{ item }">
                    <v-menu :disabled="!canManage">
                        <template #activator="{ props: mp }">
                            <v-chip v-bind="mp" size="small" :color="statusMeta[item.status].color" variant="tonal"
                                :prepend-icon="statusMeta[item.status].icon" class="cursor-pointer font-weight-medium">
                                {{ statusMeta[item.status].label }}
                            </v-chip>
                        </template>
                        <v-list density="compact" min-width="180">
                            <v-list-item prepend-icon="mdi-eye-outline" title="Ativar"
                                :disabled="item.status === 'ACTIVE'" @click="emit('toggleStatus', item)" />
                            <v-list-item prepend-icon="mdi-eye-off-outline" title="Desativar"
                                :disabled="item.status !== 'ACTIVE'" @click="emit('toggleStatus', item)" />
                            <v-divider class="my-1" />
                            <v-list-item :prepend-icon="item.is_featured ? 'mdi-star-off' : 'mdi-star'"
                                :title="item.is_featured ? 'Remover destaque' : 'Marcar destaque'"
                                @click="emit('toggleFeatured', item)" />
                        </v-list>
                    </v-menu>
                </template>

                <!-- ------- COL AÇÕES ------- -->
                <template #item.actions="{ item }">
                    <div class="d-flex justify-end align-center ga-1">
                        <v-tooltip text="Editar">
                            <template #activator="{ props: tp }">
                                <v-btn v-bind="tp" icon="mdi-pencil-outline" variant="text" size="small" color="primary"
                                    :disabled="!canManage" @click="emit('edit', item)" />
                            </template>
                        </v-tooltip>

                        <v-menu location="bottom end">
                            <template #activator="{ props: mp }">
                                <v-btn v-bind="mp" icon="mdi-dots-vertical" variant="text" size="small" />
                            </template>
                            <v-list density="compact" min-width="200">
                                <v-list-item prepend-icon="mdi-eye-outline" title="Ver detalhes"
                                    @click="emit('view', item)" />
                                <v-list-item prepend-icon="mdi-content-duplicate" title="Duplicar"
                                    :disabled="!canManage" @click="emit('duplicate', item)" />
                                <v-divider class="my-1" />
                                <v-list-item prepend-icon="mdi-trash-can-outline" title="Excluir" base-color="error"
                                    :disabled="!canManage" @click="emit('delete', item)" />
                            </v-list>
                        </v-menu>
                    </div>
                </template>

                <!-- ------- LOADING ------- -->
                <template #loading>
                    <v-skeleton-loader type="table-row@5" />
                </template>

                <!-- ------- EMPTY ------- -->
                <template #no-data>
                    <div class="py-8 text-center">
                        <v-icon size="48" color="grey-lighten-1">mdi-package-variant-closed</v-icon>
                        <p class="text-body-2 text-medium-emphasis mt-2">
                            Nenhum produto nesta página.
                        </p>
                    </div>
                </template>
            </v-data-table-server>
        </v-card>

        <!-- ============================================================= -->
        <!--  LISTA MOBILE                                                 -->
        <!-- ============================================================= -->
        <div v-else class="mobile-list d-flex flex-column ga-3">
            <v-skeleton-loader v-if="loading" v-for="i in 3" :key="'sk-' + i" type="list-item-avatar-two-line"
                class="rounded-xl" />

            <v-card v-for="product in products" v-else :key="product.id" rounded="xl" border flat
                class="pa-3 mobile-card">
                <div class="d-flex ga-3">
                    <v-avatar rounded="lg" size="72" color="grey-lighten-4" class="flex-shrink-0"
                        @click="emit('view', product)">
                        <v-img v-if="primaryImage(product)" :src="primaryImage(product)" cover />
                        <v-icon v-else color="grey">mdi-image-off-outline</v-icon>
                    </v-avatar>

                    <div class="flex-grow-1 min-width-0">
                        <div class="d-flex align-start justify-space-between ga-2">
                            <div class="min-width-0 flex-grow-1">
                                <div class="font-weight-bold text-truncate d-flex align-center ga-1">
                                    {{ product.name }}
                                    <v-icon v-if="product.is_featured" size="14" color="warning">mdi-star</v-icon>
                                </div>
                                <code class="sku-chip text-caption">{{ product.sku }}</code>
                            </div>

                            <v-menu location="bottom end">
                                <template #activator="{ props: mp }">
                                    <v-btn v-bind="mp" icon="mdi-dots-vertical" variant="text" size="small"
                                        density="compact" />
                                </template>
                                <v-list density="compact" min-width="200">
                                    <v-list-item prepend-icon="mdi-pencil-outline" title="Editar" :disabled="!canManage"
                                        @click="emit('edit', product)" />
                                    <v-list-item :prepend-icon="product.is_featured ? 'mdi-star-off' : 'mdi-star'"
                                        :title="product.is_featured ? 'Remover destaque' : 'Destaque'"
                                        @click="emit('toggleFeatured', product)" />
                                    <v-list-item prepend-icon="mdi-content-duplicate" title="Duplicar"
                                        @click="emit('duplicate', product)" />
                                    <v-divider class="my-1" />
                                    <v-list-item prepend-icon="mdi-trash-can-outline" title="Excluir" base-color="error"
                                        :disabled="!canManage" @click="emit('delete', product)" />
                                </v-list>
                            </v-menu>
                        </div>

                        <div class="text-h6 font-weight-black text-primary mt-1">
                            {{ brl(product.price) }}
                        </div>

                        <div class="d-flex flex-wrap ga-2 mt-2">
                            <v-chip size="x-small" variant="tonal" :color="statusMeta[product.status].color"
                                :prepend-icon="statusMeta[product.status].icon">
                                {{ statusMeta[product.status].label }}
                            </v-chip>
                            <v-chip v-if="product.category_id" size="x-small" variant="tonal" color="primary"
                                prepend-icon="mdi-tag-outline">
                                {{ product.category?.name ?? categoryMap.get(product.category_id) ?? '—' }}
                            </v-chip>
                        </div>
                    </div>
                </div>

                <v-divider class="my-3" />

                <div class="d-flex align-center justify-space-between">
                    <div class="d-flex align-center ga-2">
                        <v-icon size="18" :color="stockBadge(stockOf(product)).color">
                            {{ stockBadge(stockOf(product)).icon }}
                        </v-icon>
                        <span class="text-caption font-weight-bold text-medium-emphasis">
                            Estoque:
                        </span>

                        <div class="stock-stepper d-flex align-center border rounded-pill">
                            <v-btn icon="mdi-minus" variant="text" size="x-small"
                                :disabled="!canManage || stockOf(product) <= 0 || stockLoadingId === product.id"
                                @click="stepStock(product, -1)" />
                            <span class="px-2 font-weight-bold text-body-2"
                                :class="`text-${stockBadge(stockOf(product)).color}`"
                                style="min-width: 32px; text-align: center;">
                                {{ stockOf(product) }}
                            </span>
                            <v-btn icon="mdi-plus" variant="text" size="x-small"
                                :disabled="!canManage || stockLoadingId === product.id"
                                @click="stepStock(product, 1)" />
                        </div>
                    </div>

                    <v-switch :model-value="product.status === 'ACTIVE'" color="success" density="compact" hide-details
                        :disabled="!canManage" @change="emit('toggleStatus', product)" />
                </div>
            </v-card>
        </div>
    </div>
</template>

<style scoped>
.products-table-wrapper {
    contain: content;
}

/* ---- Table ---- */
.products-table :deep(thead th) {
    height: 52px !important;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-bottom: 2px solid rgba(var(--v-border-color), 0.1) !important;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
}

.products-table :deep(tbody tr) {
    transition: background-color 0.15s ease;
}

.products-table :deep(tbody tr:hover) {
    background-color: rgba(var(--v-theme-primary), 0.03) !important;
}

/* ---- Thumb ---- */
.product-thumb {
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.product-thumb:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* ---- SKU chip ---- */
.sku-chip {
    background: rgba(var(--v-theme-on-surface), 0.06);
    padding: 2px 8px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-on-surface));
    font-weight: 600;
}

/* ---- Stock input desktop ---- */
.stock-input {
    max-width: 120px;
}

.stock-input :deep(.v-field) {
    font-size: 0.875rem;
    font-weight: 700;
    box-shadow: none !important;
    background: rgba(var(--v-theme-surface-variant), 0.3);
}

.stock-input :deep(.v-field__input) {
    padding-inline-start: 4px !important;
    text-align: center;
    min-height: 36px;
}

.products-table :deep(tbody tr:hover) .stock-input :deep(.v-field) {
    background: rgb(var(--v-theme-surface));
    border-color: rgb(var(--v-theme-primary));
}

/* ---- Stock stepper mobile ---- */
.stock-stepper {
    background: rgba(var(--v-theme-surface-variant), 0.4);
    height: 32px;
}

.stock-stepper :deep(.v-btn) {
    width: 28px;
    height: 28px;
}

/* ---- Mobile ---- */
.mobile-card {
    transition: box-shadow 0.15s ease;
}

.mobile-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.min-width-0 {
    min-width: 0;
}

.cursor-pointer {
    cursor: pointer;
}

/* Switch alignment fix */
:deep(.v-selection-control) {
    min-height: auto !important;
}
</style>
