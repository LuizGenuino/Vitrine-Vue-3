<script setup lang="ts">
import { computed, onMounted, ref, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { useRealtime } from '@/composables/useRealtime'
import { useAsyncAction } from '@/composables/useAsyncAction'

import { productsService } from '@/services/products.service'
import { inventoryService } from '@/services/inventory.service'
import { storageService } from '@/services/storage.service'
import { supabase } from '@/lib/supabase'

import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue'
import DialogProductForm from './components/DialogProductForm.vue'
import TableProducts from './components/TableProducts.vue'

import type {
    Product, ProductWithRelations, ProductStatus,
    Category, ProductInsert,
} from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const router = useRouter()
const auth = useAuthStore()
const notify = useNotifications()

const { currentStoreId, currentRole } = storeToRefs(auth)

/* -------------------------------------------------------------------------- */
/*  Utils                                                                     */
/* -------------------------------------------------------------------------- */

const LOW_STOCK_THRESHOLD = 5

function slugify(text: string): string {
    return text
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
}

function generateSku(): string {
    return 'SKU-' + Math.random().toString(36).slice(2, 8).toUpperCase()
}

const formatCurrency = (v: number) =>
    Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/* -------------------------------------------------------------------------- */
/*  Filtros & paginação                                                       */
/* -------------------------------------------------------------------------- */

interface Filters {
    search: string
    status: ProductStatus | ''
    categoryId: string | null
    stockFilter: '' | 'in_stock' | 'low_stock' | 'out_of_stock'
}

const filters = reactive<Filters>({
    search: '',
    status: '',
    categoryId: null,
    stockFilter: '',
})

const pagination = reactive({
    page: 1,
    pageSize: 25,
    sortBy: 'created_at',
    ascending: false,
})

const totalItems = ref(0)

/* -------------------------------------------------------------------------- */
/*  Listagem de produtos (server-side)                                        */
/* -------------------------------------------------------------------------- */

const productsQuery = useSupabaseQuery(
    async () => {
        const result = await productsService.listAdvanced({
            page: pagination.page,
            pageSize: pagination.pageSize,
            orderBy: pagination.sortBy,
            ascending: pagination.ascending,
            search: filters.search || undefined,
            categoryId: filters.categoryId || undefined,
            status: filters.status || undefined,
        })
        totalItems.value = result.count
        return result.data
    },
    { watchSource: [currentStoreId] },
)

const rows = computed<ProductWithRelations[]>(() => productsQuery.data.value ?? [])

/* -------------------------------------------------------------------------- */
/*  Categorias — para o filtro e o formulário                                 */
/* -------------------------------------------------------------------------- */

const categoriesQuery = useSupabaseQuery(async () => {
    const { data } = await supabase
        .from('categories')
        .select('id, name, parent_id, is_active')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('sort_order')
    return (data ?? []) as Category[]
}, { watchSource: [currentStoreId] })

const categories = computed(() => categoriesQuery.data.value ?? [])
const subcategories = computed(() => categories.value.filter(c => c.parent_id))
const rootCategories = computed(() => categories.value.filter(c => !c.parent_id))

/* -------------------------------------------------------------------------- */
/*  Saldos de estoque — apenas para os produtos exibidos na página            */
/* -------------------------------------------------------------------------- */

const stockMap = ref<Record<string, number>>({})

watch(rows, async (list) => {
    if (!list.length) { stockMap.value = {}; return }
    stockMap.value = await inventoryService.getBalances(list.map(p => p.id))
}, { immediate: true })

/* Aplica filtro cliente-side apenas para stockFilter — o resto vem do servidor */
const filteredRows = computed(() => {
    if (!filters.stockFilter) return rows.value
    return rows.value.filter(p => {
        const s = stockMap.value[p.id] ?? 0
        switch (filters.stockFilter) {
            case 'in_stock': return s > LOW_STOCK_THRESHOLD
            case 'low_stock': return s > 0 && s <= LOW_STOCK_THRESHOLD
            case 'out_of_stock': return s === 0
        }
    })
})

/* -------------------------------------------------------------------------- */
/*  Estatísticas globais — via query dedicada (não itera cliente-side)        */
/* -------------------------------------------------------------------------- */

interface GlobalStats {
    active: number
    lowStock: number
    outOfStock: number
    totalCost: number
    totalValue: number
    total: number
}

const globalStatsQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return null

    // Todos os produtos ativos com preço/custo e saldo agregado
    const { data: products } = await supabase
        .from('products')
        .select('id, price, cost_price, status')
        .is('deleted_at', null)

    if (!products?.length) {
        return { active: 0, lowStock: 0, outOfStock: 0, totalCost: 0, totalValue: 0, total: 0 } as GlobalStats
    }

    const { data: balances } = await supabase
        .from('product_stock_balances')
        .select('product_id, balance')
        .in('product_id', products.map(p => p.id))

    const balMap: Record<string, number> = {}
    for (const b of balances ?? []) balMap[b.product_id!] = b.balance ?? 0

    const stats: GlobalStats = {
        active: 0, lowStock: 0, outOfStock: 0,
        totalCost: 0, totalValue: 0, total: products.length,
    }

    for (const p of products) {
        if (p.status === 'ACTIVE') stats.active++
        const qty = balMap[p.id] ?? 0
        if (qty === 0) stats.outOfStock++
        else if (qty <= LOW_STOCK_THRESHOLD) stats.lowStock++
        stats.totalCost += Number(p.cost_price ?? 0) * qty
        stats.totalValue += Number(p.price) * qty
    }
    return stats
}, { watchSource: [currentStoreId] })

const stats = computed<GlobalStats>(() =>
    globalStatsQuery.data.value ?? { active: 0, lowStock: 0, outOfStock: 0, totalCost: 0, totalValue: 0, total: 0 },
)

const totalProfit = computed(() => stats.value.totalValue - stats.value.totalCost)

const metricCards = computed(() => [
    { label: 'Ativos', value: stats.value.active, color: 'success', icon: 'mdi-store-check-outline' },
    { label: 'Estoque baixo', value: stats.value.lowStock, color: 'warning', icon: 'mdi-package-variant', onClick: () => filters.stockFilter = 'low_stock' },
    { label: 'Esgotados', value: stats.value.outOfStock, color: 'error', icon: 'mdi-package-variant-closed-remove', onClick: () => filters.stockFilter = 'out_of_stock' },
    { label: 'Custo em estoque', value: formatCurrency(stats.value.totalCost), color: 'primary', icon: 'mdi-cash-minus' },
    { label: 'Valor em vendas', value: formatCurrency(stats.value.totalValue), color: 'primary', icon: 'mdi-cash' },
    {
        label: 'Lucro potencial', value: formatCurrency(totalProfit.value),
        color: totalProfit.value >= 0 ? 'success' : 'error', icon: 'mdi-trending-up'
    },
])

/* -------------------------------------------------------------------------- */
/*  Limite do plano — dados reais da tabela `subscriptions`                   */
/* -------------------------------------------------------------------------- */

const planQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return null
    const { data } = await supabase
        .from('subscriptions')
        .select('plan:plans(name, max_products)')
        .eq('store_id', currentStoreId.value)
        .maybeSingle()
    return (data?.plan as any) ?? { name: 'Free', max_products: 50 }
}, { watchSource: [currentStoreId] })

const productLimit = computed(() => planQuery.data.value?.max_products ?? 50)
const usagePercent = computed(() => Math.min(100, (stats.value.total / productLimit.value) * 100))
const isLimitReached = computed(() => stats.value.total >= productLimit.value)
const canCreateProduct = computed(() => !isLimitReached.value)

/* -------------------------------------------------------------------------- */
/*  Dialog de criação/edição                                                  */
/* -------------------------------------------------------------------------- */

const isDialogVisible = ref(false)
const selectedProduct = ref<Partial<Product> & {
    attributes?: { name: string; value: string }[]
    initialStock?: number
    existingImages?: { id?: string; url: string; is_primary: boolean }[]
} | null>(null)
const pendingFiles = ref<File[]>([])

function handleCreate() {
    if (!canCreateProduct.value) {
        notify.error(
            `Você atingiu o limite de ${productLimit.value} produtos do seu plano. Faça upgrade para continuar.`,
        )
        return
    }
    selectedProduct.value = {
        name: '',
        sku: generateSku(),
        slug: '',
        description: '',
        price: 0,
        cost_price: 0,
        category_id: null,
        status: 'DRAFT',
        is_featured: false,
        seo_title: '',
        seo_description: '',
        attributes: [],
        existingImages: [],
        initialStock: 0,
    }
    pendingFiles.value = []
    isDialogVisible.value = true
}

async function handleEdit(product: ProductWithRelations) {
    // Buscamos detalhes completos (atributos + imagens)
    const { data: attrs } = await supabase
        .from('product_attributes')
        .select('id, name, value')
        .eq('product_id', product.id)

    selectedProduct.value = {
        ...product,
        attributes: attrs ?? [],
        existingImages: product.product_images.map(img => ({
            id: img.id, url: img.url, is_primary: img.is_primary ?? false,
        })),
        initialStock: 0, // não editável em modo edição
    }
    pendingFiles.value = []
    isDialogVisible.value = true
}

/* -------------------------------------------------------------------------- */
/*  Save — cria ou atualiza produto com atributos, imagens e estoque inicial  */
/* -------------------------------------------------------------------------- */

const { execute: saveProduct, loading: saving } = useAsyncAction(async () => {
    if (!selectedProduct.value || !currentStoreId.value) return
    const p = selectedProduct.value
    const isEditing = !!p.id

    /* -----  Validações básicas  ----- */
    if (!p.name?.trim()) throw new Error('Informe o nome do produto')
    if (!p.sku?.trim()) throw new Error('Informe o SKU')
    if (Number(p.price) < 0) throw new Error('Preço não pode ser negativo')

    /* -----  Payload base  ----- */
    const payload: ProductInsert = {
        store_id: currentStoreId.value,
        name: p.name!.trim(),
        sku: p.sku!.trim(),
        slug: p.slug?.trim() || slugify(p.name!),
        description: p.description ?? null,
        price: Number(p.price),
        cost_price: Number(p.cost_price ?? 0),
        category_id: p.category_id ?? null,
        status: p.status ?? 'DRAFT',
        is_featured: !!p.is_featured,
        seo_title: p.seo_title ?? null,
        seo_description: p.seo_description ?? null,
    }

    let productId: string

    /* -----  1. Insert ou update do produto  ----- */
    if (isEditing) {
        const { error } = await supabase
            .from('products').update(payload).eq('id', p.id!)
        if (error) throw error
        productId = p.id!
    } else {
        const { data, error } = await supabase
            .from('products').insert(payload).select('id').single()
        if (error) {
            if (error.code === '23505') throw new Error('SKU ou slug já existente nesta loja')
            throw error
        }
        productId = data.id
    }

    /* -----  2. Atributos (delete-all + insert)  ----- */
    if (p.attributes) {
        await supabase.from('product_attributes')
            .delete().eq('product_id', productId)

        if (p.attributes.length) {
            await supabase.from('product_attributes').insert(
                p.attributes
                    .filter(a => a.name.trim() && a.value.trim())
                    .map(a => ({
                        product_id: productId,
                        name: a.name.trim(),
                        value: a.value.trim(),
                    })),
            )
        }
    }

    /* -----  3. Imagens — remove marcadas + faz upload das pendentes  ----- */
    // 3a. deleta imagens antigas que o usuário removeu do formulário
    const keepIds = (p.existingImages ?? []).filter(i => i.id).map(i => i.id!)
    if (isEditing) {
        const { data: prev } = await supabase
            .from('product_images').select('id, url').eq('product_id', productId)
        const removed = (prev ?? []).filter(img => !keepIds.includes(img.id))
        if (removed.length) {
            // apaga arquivos do storage
            const paths = removed
                .map(r => extractStoragePath(r.url))
                .filter(Boolean) as string[]
            if (paths.length) await storageService.remove('products', paths)
            // apaga rows
            await supabase.from('product_images').delete()
                .in('id', removed.map(r => r.id))
        }
    }

    // 3b. upload das novas
    const uploadedImages: { url: string; is_primary: boolean }[] = []
    for (const [i, file] of pendingFiles.value.entries()) {
        const imgId = crypto.randomUUID()
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = storageService.productImagePath(productId, imgId, ext)
        await storageService.upload('products', path, file)
        const url = storageService.getPublicUrl('products', path)
        uploadedImages.push({
            url,
            is_primary: i === 0 && !keepIds.length, // 1ª nova é primária só se não sobrou antiga
        })
    }
    if (uploadedImages.length) {
        await supabase.from('product_images').insert(
            uploadedImages.map((img, idx) => ({
                product_id: productId,
                url: img.url,
                is_primary: img.is_primary,
                sort_order: keepIds.length + idx,
            })),
        )
    }

    /* -----  4. Estoque inicial (apenas na criação)  ----- */
    if (!isEditing && (p.initialStock ?? 0) > 0) {
        await inventoryService.registerMovement({
            productId,
            type: 'ENTRY',
            quantity: p.initialStock!,
            unitCost: Number(p.cost_price ?? 0) || undefined,
            referenceType: 'manual',
            notes: 'Estoque inicial no cadastro',
        })
    }

    /* -----  Fim  ----- */
    isDialogVisible.value = false
    await Promise.all([productsQuery.refresh(), globalStatsQuery.refresh()])
}, { successMsg: 'Produto salvo com sucesso!' })

/** Extrai o path relativo do bucket a partir da public URL. */
function extractStoragePath(publicUrl: string): string | null {
    const marker = '/storage/v1/object/public/products/'
    const idx = publicUrl.indexOf(marker)
    return idx >= 0 ? publicUrl.slice(idx + marker.length) : null
}

/* -------------------------------------------------------------------------- */
/*  Ações em lote / individuais                                               */
/* -------------------------------------------------------------------------- */

const { execute: toggleStatus } = useAsyncAction(
    async (product: Product) => {
        const newStatus: ProductStatus =
            product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
        await productsService.update(product.id, { status: newStatus })
        await Promise.all([productsQuery.refresh(), globalStatsQuery.refresh()])
    },
    { successMsg: 'Status atualizado' },
)

const { execute: toggleFeatured } = useAsyncAction(
    async (product: Product) => {
        await productsService.toggleFeatured(product.id, !product.is_featured)
        await productsQuery.refresh()
    },
    { successMsg: 'Destaque atualizado' },
)

const confirmDelete = reactive({ open: false, product: null as Product | null })

function askDelete(product: Product) {
    confirmDelete.product = product
    confirmDelete.open = true
}

const { execute: confirmRemove, loading: deleting } = useAsyncAction(
    async () => {
        if (!confirmDelete.product) return
        await productsService.softDelete(confirmDelete.product.id)
        confirmDelete.open = false
        confirmDelete.product = null
        await Promise.all([productsQuery.refresh(), globalStatsQuery.refresh()])
    },
    { successMsg: 'Produto excluído' },
)

/* -------------------------------------------------------------------------- */
/*  Realtime — reflete mudanças de outra sessão/vendedor                      */
/* -------------------------------------------------------------------------- */

useRealtime<Product>({
    table: 'products',
    event: '*',
    scopedToStore: true,
    onChange: () => {
        productsQuery.refresh()
        globalStatsQuery.refresh()
    },
})

/* -------------------------------------------------------------------------- */
/*  Watchers para recarregar ao mudar filtros                                 */
/* -------------------------------------------------------------------------- */

watch(
    [() => filters.search, () => filters.status, () => filters.categoryId,
    () => pagination.page, () => pagination.pageSize,
    () => pagination.sortBy, () => pagination.ascending],
    () => productsQuery.refresh(),
    { deep: false },
)

/* -------------------------------------------------------------------------- */
/*  Debounce da busca                                                         */
/* -------------------------------------------------------------------------- */
let searchDebounce: number | undefined
const searchInput = ref('')
watch(searchInput, (val) => {
    window.clearTimeout(searchDebounce)
    searchDebounce = window.setTimeout(() => {
        pagination.page = 1
        filters.search = val
    }, 400)
})

/* -------------------------------------------------------------------------- */
/*  Permissões                                                                */
/* -------------------------------------------------------------------------- */

const canManage = computed(() =>
    currentRole.value && ['SUDO','OWNER', 'ADMIN', 'MANAGER', 'SELLER', 'EDITOR'].includes(currentRole.value),
)

// Em ProductsPage.vue
const { execute: handleAdjustStock } = useAsyncAction(
    async ({ product, delta, reason }: { product: Product; delta: number; reason?: string }) => {
        await inventoryService.registerMovement({
            productId: product.id,
            type: 'ADJUSTMENT',
            quantity: Math.abs(delta) * (delta > 0 ? 1 : -1), // preserva sinal
            referenceType: 'manual',
            notes: reason,
        })
        // Recarrega saldos
        stockMap.value = await inventoryService.getBalances(
            rows.value.map(p => p.id),
        )
    },
    { successMsg: 'Estoque atualizado' },
)

async function handleDuplicate(product: Product) {
    await productsService.create({
        ...product,
        id: undefined as any,
        name: `${product.name} (cópia)`,
        sku: `${product.sku}-COPY-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        slug: `${product.slug}-copy-${Date.now()}`,
        status: 'DRAFT',
    } as any)
    await productsQuery.refresh()
    notify.success('Produto duplicado como rascunho')
}


onMounted(() => productsQuery.refresh())
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- ============================================================= -->
        <!--  HEADER                                                       -->
        <!-- ============================================================= -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">Produtos</h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Gerencie seu catálogo, estoque e disponibilidade.
                </p>
            </div>

            <div class="d-flex ga-2 flex-column flex-sm-row">
                <v-btn v-if="canManage" color="primary" prepend-icon="mdi-plus" rounded="pill" class="text-none px-6"
                    elevation="0" :disabled="isLimitReached" @click="handleCreate">
                    Novo produto
                </v-btn>
            </div>
        </header>

        <!-- ============================================================= -->
        <!--  MÉTRICAS                                                     -->
        <!-- ============================================================= -->
        <v-row dense>
            <v-col v-for="card in metricCards" :key="card.label" cols="12" sm="6" lg="4">
                <v-skeleton-loader v-if="globalStatsQuery.loading.value && !globalStatsQuery.data.value" type="card"
                    rounded="xl" />
                <DashboardMetricCard v-else :label="card.label" :value="card.value" :color="card.color"
                    :icon="card.icon" @click="card.onClick?.()" />
            </v-col>
        </v-row>

        <!-- ============================================================= -->
        <!--  CAPACIDADE DO PLANO                                          -->
        <!-- ============================================================= -->
        <v-card rounded="xl" border flat class="pa-6">
            <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-3">
                <div>
                    <h3 class="text-h6 font-weight-bold">
                        Capacidade do catálogo
                    </h3>
                    <p class="text-caption text-medium-emphasis mb-0">
                        Usando <strong>{{ stats.total }}</strong> de
                        <strong>{{ productLimit }}</strong> slots
                        no plano <strong>{{ planQuery.data.value?.name ?? '—' }}</strong>
                    </p>
                </div>
                <v-btn v-if="usagePercent >= 75" variant="tonal" color="primary" rounded="pill"
                    prepend-icon="mdi-arrow-up-bold-circle-outline" class="text-none"
                    @click="router.push({ name: 'plans' })">
                    Fazer upgrade
                </v-btn>
            </div>
            <v-progress-linear :model-value="usagePercent"
                :color="usagePercent > 90 ? 'error' : usagePercent > 75 ? 'warning' : 'primary'" height="8" rounded />

            <v-alert v-if="isLimitReached" icon="mdi-alert-circle-outline" type="error" variant="tonal"
                density="compact" rounded="lg" class="mt-4 mb-0">
                Você atingiu o limite do plano. Faça upgrade para cadastrar mais produtos.
            </v-alert>
        </v-card>

        <!-- ============================================================= -->
        <!--  FILTROS                                                      -->
        <!-- ============================================================= -->
        <v-card rounded="xl" border flat class="pa-4">
            <v-row dense align="center">
                <v-col cols="12" md="4">
                    <v-text-field v-model="searchInput" prepend-inner-icon="mdi-magnify"
                        placeholder="Buscar por nome..." variant="outlined" density="comfortable" hide-details
                        rounded="pill" clearable />
                </v-col>
                <v-col cols="6" md="3">
                    <v-select v-model="filters.categoryId" :items="[
                        { title: 'Todas as categorias', value: null },
                        ...rootCategories.map(c => ({ title: c.name, value: c.id })),
                    ]" variant="outlined" density="comfortable" hide-details rounded="pill" />
                </v-col>
                <v-col cols="6" md="2">
                    <v-select v-model="filters.status" :items="[
                        { title: 'Todos os status', value: '' },
                        { title: 'Ativo', value: 'ACTIVE' },
                        { title: 'Rascunho', value: 'DRAFT' },
                        { title: 'Inativo', value: 'INACTIVE' },
                        { title: 'Arquivado', value: 'ARCHIVED' },
                    ]" variant="outlined" density="comfortable" hide-details rounded="pill" />
                </v-col>
                <v-col cols="12" md="3">
                    <v-select v-model="filters.stockFilter" :items="[
                        { title: 'Todos os estoques', value: '' },
                        { title: 'Em estoque', value: 'in_stock' },
                        { title: 'Estoque baixo', value: 'low_stock' },
                        { title: 'Esgotados', value: 'out_of_stock' },
                    ]" variant="outlined" density="comfortable" hide-details rounded="pill" />
                </v-col>
            </v-row>
        </v-card>

        <!-- ============================================================= -->
        <!--  TABELA                                                       -->
        <!-- ============================================================= -->
        <TableProducts :products="filteredRows" :stock-map="stockMap" :categories="categories" :total-items="totalItems"
            :loading="productsQuery.loading.value" :can-manage="canManage!" v-model:page="pagination.page"
            v-model:items-per-page="pagination.pageSize" v-model:sort-by="pagination.sortBy"
            v-model:ascending="pagination.ascending" @edit="handleEdit" @delete="askDelete"
            @toggle-status="toggleStatus" @toggle-featured="toggleFeatured"
            @view="(p) => router.push({ name: 'product-detail', params: { id: p.id } })"
            @adjust-stock="handleAdjustStock" @duplicate="handleDuplicate" />

        <!-- ============================================================= -->
        <!--  DIALOG DE FORMULÁRIO                                         -->
        <!-- ============================================================= -->
        <DialogProductForm v-if="isDialogVisible && selectedProduct" v-model="isDialogVisible"
            v-model:product="selectedProduct" v-model:pending-files="pendingFiles" :categories="rootCategories"
            :subcategories="subcategories" :loading="saving" @save="saveProduct" @close="isDialogVisible = false" />

        <!-- ============================================================= -->
        <!--  CONFIRMAÇÃO DE EXCLUSÃO                                      -->
        <!-- ============================================================= -->
        <v-dialog v-model="confirmDelete.open" max-width="460" persistent>
            <v-card rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-alert-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Excluir "{{ confirmDelete.product?.name }}"?
                    </v-card-title>
                </v-card-item>

                <v-card-text>
                    <p class="text-body-2 mb-2">
                        O produto será movido para a lixeira. O histórico de estoque e pedidos permanecerá intacto.
                    </p>
                    <v-alert type="info" variant="tonal" density="compact" rounded="lg" class="mb-0">
                        Você poderá restaurá-lo em <strong>Configurações → Lixeira</strong>.
                    </v-alert>
                </v-card-text>

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="deleting" @click="confirmDelete.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" class="text-none" :loading="deleting" @click="confirmRemove">
                        Excluir
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<style scoped>
:deep(.v-field--rounded-pill) {
    border-radius: 999px !important;
}
</style>
