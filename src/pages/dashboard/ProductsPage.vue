<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useStorefrontStore } from '@/stores/storefront';
import { useFeedbackStore } from '@/stores/feedback';
import { productService } from '@/services/productService';
import { categoryService } from '@/services/categoryService';
import { usePlanAccess } from '@/composables/usePlanAccess';
import { useImageUpload } from '@/composables/useImageUpload';
import { formatCurrency, slugify } from '@/utils/format';
import { gerarCodigo } from '@/utils/generate';

// Componentes
import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import DialogProductForm from './components/DialogProductForm.vue';

const authStore = useAuthStore();
const useStore = useStorefrontStore();
const feedbackStore = useFeedbackStore();
const { uploadMany, deleteFile, uploading } = useImageUpload();

// --- ESTADO ---
const products = ref<any[]>([]);
const categories = ref<any[]>([]);
const subcategories = ref<any[]>([]);
const loading = ref(false);
const isDialogVisible = ref(false);

// Filtros
const search = ref('');
const statusFilter = ref('all');
const categoryFilter = ref('all');

// Formulário e Arquivos Pendentes
const selectedProduct = ref<any>(null);
const pendingFiles = ref<File[]>([]);

// --- SAAS LOGIC ---
const {
    canCreateProduct,
    usagePercent,
    isLimitReached,
    productLimitLabel
} = usePlanAccess(
    computed(() => useStore.settings.activePlanId),
    computed(() => products.value.length)
);

// --- COMPUTED ---
const filteredProducts = computed(() => {
    return products.value.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.value.toLowerCase());
        const matchesStatus = statusFilter.value === 'all' || p.status === statusFilter.value;
        const matchesCategory = categoryFilter.value === 'all' || p.categoryId === categoryFilter.value;
        return matchesSearch && matchesStatus && matchesCategory;
    });
});

const stats = computed(() => ({
    active: products.value.filter(p => p.status === 'active').length,
    lowStock: products.value.filter(p => p.quantity <= 5).length,
    outOfStock: products.value.filter(p => p.quantity === 0).length,
    totalValue: formatCurrency(products.value.reduce((acc, p) => acc + (p.price * p.quantity), 0))
}));

// --- MÉTODOS ---
async function loadData() {
    if (!authStore.user?.uid) return;
    loading.value = true;
    try {
        const uid = authStore.user.uid;
        const [p, c, s] = await Promise.all([
            productService.listByOwner(uid),
            categoryService.listCategories(uid),
            categoryService.listSubcategories(uid)
        ]);
        products.value = p;
        categories.value = c;
        subcategories.value = s;
    } finally {
        loading.value = false;
    }
}

function handleCreate() {
    if (!canCreateProduct.value) {
        return feedbackStore.show('Limite do plano atingido.', 'warning');
    }
    // Inicializa um objeto limpo para o Dialog
    selectedProduct.value = {
        name: '',
        price: 0,
        quantity: 0,
        description: '',
        categoryId: '',
        subcategoryId: '',
        imageUrls: [],
        status: 'active',
        characteristics: [],
        details: ''
    };
    pendingFiles.value = [];
    isDialogVisible.value = true;
}

function handleEdit(product: any) {
    // Deep clone para não alterar a lista antes de salvar
    selectedProduct.value = JSON.parse(JSON.stringify(product));
    pendingFiles.value = [];
    isDialogVisible.value = true;
}

async function saveProduct() {
    if (!authStore.user?.uid) return;

    loading.value = true;
    try {
        const ownerId = authStore.user.uid;
        const isEditing = !!selectedProduct.value.id;
        const code = selectedProduct.value.code || gerarCodigo(8);

        // 1. Filtrar URLs permanentes (remover blobs temporários)
        let finalImageUrls = selectedProduct.value.imageUrls.filter((url: string) => url.startsWith('http'));

        // 2. Upload de novos arquivos se houver
        if (pendingFiles.value.length > 0) {
            const folder = `products/${code}`;
            const uploadedUrls = await uploadMany(ownerId, folder, pendingFiles.value);
            finalImageUrls = [...finalImageUrls, ...uploadedUrls];
        }

        // 3. Salvar no Banco
        await productService.save({
            ...selectedProduct.value,
            ownerId,
            code,
            slug: selectedProduct.value.slug || slugify(selectedProduct.value.name),
            price: Number(selectedProduct.value.price),
            quantity: Number(selectedProduct.value.quantity),
            imageUrls: finalImageUrls
        });

        feedbackStore.show(`Produto ${isEditing ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        isDialogVisible.value = false;
        await loadData();
    } catch (error) {
        feedbackStore.show('Erro ao salvar produto.', 'error');
    } finally {
        loading.value = false;
    }
}

async function confirmDelete(product: any) {
    if (!confirm(`Tem certeza que deseja excluir "${product.name}"?`)) return;

    try {
        loading.value = true;
        // Opcional: Deletar fotos do Storage primeiro
        if (product.imageUrls?.length) {
            // lógica de delete files aqui se necessário
        }
        await productService.remove(product.id);
        await loadData();
        feedbackStore.show('Produto removido.');
    } finally {
        loading.value = false;
    }
}

async function toggleStatus(product: any) {
    const newStatus = product.status === 'active' ? 'draft' : 'active';
    await productService.save({ ...product, status: newStatus });
    await loadData();
    feedbackStore.show(`Status alterado para ${newStatus}`);
}

onMounted(loadData);
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <v-row dense>
            <v-col v-for="(val, label) in stats" :key="label" cols="12" sm="6" lg="3">
                <DashboardMetricCard
                    :label="label === 'active' ? 'Ativos' : label === 'lowStock' ? 'Estoque Baixo' : label === 'outOfStock' ? 'Esgotados' : 'Valor Total'"
                    :value="val"
                    :color="label === 'active' ? 'success' : label === 'outOfStock' ? 'error' : label === 'lowStock' ? 'warning' : 'primary'"
                    :icon="label === 'active' ? 'mdi-store-check' : 'mdi-package-variant'" />
            </v-col>
        </v-row>

        <v-card rounded="xl" border flat class="pa-6">
            <div class="d-flex align-center justify-space-between mb-4">
                <div>
                    <h3 class="text-h6 font-weight-bold">Capacidade do Catálogo</h3>
                    <p class="text-caption text-medium-emphasis">Usando {{ products.length }} de {{ productLimitLabel }}
                        slots</p>
                </div>
                <v-btn variant="tonal" color="primary" rounded="pill" :to="{ name: 'dashboard-plans' }">Upgrade</v-btn>
            </div>
            <v-progress-linear :model-value="usagePercent" :color="usagePercent > 90 ? 'error' : 'primary'" height="8"
                rounded />
        </v-card>

        <v-card rounded="xl" border flat class="pa-4">
            <v-row align="center" dense>
                <v-col cols="12" md="4">
                    <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" placeholder="Buscar produto..."
                        hide-details variant="solo-filled" flat rounded="pill" />
                </v-col>
                <v-col cols="12" md="3">
                    <v-select v-model="categoryFilter" :items="[{ name: 'Todas Categorias', id: 'all' }, ...categories]"
                        item-title="name" item-value="id" hide-details variant="outlined" rounded="pill"
                        density="compact" />
                </v-col>
                <v-col cols="12" md="2">
                    <v-select v-model="statusFilter"
                        :items="[{ title: 'Todos', value: 'all' }, { title: 'Ativos', value: 'active' }, { title: 'Rascunhos', value: 'draft' }]"
                        hide-details variant="outlined" rounded="pill" density="compact" />
                </v-col>
                <v-spacer></v-spacer>
                <v-btn color="primary" prepend-icon="mdi-plus" rounded="pill" class="px-6" @click="handleCreate"
                    :disabled="isLimitReached">
                    Novo Produto
                </v-btn>
            </v-row>
        </v-card>

        <v-card rounded="xl" border flat class="overflow-hidden">
            <v-table hover>
                <thead>
                    <tr class="bg-grey-lighten-5">
                        <th class="text-overline">Produto</th>
                        <th class="text-overline">Preço</th>
                        <th class="text-overline">Estoque</th>
                        <th class="text-overline">Status</th>
                        <th class="text-right text-overline">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="product in filteredProducts" :key="product.id">
                        <td>
                            <div class="d-flex align-center ga-3 py-3">
                                <v-avatar rounded="lg" size="48" border>
                                    <v-img :src="product.imageUrls[0] || 'https://placehold.co/100'" cover />
                                </v-avatar>
                                <div>
                                    <div class="font-weight-bold text-truncate" style="max-width: 200px">{{ product.name
                                        }}</div>
                                    <div class="text-caption text-disabled">{{categories.find(c => c.id ===
                                        product.categoryId)?.name }}</div>
                                </div>
                            </div>
                        </td>
                        <td class="font-weight-bold">{{ formatCurrency(product.price) }}</td>
                        <td>
                            <v-chip size="x-small" :color="product.quantity <= 5 ? 'warning' : 'info'"
                                variant="flat">
                                {{ product.quantity }} un
                            </v-chip>
                        </td>
                        <td>
                            <v-switch :model-value="product.status === 'active'" color="success" density="compact"
                                hide-details @change="toggleStatus(product)" />
                        </td>
                        <td class="text-right">
                            <v-btn icon="mdi-pencil-outline" variant="text" size="small" color="primary"
                                @click="handleEdit(product)" />
                            <v-btn icon="mdi-trash-can-outline" variant="text" size="small" color="error"
                                @click="confirmDelete(product)" />
                        </td>
                    </tr>
                </tbody>
            </v-table>

            <EmptyState v-if="!loading && filteredProducts.length === 0" title="Nenhum produto"
                description="Sua busca não retornou resultados." />
        </v-card>

        <DialogProductForm v-if="isDialogVisible" v-model="isDialogVisible" v-model:product="selectedProduct"
            v-model:pending-files="pendingFiles" :categories="categories" :subcategories="subcategories"
            :loading="loading" :can-create-product="canCreateProduct" :is-limit-reached="isLimitReached"
            @save="saveProduct" @close="isDialogVisible = false" />
    </div>
</template>