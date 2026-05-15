<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFeedbackStore } from '@/stores/feedback';
import { productService } from '@/services/productService';
import { formatCurrency } from '@/utils/format';
import EmptyState from '@/components/base/EmptyState.vue';
import type { Category, Product } from '@/types';

interface Props {
    products: Product[];
    categories: Category[];
    isLimitReached: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits(['loadData', 'handleCreate']);

const isDialogVisible = defineModel<boolean>({ required: true });
const loading = defineModel<boolean>('loading', { required: true });
const selectedProduct = defineModel<any>('selectedProduct', { required: true });
const pendingFiles = defineModel<File[]>('pendingFiles', { required: true });

const feedbackStore = useFeedbackStore();

// Filtros
const search = ref('');
const statusFilter = ref('all');
const categoryFilter = ref('all');
const stockLoadingId = ref<string | null>(null);

// --- PERFORMANCE: Cache de Categorias ---
// Senior tip: Evite .find() dentro de loops de renderização (O(n*m)). 
// Use um Map para busca instantânea O(1).
const categoryMap = computed(() => {
    return new Map(props.categories.map(cat => [cat.id, cat.name]));
});

// --- FILTRAGEM ---
const filteredProducts = computed(() => {
    const query = search.value.toLowerCase().trim();
    return props.products.filter(p => {
        const matchesSearch = !query || p.name.toLowerCase().includes(query) || p.code?.toLowerCase().includes(query);
        const matchesStatus = statusFilter.value === 'all' || p.status === statusFilter.value;
        const matchesCategory = categoryFilter.value === 'all' || p.categoryId === categoryFilter.value;
        return matchesSearch && matchesStatus && matchesCategory;
    });
});

const hasActiveFilters = computed(() => search.value || statusFilter.value !== 'all' || categoryFilter.value !== 'all');

const clearFilters = () => {
    search.value = '';
    statusFilter.value = 'all';
    categoryFilter.value = 'all';
};

// --- AÇÕES ---
function handleEdit(product: Product) {
    selectedProduct.value = JSON.parse(JSON.stringify(product));
    pendingFiles.value = [];
    isDialogVisible.value = true;
}

async function handleToggleStatus(product: Product) {
    const newStatus = product.status === 'active' ? 'draft' : 'active';
    try {
        await productService.save({ ...product, status: newStatus });
        emit('loadData');
        feedbackStore.show(`Produto agora é ${newStatus === 'active' ? 'visível' : 'um rascunho'}.`, 'success');
    } catch (e) {
        feedbackStore.show('Erro ao alterar status.', 'error');
    }
}

async function confirmDelete(product: Product) {
    if (!confirm(`Deseja excluir "${product.name}"? Esta ação não pode ser desfeita.`)) return;

    try {
        loading.value = true;
        await productService.remove(product.id!);
        emit('loadData');
        feedbackStore.show('Produto removido do catálogo.', 'success');
    } finally {
        loading.value = false;
    }
}

async function updateStock(product: Product, newQuantity: number) {
    if (newQuantity < 0 || newQuantity === product.quantity) return;

    stockLoadingId.value = product.id!;
    try {
        await productService.save({ ...product, quantity: newQuantity });
        emit('loadData');
        feedbackStore.show('Estoque atualizado!', 'success');
    } catch (e) {
        feedbackStore.show('Erro ao atualizar estoque.', 'error');
    } finally {
        stockLoadingId.value = null;
    }
}

function onStockInputBlur(product: Product, event: any) {
    const value = parseInt(event.target.value);
    if (!isNaN(value)) {
        updateStock(product, value);
    }
}

</script>

<template>
    <div class="product-management-wrapper ga-4 d-flex flex-column">

        <v-card rounded="xl" border flat class="pa-4 pa-md-5">
            <v-row align="center">
                <v-col cols="12" md="4" lg="5">
                    <v-text-field v-model="search" prepend-inner-icon="mdi-magnify"
                        placeholder="Buscar por nome ou código..." hide-details variant="solo-filled" flat
                        rounded="pill" class="search-input" />
                </v-col>

                <v-col cols="6" md="3" lg="2">
                    <v-select v-model="categoryFilter" :items="[{ name: 'Todas Categorias', id: 'all' }, ...categories]"
                        item-title="name" item-value="id" label="Categoria" hide-details variant="outlined"
                        rounded="pill" density="comfortable" />
                </v-col>

                <v-col cols="6" md="2">
                    <v-select v-model="statusFilter"
                        :items="[{ title: 'Todos', value: 'all' }, { title: 'Ativos', value: 'active' }, { title: 'Rascunhos', value: 'draft' }]"
                        label="Status" hide-details variant="outlined" rounded="pill" density="comfortable" />
                </v-col>

                <v-col cols="12" md="auto" class="d-flex flex-column flex-sm-row ga-2">
                    <v-btn v-if="hasActiveFilters" variant="text" color="medium-emphasis" class="text-none"
                        @click="clearFilters">
                        Limpar
                    </v-btn>
                    <v-btn color="primary" prepend-icon="mdi-plus" rounded="pill" elevation="0" block
                        :disabled="isLimitReached" @click="emit('handleCreate')" class="text-none px-6">
                        Novo <span class="hidden-sm-and-down ml-1">Produto</span>
                    </v-btn>
                </v-col>
            </v-row>
        </v-card>

        <v-card rounded="xl" border flat class="overflow-hidden">
            <v-table v-if="$vuetify.display.mdAndUp" hover class="desktop-table">
                <thead>
                    <tr class="bg-grey-lighten-5">
                        <th class="text-overline font-weight-bold">Produto</th>
                        <th class="text-overline font-weight-bold">Preço</th>
                        <th class="text-overline font-weight-bold" style="width: 160px">Estoque</th>
                        <th class="text-overline font-weight-bold text-center">Exibir</th>
                        <th class="text-overline font-weight-bold text-right">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="product in filteredProducts" :key="product.id">
                        <td>
                            <div class="d-flex align-center ga-3 py-3">
                                <v-avatar rounded="lg" size="52" border color="grey-lighten-4">
                                    <v-img :src="product.imageUrls[0] || '/placeholder-product.png'" cover />
                                </v-avatar>
                                <div class="overflow-hidden">
                                    <div class="font-weight-bold text-truncate" style="max-width: 250px">{{ product.name
                                    }}</div>
                                    <div class="text-caption text-medium-emphasis">
                                        {{ categoryMap.get(product.categoryId) }}
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td class="font-weight-black">{{ formatCurrency(product.price) }}</td>

                        <td>
                            <v-text-field :model-value="product.quantity" type="number" density="compact"
                                variant="outlined" hide-details rounded="lg" class="quick-stock-input"
                                :loading="stockLoadingId === product.id" :disabled="stockLoadingId === product.id"
                                prepend-inner-icon="mdi-package-variant-closed"
                                @blur="onStockInputBlur(product, $event)" @keyup.enter="$event.target.blur()" />
                        </td>

                        <td class="text-center">
                            <v-switch :model-value="product.status === 'active'" color="success" density="compact"
                                hide-details class="d-inline-flex" @change="handleToggleStatus(product)" />
                        </td>
                        <td class="text-right">
                            <div class="d-flex justify-end ga-1">
                                <v-btn icon="mdi-pencil-outline" variant="text" size="small" color="primary"
                                    @click="handleEdit(product)" />
                                <v-btn icon="mdi-trash-can-outline" variant="text" size="small" color="error"
                                    @click="confirmDelete(product)" />
                            </div>
                        </td>
                    </tr>
                </tbody>
            </v-table>

            <div v-else class="mobile-list pa-4 d-flex flex-column ga-3">
                <v-card v-for="product in filteredProducts" :key="product.id" variant="outlined" rounded="lg"
                    class="pa-3">
                    <div class="d-flex ga-3">
                        <!-- <v-avatar rounded="lg" size="80" border><v-img :src="product.imageUrls[0]" cover /></v-avatar> -->
                        <div class="flex-grow-1 overflow-hidden">
                            <div class="font-weight-black text-truncate">{{ product.name }}</div>
                            <div class="text-subtitle-1 font-weight-black text-primary">{{ formatCurrency(product.price)
                            }}</div>

                            <div class="d-flex align-center ga-3 mt-2">
                                <span class="text-caption font-weight-bold text-uppercase opacity-60">Estoque:</span>
                                <div class="stock-stepper d-flex align-center border rounded-pill bg-grey-lighten-4">
                                    <v-btn icon="mdi-minus" variant="text" size="x-small"
                                        :disabled="product.quantity <= 0 || stockLoadingId === product.id"
                                        @click="updateStock(product, product.quantity - 1)" />
                                    <span class="px-2 font-weight-bold text-body-2"
                                        style="min-width: 30px; text-align: center">
                                        {{ product.quantity }}
                                    </span>
                                    <v-btn icon="mdi-plus" variant="text" size="x-small"
                                        :disabled="stockLoadingId === product.id"
                                        @click="updateStock(product, product.quantity + 1)" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <v-divider class="my-3" />

                    <div class="d-flex align-center justify-space-between">
                        <v-switch :model-value="product.status === 'active'" color="success" density="compact"
                            hide-details @change="handleToggleStatus(product)" />
                        <div class="d-flex ga-2">
                            <v-btn icon="mdi-pencil" variant="tonal" size="small" color="primary"
                                @click="handleEdit(product)" />
                            <v-btn icon="mdi-trash-can-outline" variant="text" size="small" color="error"
                                @click="confirmDelete(product)" />
                        </div>
                    </div>
                </v-card>
            </div>
        </v-card>
    </div>
</template>

<style scoped>
/* Estilo Senior para o input de estoque desktop */
.quick-stock-input {
    max-width: 120px;
    transition: all 0.2s ease;
}

.quick-stock-input :deep(.v-field) {
    font-size: 0.875rem;
    font-weight: 700;
    box-shadow: none !important;
}

.quick-stock-input :deep(.v-field__input) {
    padding-inline-start: 8px !important;
    text-align: center;
}

/* Stepper Mobile */
.stock-stepper {
    height: 32px;
}

.stock-stepper :deep(.v-btn) {
    width: 28px;
    height: 28px;
}

.desktop-table :deep(tbody tr:hover) .quick-stock-input :deep(.v-field) {
    background-color: white;
    border-color: rgb(var(--v-theme-primary));
}

.desktop-table :deep(thead th) {
    height: 48px !important;
    border-bottom: 2px solid rgba(var(--v-border-color), 0.05) !important;
}

.desktop-table :deep(tbody tr) {
    transition: background-color 0.2s ease;
}

/* Senior detail: Feedback visual de linha selecionável sem ser agressivo */
.desktop-table :deep(tbody tr:hover) {
    background-color: rgba(var(--v-theme-primary), 0.02) !important;
}

.search-input :deep(.v-field__input) {
    padding-top: 10px;
}

/* Estilo para garantir que o switch não desalinhe o texto */
:deep(.v-selection-control) {
    min-height: auto !important;
}

.mobile-list {
    background-color: rgb(var(--v-theme-surface));
}

/* Otimização de performance: Rendering layer */
.product-management-wrapper {
    contain: content;
}
</style>