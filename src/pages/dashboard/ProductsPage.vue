<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useStorefrontStore } from '@/stores/storefront';
import { useFeedbackStore } from '@/stores/feedback';
import { productService } from '@/services/productService';
import { categoryService } from '@/services/categoryService';
import { useImageUpload } from '@/composables/useImageUpload';
import { usePlanAccess } from '@/composables/usePlanAccess';
import { formatCurrency, slugify } from '@/utils/format';
import AppSectionCard from '@/components/base/AppSectionCard.vue';
import ImageUploadDropzone from '@/components/base/ImageUploadDropzone.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue';
import type { Category, Product, Subcategory } from '@/types';

const authStore = useAuthStore();
const storefrontStore = useStorefrontStore();
const feedbackStore = useFeedbackStore();
const { uploading, uploadMany } = useImageUpload();
const drawer = ref(false);
const loading = ref(false);
const search = ref('');
const statusFilter = ref<'all' | 'active' | 'draft'>('all');
const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const subcategories = ref<Subcategory[]>([]);
const pendingFiles = ref<File[]>([]);

const initialForm = (): Product => ({
    ownerId: authStore.user?.uid || '',
    slug: '',
    name: '',
    price: 0,
    quantity: 0,
    description: '',
    characteristics: [],
    categoryId: '',
    subcategoryId: '',
    imageUrls: [],
    status: 'active',
});

const form = reactive<Product>(initialForm());
const characteristicsInput = ref('');

const filteredSubcategories = computed(() => subcategories.value.filter((item) => item.categoryId === form.categoryId));
const visibleProducts = computed(() => {
    const term = search.value.trim().toLowerCase();
    return products.value.filter((product) => {
        const matchesSearch = !term || product.name.toLowerCase().includes(term);
        const matchesStatus = statusFilter.value === 'all' || product.status === statusFilter.value;
        return matchesSearch && matchesStatus;
    });
});

const stats = computed(() => ({
    active: products.value.filter((item) => item.status === 'active').length,
    draft: products.value.filter((item) => item.status === 'draft').length,
    lowStock: products.value.filter((item) => item.quantity <= 5).length,
    avgTicket:
        products.value.length > 0
            ? formatCurrency(products.value.reduce((sum, item) => sum + item.price, 0) / products.value.length)
            : formatCurrency(0),
}));

const {
    currentPlan,
    productLimitLabel,
    remainingProducts,
    usagePercent,
    canCreateProduct,
    isNearLimit,
    isLimitReached,
} = usePlanAccess(computed(() => storefrontStore.settings.activePlanId), computed(() => products.value.length));

const canSave = computed(() => Boolean(form.name && form.description && Number(form.price) > 0 && form.imageUrls.length));
const isEditing = computed(() => Boolean(form.id));

function categoryName(categoryId?: string) {
    return categories.value.find((item) => item.id === categoryId)?.name || 'Sem categoria';
}

function resetForm() {
    Object.assign(form, initialForm());
    characteristicsInput.value = '';
    pendingFiles.value = [];
}

async function loadData() {
    if (!authStore.user?.uid) return;
    loading.value = true;
    try {
        const ownerId = authStore.user.uid;
        await storefrontStore.loadByOwner(ownerId);
        [products.value, categories.value, subcategories.value] = await Promise.all([
            productService.listByOwner(ownerId),
            categoryService.listCategories(ownerId),
            categoryService.listSubcategories(ownerId),
        ]);
    } finally {
        loading.value = false;
    }
}

function openCreate() {
    if (!canCreateProduct.value) {
        feedbackStore.show('Você atingiu o limite do plano atual. A página de planos já está pronta para o upgrade final.', 'warning');
        return;
    }
    resetForm();
    drawer.value = true;
}

function openEdit(product: Product) {
    Object.assign(form, { ...product });
    characteristicsInput.value = product.characteristics.join('\n');
    drawer.value = true;
}

async function handleSelectFiles(files: File[]) {
    const MAX_FILES = 4;

    const currentTotal = form.imageUrls.length;
    const availableSlots = MAX_FILES - currentTotal;

    if (availableSlots <= 0) return;

    const filesToAdd = files.slice(0, availableSlots);

    pendingFiles.value = [...pendingFiles.value, ...filesToAdd];

    const newTemporaryUrls = filesToAdd.map((file) => URL.createObjectURL(file));

    form.imageUrls = [...form.imageUrls, ...newTemporaryUrls];
}

function removeImage(index: number) {
    const urlToRemove = form.imageUrls[index];

    if (urlToRemove.startsWith('blob:')) {
        const blobIndex = form.imageUrls
            .filter(url => url.startsWith('blob:'))
            .indexOf(urlToRemove);

        if (blobIndex !== -1) {
            pendingFiles.value.splice(blobIndex, 1);
        }

        URL.revokeObjectURL(urlToRemove);
    }

    form.imageUrls.splice(index, 1);
}

async function saveProduct() {
    if (!authStore.user?.uid || !canSave.value) return;
    if (!isEditing.value && !canCreateProduct.value) {
        feedbackStore.show('Limite do plano atual alcançado. A base para upgrade já está pronta na área de planos.', 'warning');
        return;
    }

    loading.value = true;
    try {
        const ownerId = authStore.user.uid;
        let imageUrls = form.imageUrls.filter((item) => item.startsWith('http'));

        if (pendingFiles.value.length) {
            const uploaded = await uploadMany(ownerId, 'products', pendingFiles.value);
            imageUrls = uploaded;
        }

        await productService.save({
            ...form,
            ownerId,
            slug: form.slug || slugify(form.name),
            price: Number(form.price),
            quantity: Number(form.quantity),
            characteristics: characteristicsInput.value
                .split(/\n|,/)
                .map((item) => item.trim())
                .filter(Boolean),
            imageUrls,
        });

        drawer.value = false;
        resetForm();
        await loadData();
        feedbackStore.show('Produto salvo com sucesso.', 'success');
    } finally {
        loading.value = false;
    }
}

async function removeProduct(id?: string) {
    if (!id) return;
    await productService.remove(id);
    await loadData();
    feedbackStore.show('Produto removido do catálogo.', 'info');
}

onMounted(loadData);
</script>

<template>
    <div class="d-flex flex-column ga-6">
        <v-row>
            <v-col cols="12" md="6" xl="3">
                <DashboardMetricCard label="Ativos" :value="stats.active" description="Itens publicados na vitrine."
                    icon="mdi-check-circle-outline" color="success" />
            </v-col>
            <v-col cols="12" md="6" xl="3">
                <DashboardMetricCard label="Rascunhos" :value="stats.draft" description="Produtos ainda não publicados."
                    icon="mdi-file-document-outline" color="warning" />
            </v-col>
            <v-col cols="12" md="6" xl="3">
                <DashboardMetricCard label="Baixo estoque" :value="stats.lowStock"
                    description="Produtos com pouca disponibilidade." icon="mdi-alert-outline" color="error" />
            </v-col>
            <v-col cols="12" md="6" xl="3">
                <DashboardMetricCard label="Ticket médio" :value="stats.avgTicket"
                    description="Preço médio do catálogo." icon="mdi-cash-multiple" color="primary" />
            </v-col>
        </v-row>

        <v-card class="glass-panel pa-5 pa-md-6">
            <div class="d-flex flex-column flex-lg-row justify-space-between align-start ga-4">
                <div>
                    <div class="section-title">Capacidade do plano</div>
                    <div class="section-subtitle mt-1">A V3 já controla o volume de produtos conforme a camada SaaS
                        preparada.</div>
                </div>
                <v-chip color="primary" variant="tonal">{{ currentPlan.name }} · {{ products.length }}/{{
                    productLimitLabel }}</v-chip>
            </div>
            <v-progress-linear :model-value="usagePercent" color="primary" height="10" rounded class="mt-4 mb-3" />
            <div class="text-body-2 text-medium-emphasis">
                {{ currentPlan.productLimit >= 999999 ? 'Seu plano atual não possui limitação prática.' :
                    `${remainingProducts} vagas restantes para novos produtos.` }}
            </div>
            <v-alert v-if="isLimitReached" type="warning" variant="tonal" class="mt-4">
                Limite atingido. O fluxo de upgrade já está pronto na tela de planos para a próxima versão.
            </v-alert>
            <v-alert v-else-if="isNearLimit" type="info" variant="tonal" class="mt-4">
                Você está perto do limite do plano. Vale planejar o upgrade para sustentar mais catálogo.
            </v-alert>
            <div class="mt-4">
                <v-btn variant="outlined" :to="{ name: 'dashboard-plans' }">Ir para planos</v-btn>
            </div>
        </v-card>

        <AppSectionCard title="Catálogo de produtos"
            subtitle="Visualize o inventário com mais clareza, valide o limite do plano e edite rapidamente.">
            <template #actions>
                <v-btn color="primary" :disabled="!canCreateProduct" @click="openCreate">Novo produto</v-btn>
            </template>

            <v-row class="mb-4">
                <v-col cols="12" md="8">
                    <v-text-field v-model="search" label="Buscar produto" hide-details />
                </v-col>
                <v-col cols="12" md="4">
                    <v-select v-model="statusFilter" :items="[
                        { title: 'Todos', value: 'all' },
                        { title: 'Ativos', value: 'active' },
                        { title: 'Rascunhos', value: 'draft' }
                    ]" item-title="title" item-value="value" label="Status" hide-details />
                </v-col>
            </v-row>

            <div v-if="visibleProducts.length" class="overflow-x-auto">
                <v-table>
                    <thead>
                        <tr>
                            <th>Produto</th>
                            <th>Categoria</th>
                            <th>Preço</th>
                            <th>Estoque</th>
                            <th>Status</th>
                            <th class="text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="product in visibleProducts" :key="product.id">
                            <td>
                                <div class="d-flex align-center ga-3 py-2">
                                    <v-avatar rounded="lg" size="52">
                                        <v-img
                                            :src="product.imageUrls[0] || 'https://placehold.co/800x800?text=Produto'"
                                            cover />
                                    </v-avatar>
                                    <div>
                                        <div class="font-weight-bold">{{ product.name }}</div>
                                        <div class="text-body-2 text-medium-emphasis">{{ product.description }}</div>
                                    </div>
                                </div>
                            </td>
                            <td>{{ categoryName(product.categoryId) }}</td>
                            <td>{{ formatCurrency(product.price) }}</td>
                            <td>{{ product.quantity }}</td>
                            <td>
                                <v-chip size="small" :color="product.status === 'active' ? 'success' : 'warning'"
                                    variant="tonal">
                                    {{ product.status }}
                                </v-chip>
                            </td>
                            <td class="text-right">
                                <div class="d-flex justify-end ga-2">
                                    <v-btn size="small" color="info" variant="tonal" @click="openEdit(product)">Editar</v-btn>
                                    <v-btn size="small" variant="text" color="error"
                                        @click="removeProduct(product.id)">Excluir</v-btn>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </v-table>
            </div>

            <EmptyState v-else title="Catálogo vazio"
                description="Adicione o primeiro produto com imagens, preço e categoria para começar a vender.">
                <div class="mt-4">
                    <v-btn color="primary" :disabled="!canCreateProduct" @click="openCreate">Cadastrar primeiro
                        produto</v-btn>
                </div>
            </EmptyState>
        </AppSectionCard>
    </div>

    <v-navigation-drawer v-model="drawer" location="right" temporary width="560">
        <div class="pa-5 d-flex flex-column ga-4">
            <div>
                <div class="text-h6 font-weight-bold">{{ form.id ? 'Editar produto' : 'Novo produto' }}</div>
                <div class="text-body-2 text-medium-emphasis mt-1">Agora com validações mais claras, métricas e
                    consciência
                    do plano atual.</div>
            </div>

            <ImageUploadDropzone :model-value="form.imageUrls" :max="4" @select-files="handleSelectFiles"
                @remove="removeImage" />
            <v-text-field v-model="form.name" label="Nome do produto" />
            <v-row>
                <v-col cols="12" md="6"><v-text-field v-model="form.price" label="Preço" type="number" /></v-col>
                <v-col cols="12" md="6"><v-text-field v-model="form.quantity" label="Quantidade"
                        type="number" /></v-col>
            </v-row>
            <v-textarea v-model="form.description" label="Descrição" rows="3" />
            <v-textarea v-model="characteristicsInput" label="Características"
                hint="Uma por linha ou separadas por vírgula" persistent-hint rows="4" />
            <v-row>
                <v-col cols="12" md="6">
                    <v-select v-model="form.categoryId" :items="categories" item-title="name" item-value="id"
                        label="Categoria" />
                </v-col>
                <v-col cols="12" md="6">
                    <v-select v-model="form.subcategoryId" :items="filteredSubcategories" item-title="name"
                        item-value="id" label="Subcategoria" />
                </v-col>
            </v-row>
            <v-select v-model="form.status" :items="['active', 'draft']" label="Status" />

            <v-alert v-if="!canSave" type="info" variant="tonal">Preencha nome, descrição, preço e ao menos uma imagem
                para
                salvar.</v-alert>
            <v-alert v-if="!isEditing && isLimitReached" type="warning" variant="tonal">
                Novos produtos estão bloqueados pelo limite do plano atual.
            </v-alert>

            <div class="d-flex ga-3 mt-2">
                <v-btn color="primary" :loading="loading || uploading"
                    :disabled="!canSave || (!isEditing && !canCreateProduct)" @click="saveProduct">Salvar
                    produto</v-btn>
                <v-btn variant="text" @click="drawer = false">Cancelar</v-btn>
            </div>
        </div>
    </v-navigation-drawer>
</template>
