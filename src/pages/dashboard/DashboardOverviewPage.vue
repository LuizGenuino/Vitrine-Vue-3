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
import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue';
import OnboardingChecklist from '@/components/dashboard/OnboardingChecklist.vue';
import OnboardingFlow from '@/components/dashboard/OnboardingFlow.vue';
import type { Category, Product } from '@/types';

const router = useRouter();
const authStore = useAuthStore();
const storefrontStore = useStorefrontStore();
const categories = ref<Category[]>([]);
const products = ref<Product[]>([]);
const loading = ref(false);
const seeding = ref(false);

const activeProducts = computed(() => products.value.filter((item) => item.status === 'active').length);
const lowStockProducts = computed(() => products.value.filter((item) => item.quantity <= 5).length);
const totalInventory = computed(() => products.value.reduce((sum, item) => sum + item.quantity, 0));
const publicUrl = computed(() =>
  storefrontStore.settings.slug ? `${window.location.origin}/s/${storefrontStore.settings.slug}` : '',
);

const { steps, completion, readyToLaunch } = useStoreReadiness({
  settings: () => storefrontStore.settings,
  categoriesCount: () => categories.value.length,
  productsCount: () => activeProducts.value,
});

const {
  currentPlan,
  usagePercent,
  remainingProducts,
  productLimitLabel,
  isNearLimit,
  isLimitReached,
} = usePlanAccess(computed(() => storefrontStore.settings.activePlanId), computed(() => products.value.length));

const flowSteps = computed(() => [
  { title: 'Configurar identidade da marca', routeName: 'dashboard-settings', done: Boolean(storefrontStore.settings.storeName && storefrontStore.settings.title) },
  { title: 'Estruturar categorias', routeName: 'dashboard-categories', done: categories.value.length > 0 },
  { title: 'Cadastrar produtos', routeName: 'dashboard-products', done: products.value.length > 0 },
  { title: 'Revisar plano SaaS', routeName: 'dashboard-plans', done: Boolean(storefrontStore.settings.activePlanId) },
]);

async function loadData() {
  if (!authStore.user?.uid) return;
  loading.value = true;
  try {
    const ownerId = authStore.user.uid;
    await storefrontStore.loadByOwner(ownerId);
    [categories.value, products.value] = await Promise.all([
      categoryService.listCategories(ownerId),
      productService.listByOwner(ownerId),
    ]);
  } finally {
    loading.value = false;
  }
}

async function populateDemo() {
  if (!authStore.user?.uid) return;
  seeding.value = true;
  try {
    await demoSeedService.seed(authStore.user.uid);
    await loadData();
  } finally {
    seeding.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <div class="d-flex flex-column ga-6">
    <v-card class="glass-panel pa-6 pa-md-8 overflow-hidden">
      <v-row align="center">
        <v-col cols="12" lg="8">
          <div class="text-overline text-medium-emphasis mb-3">Resumo operacional</div>
          <div class="text-h4 font-weight-bold mb-3">{{ storefrontStore.settings.storeName || 'Sua operação digital começa aqui' }}</div>
          <div class="text-body-1 text-medium-emphasis" style="max-width: 760px">
            A V3 eleva a base atual com camada SaaS pronta para monetização, limite por plano no catálogo e navegação preparada para a versão final sem quebrar o fluxo de venda atual.
          </div>
        </v-col>
        <v-col cols="12" lg="4" class="d-flex justify-lg-end">
          <div class="d-flex flex-wrap ga-3">
            <v-btn color="primary" @click="router.push({ name: 'dashboard-settings' })">Configurar vitrine</v-btn>
            <v-btn v-if="publicUrl" variant="outlined" :href="publicUrl" target="_blank">Abrir vitrine</v-btn>
          </div>
        </v-col>
      </v-row>
    </v-card>

    <v-row>
      <v-col cols="12" md="6" xl="3">
        <DashboardMetricCard label="Produtos ativos" :value="activeProducts" description="Itens publicados e visíveis para clientes." icon="mdi-package-variant-closed" color="primary" />
      </v-col>
      <v-col cols="12" md="6" xl="3">
        <DashboardMetricCard label="Categorias" :value="categories.length" description="Estrutura atual do catálogo para filtros e navegação." icon="mdi-shape-outline" color="secondary" />
      </v-col>
      <v-col cols="12" md="6" xl="3">
        <DashboardMetricCard label="Estoque total" :value="totalInventory" description="Soma de unidades cadastradas em todo o catálogo." icon="mdi-chart-box-outline" color="success" />
      </v-col>
      <v-col cols="12" md="6" xl="3">
        <DashboardMetricCard label="Baixo estoque" :value="lowStockProducts" description="Produtos que merecem atenção comercial imediata." icon="mdi-alert-outline" color="warning" />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" xl="7">
        <OnboardingChecklist :completion="completion" :steps="steps" title="Prontidão de lançamento" />
      </v-col>
      <v-col cols="12" xl="5">
        <v-card class="glass-panel pa-5 pa-md-6 h-100">
          <div class="section-title">Plano e capacidade</div>
          <div class="section-subtitle mt-1">Acompanhe a evolução do catálogo com a lógica SaaS já acoplada à operação.</div>

          <div class="d-flex align-start justify-space-between ga-4 mt-5">
            <div>
              <div class="text-overline text-medium-emphasis mb-2">Plano atual</div>
              <div class="text-h5 font-weight-bold">{{ currentPlan.name }}</div>
              <div class="text-body-2 text-medium-emphasis mt-1">{{ currentPlan.priceLabel }} · até {{ productLimitLabel }} produtos</div>
            </div>
            <v-btn variant="outlined" @click="router.push({ name: 'dashboard-plans' })">Ver planos</v-btn>
          </div>

          <v-progress-linear :model-value="usagePercent" color="primary" height="10" rounded class="mt-5 mb-3" />
          <div class="text-body-2 text-medium-emphasis">
            {{ currentPlan.productLimit >= 999999 ? 'Seu plano atual não possui limitação prática de catálogo.' : `${products.length} cadastrados e ${remainingProducts} vagas restantes.` }}
          </div>

          <v-alert v-if="isLimitReached" type="warning" variant="tonal" class="mt-4">
            Você atingiu o limite do plano atual. A camada de upgrade já está pronta para a versão final.
          </v-alert>
          <v-alert v-else-if="isNearLimit" type="info" variant="tonal" class="mt-4">
            Seu catálogo está se aproximando do limite do plano. Já vale planejar a etapa final de upgrade.
          </v-alert>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" xl="7">
        <OnboardingFlow :steps="flowSteps" />
      </v-col>
      <v-col cols="12" xl="5">
        <v-card class="glass-panel pa-5 pa-md-6 h-100">
          <div class="section-title">Ações rápidas</div>
          <div class="section-subtitle mt-1">Acelere a validação da vitrine e reduza tempo até a primeira venda.</div>

          <div class="d-flex flex-column ga-3 mt-5">
            <v-btn block size="large" color="primary" @click="router.push({ name: 'dashboard-products' })">Gerenciar produtos</v-btn>
            <v-btn block size="large" variant="outlined" @click="router.push({ name: 'dashboard-categories' })">Organizar categorias</v-btn>
            <v-btn block size="large" variant="outlined" :loading="seeding" @click="populateDemo">Popular com dados demo</v-btn>
          </div>

          <v-divider class="my-5" />

          <v-alert :type="readyToLaunch ? 'success' : 'info'" variant="tonal">
            {{ readyToLaunch ? 'Sua vitrine está pronta para lançamento.' : 'Conclua o checklist para liberar uma experiência mais profissional.' }}
          </v-alert>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
