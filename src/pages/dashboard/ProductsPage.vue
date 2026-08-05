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
import DialogProductForm from './components/DialogProductForm.vue';
import TableProducts from './components/TableProducts.vue';
import { toast } from '@/utils/swal/toast.ts';

const authStore = useAuthStore();
const useStore = useStorefrontStore();
const feedbackStore = useFeedbackStore();
const { uploadMany } = useImageUpload();

// --- ESTADO ---
const products = ref<any[]>([]);
const categories = ref<any[]>([]);
const subcategories = ref<any[]>([]);
const loading = ref(false);
const isDialogVisible = ref(false);


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

const stats = computed(() =>
    products.value.reduce(
        (acc, product) => {
            if (product.status === 'active') acc.active++;

            if (product.quantity === 0) acc.outOfStock++;
            else if (product.quantity <= 5) acc.lowStock++;

            acc.totalCost += product.production_cost * product.quantity;
            acc.totalValue += product.price * product.quantity;

            return acc;
        },
        {
            active: 0,
            lowStock: 0,
            outOfStock: 0,
            totalCost: 0,
            totalValue: 0,
        }
    )
);

const totalProfit = computed(() =>
    stats.value.totalValue - stats.value.totalCost
);


const metricCards = computed(() => [
    {
        label: 'Ativos',
        value: stats.value.active,
        color: 'success',
        icon: 'mdi-store-check',
    },
    {
        label: 'Estoque Baixo',
        value: stats.value.lowStock,
        color: 'warning',
        icon: 'mdi-package-variant',
    },
    {
        label: 'Esgotados',
        value: stats.value.outOfStock,
        color: 'error',
        icon: 'mdi-package-variant',
    },
    {
        label: 'Custo Total dos Produtos',
        value: formatCurrency(stats.value.totalCost),
        color: 'primary',
        icon: 'mdi-cash-minus',
    },
    {
        label: 'Valor Total em vendas',
        value: formatCurrency(stats.value.totalValue),
        color: 'primary',
        icon: 'mdi-cash',
    },
    {
        label: 'Lucro Total possivel',
        value: formatCurrency(totalProfit.value),
        color: totalProfit.value >= 0 ? 'success' : 'error',
        icon: 'mdi-trending-up',
    },
]);

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
    } catch (error) {
        feedbackStore.show('Erro ao carregar produtos.', 'error');
        toast('Erro ao carregar produtos.', 'error');


    } finally {
        loading.value = false;
    }
}

function handleCreate() {
    if (!canCreateProduct.value) {
        toast('Limite do plano atingido.', 'warning');
        return feedbackStore.show('Limite do plano atingido.', 'warning');
    }
    // Inicializa um objeto limpo para o Dialog
    selectedProduct.value = {
        name: '',
        price: 0,
        production_cost: 0,
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
        toast(`Produto ${isEditing ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        feedbackStore.show(`Produto ${isEditing ? 'atualizado' : 'criado'} com sucesso!`, 'success');
        isDialogVisible.value = false;
        await loadData();
    } catch (error) {
        feedbackStore.show('Erro ao salvar produto.', 'error');
        toast('Erro ao salvar produto.', 'error');
    } finally {
        loading.value = false;
    }
}


onMounted(loadData);
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <v-row dense>
            <v-col v-for="card in metricCards" :key="card.label" cols="12" sm="6" lg="4">
                <DashboardMetricCard :label="card.label" :value="card.value" :color="card.color" :icon="card.icon" />
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

        <TableProducts :categories="categories" :products="products" v-model="isDialogVisible" v-model:loading="loading"
            v-model:selected-product="selectedProduct" v-model:pending-files="pendingFiles"
            :is-limit-reached="isLimitReached" @load-data="loadData" @handle-create="handleCreate" />

        <DialogProductForm v-if="isDialogVisible" v-model="isDialogVisible" v-model:product="selectedProduct"
            v-model:pending-files="pendingFiles" :categories="categories" :subcategories="subcategories"
            :loading="loading" :can-create-product="canCreateProduct" :is-limit-reached="isLimitReached"
            @save="saveProduct" @close="isDialogVisible = false" />
    </div>
</template>