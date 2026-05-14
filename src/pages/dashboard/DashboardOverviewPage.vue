<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useStorefrontStore } from '@/stores/storefront';
import { categoryService } from '@/services/categoryService';
import { productService } from '@/services/productService';
import { demoSeedService } from '@/services/demoSeedService';
import { useStoreReadiness } from '@/composables/useStoreReadiness';
import { usePlanAccess } from '@/composables/usePlanAccess';

// Componentes (Supondo que você já tenha ou vá refinar)
import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue';
import OnboardingChecklist from '@/components/dashboard/OnboardingChecklist.vue';

import type { Category, Product } from '@/types';
import { useFeedbackStore } from '@/stores/feedback';

const feedbackStore = useFeedbackStore();
const router = useRouter();
const authStore = useAuthStore();
const storefrontStore = useStorefrontStore();

const categories = ref<Category[]>([]);
const products = ref<Product[]>([]);
const loading = ref(true);
const seeding = ref(false);

// Métricas com lógica de negócio
const activeProducts = computed(() => products.value.filter(p => p.status === 'active').length);
const lowStock = computed(() => products.value.filter(p => p.quantity <= 5));
const publicUrl = computed(() =>
    storefrontStore.settings.slug ? `${window.location.origin}/s/${storefrontStore.settings.slug}` : ''
);

// Composables de lógica SaaS e Readiness
const { steps, completion, readyToLaunch } = useStoreReadiness({
    settings: () => storefrontStore.settings,
    categoriesCount: () => categories.value.length,
    productsCount: () => activeProducts.value,
});

const {
    currentPlan,
    usagePercent,
    remainingProducts,
    isNearLimit,
    isLimitReached,
} = usePlanAccess(
    computed(() => storefrontStore.settings.activePlanId),
    computed(() => products.value.length)
);

async function loadData() {
    if (!authStore.user?.uid) return;
    loading.value = true;
    try {
        const [catData, prodData] = await Promise.all([
            categoryService.listCategories(authStore.user.uid),
            productService.listByOwner(authStore.user.uid),
        ]);
        categories.value = catData;
        products.value = prodData;
    } catch (e) {
        console.error("Erro ao carregar dashboard", e);
    } finally {
        loading.value = false;
    }
}

async function populateDemo() {
    if (!authStore.user?.uid || seeding.value) return;
    seeding.value = true;
    try {
        await demoSeedService.seed(authStore.user.uid);
        await loadData();
    } finally {
        seeding.value = false;
    }
}

async function copiarLink() {
    try {
        await navigator.clipboard.writeText(storefrontStore.settings.slug ? `${window.location.origin}/s/${storefrontStore.settings.slug}` : '');
        feedbackStore.show(`Link copiado com sucesso!`, 'success');
    } catch (err) {
        console.error('Erro ao copiar: ', err);
    }
}

onMounted(loadData);
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">
                    Olá, {{ authStore.user?.displayName?.split(' ')[0] || 'Lojista' }}! 👋
                </h1>
                <p class="text-body-1 text-medium-emphasis">
                    Veja como está o desempenho da sua vitrine hoje.
                </p>
            </div>
            <div class="d-flex ga-3 flex-column flex-sm-row">
                <v-btn v-if="publicUrl" prepend-icon="mdi-eye-outline" variant="outlined" rounded="pill"
                    class="text-none" color="primary" :href="publicUrl" target="_blank">
                    Ver minha vitrine
                </v-btn>
                <v-btn color="primary" prepend-icon="mdi-plus" rounded="pill" elevation="0" class="text-none px-6"
                    @click="router.push({ name: 'dashboard-products-create' })">
                    Novo Produto
                </v-btn>
            </div>
        </header>

        <v-row>
            <v-col cols="12" sm="6" lg="3">
                <DashboardMetricCard label="Produtos Visíveis" :value="activeProducts" icon="mdi-store-check-outline"
                    description="Itens publicados e visíveis para clientes." color="primary" />
            </v-col>
            <v-col cols="12" sm="6" lg="3">
                <DashboardMetricCard label="Categorias" :value="categories.length" icon="mdi-layers-outline"
                    description="Categorias para filtros e navegação." color="secondary" />
            </v-col>
            <v-col cols="12" sm="6" lg="3">
                <DashboardMetricCard label="Itens em Estoque" description="Soma de todos os produtos"
                    :value="products.reduce((acc, p) => acc + (p.quantity || 0), 0)" icon="mdi-package-variant"
                    color="success" />
            </v-col>
            <v-col cols="12" sm="6" lg="3">
                <DashboardMetricCard label="Alerta de Estoque" :value="lowStock.length" icon="mdi-alert-octagon-outline"
                    description="Produtos que merecem atenção imediata."
                    :color="lowStock.length > 0 ? 'warning' : 'grey-lighten-1'" />
            </v-col>
        </v-row>

        <v-row>
            <v-col cols="12" lg="7">
                <v-card rounded="xl" border flat class="pa-6 h-100">
                    <div class="d-flex align-center justify-space-between mb-6">
                        <div>
                            <h2 class="text-h6 font-weight-bold">Configuração da Loja</h2>
                            <p class="text-caption text-medium-emphasis">Complete os passos para profissionalizar sua
                                venda</p>
                        </div>
                        <v-chip :color="readyToLaunch ? 'success' : 'warning'" variant="tonal" size="small">
                            {{ completion }}% concluído
                        </v-chip>
                    </div>

                    <OnboardingChecklist :steps="steps" :completion="1" />

                    <v-alert v-if="!readyToLaunch" icon="mdi-rocket-launch-outline" color="primary" variant="tonal"
                        rounded="lg" class="mt-6 border-dashed">
                        <div class="text-subtitle-2 font-weight-bold">Quase lá!</div>
                        <div class="text-caption">Sua vitrine precisa de pelo menos um produto e uma categoria para ser
                            publicada com sucesso.</div>
                    </v-alert>
                </v-card>
            </v-col>

            <v-col cols="12" lg="5">
                <v-card rounded="xl" border flat class="pa-6 mb-6">
                    <div class="d-flex justify-space-between align-center mb-4">
                        <span class="text-overline font-weight-bold opacity-70">Seu Plano</span>
                        <v-chip color="primary" size="x-small" variant="flat" rounded="pill">Ativo</v-chip>
                    </div>

                    <h3 class="text-h5 font-weight-black">{{ currentPlan.name }}</h3>
                    <p class="text-body-2 text-medium-emphasis mb-6">Ideal para quem está começando a crescer.</p>

                    <div class="d-flex justify-space-between text-caption mb-2">
                        <span class="font-weight-bold">Capacidade do Catálogo</span>
                        <span class="text-medium-emphasis">{{ products.length }} / {{ currentPlan.productLimit }}
                            produtos</span>
                    </div>
                    <v-progress-linear :model-value="usagePercent" :color="isNearLimit ? 'warning' : 'primary'"
                        height="8" rounded />

                    <div class="mt-6">
                        <v-btn block variant="tonal" color="primary" class="text-none" rounded="lg"
                            @click="router.push({ name: 'dashboard-plans' })">
                            Fazer Upgrade de Plano
                        </v-btn>
                    </div>
                </v-card>

                <v-card rounded="xl" border flat class="pa-6">
                    <h3 class="text-subtitle-1 font-weight-bold mb-4">Ações Rápidas</h3>
                    <v-list class="pa-0">
                        <v-list-item prepend-icon="mdi-database-import-outline" title="Popular Dados Demo"
                            subtitle="Teste o visual da loja rapidamente" rounded="lg" class="mb-2 border"
                            :loading="seeding" @click="populateDemo" />
                        <v-list-item prepend-icon="mdi-share-variant-outline" title="Compartilhar Link da Loja"
                            subtitle="Copiar link no WhatsApp" rounded="lg" class="border" @click="copiarLink" />
                    </v-list>
                </v-card>
            </v-col>
        </v-row>
    </div>
</template>

<style scoped>
.border-dashed {
    border: 1px dashed currentColor !important;
}

/* Suavização de transição */
.v-card {
    transition: transform 0.2s ease-in-out;
}

.v-card:hover {
    /* Opcional: um efeito muito sutil de elevação */
}
</style>