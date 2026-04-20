<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useStorefrontStore } from '@/stores/storefront';
import { useFeedbackStore } from '@/stores/feedback';
import { storeService } from '@/services/storeService';
import { planService } from '@/services/planService';
import { productService } from '@/services/productService';
import { usePlanAccess } from '@/composables/usePlanAccess';
import PlanCard from '@/components/dashboard/PlanCard.vue';
import type { StoreSettings } from '@/types';

const authStore = useAuthStore();
const storefrontStore = useStorefrontStore();
const feedbackStore = useFeedbackStore();
const loading = ref(false);
const productsCount = ref(0);
const plans = computed(() => planService.list());
const activePlan = computed(() => planService.getById(storefrontStore.settings.activePlanId));
const { productLimitLabel, usagePercent, remainingProducts } = usePlanAccess(
  computed(() => storefrontStore.settings.activePlanId),
  productsCount,
);

async function loadData() {
  if (!authStore.user?.uid) return;
  loading.value = true;
  try {
    await storefrontStore.loadByOwner(authStore.user.uid);
    const products = await productService.listByOwner(authStore.user.uid);
    productsCount.value = products.length;
  } finally {
    loading.value = false;
  }
}

async function activatePlan(planId: string) {
  if (!authStore.user?.uid) return;
  const selectedPlan = planService.getById(planId);

  if (!selectedPlan.availableForCheckout && planId !== 'free') {
    feedbackStore.show('Este plano está preparado para a versão final e ainda não possui checkout habilitado.', 'info');
    return;
  }

  loading.value = true;
  try {
    const payload: StoreSettings = {
      ...storefrontStore.settings,
      ownerId: authStore.user.uid,
      activePlanId: selectedPlan.id,
    };
    const id = await storeService.save(payload);
    storefrontStore.patch({ ...payload, id });
    feedbackStore.show(`Plano ${selectedPlan.name} definido como padrão da operação.`, 'success');
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <div class="d-flex flex-column ga-6">
    <v-card class="glass-panel pa-6 pa-md-8">
      <v-row align="center">
        <v-col cols="12" lg="8">
          <div class="text-overline text-medium-emphasis mb-3">Monetização preparada</div>
          <div class="text-h4 font-weight-bold mb-3">Camada SaaS pronta para a versão final</div>
          <div class="text-body-1 text-medium-emphasis" style="max-width: 760px">
            A V3 já organiza planos por limite de produtos, mantém o plano gratuito em produção e deixa a navegação preparada para futura cobrança sem reestruturar o catálogo.
          </div>
        </v-col>
        <v-col cols="12" lg="4">
          <v-card variant="outlined" class="pa-4 rounded-xl">
            <div class="text-caption text-medium-emphasis mb-1">Uso atual do plano</div>
            <div class="text-h6 font-weight-bold">{{ productsCount }} de {{ productLimitLabel }} produtos</div>
            <v-progress-linear :model-value="usagePercent" color="primary" height="10" rounded class="mt-3 mb-3" />
            <div class="text-body-2 text-medium-emphasis">
              {{ activePlan.productLimit >= 999999 ? 'Sem limite configurado para o plano atual.' : `${remainingProducts} vagas restantes antes do próximo upgrade.` }}
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-card>

    <v-row>
      <v-col v-for="plan in plans" :key="plan.id" cols="12" md="6" xl="3">
        <PlanCard :plan="plan" :active="activePlan.id === plan.id">
          <div class="mt-4 d-flex flex-column ga-2">
            <v-btn
              block
              color="primary"
              :variant="activePlan.id === plan.id ? 'flat' : 'outlined'"
              :disabled="loading || (plan.id !== 'free' && !plan.availableForCheckout)"
              @click="activatePlan(plan.id)"
            >
              {{ activePlan.id === plan.id ? 'Plano ativo' : plan.id === 'free' ? 'Usar plano gratuito' : 'Em breve' }}
            </v-btn>
            <div v-if="plan.id !== 'free'" class="text-caption text-medium-emphasis">
              Estrutura pronta para gateway, checkout recorrente e upgrade assistido na versão final.
            </div>
          </div>
        </PlanCard>
      </v-col>
    </v-row>

    <v-card class="glass-panel pa-5 pa-md-6">
      <div class="section-title">Roadmap da monetização</div>
      <div class="section-subtitle mt-1">O projeto já está preparado para receber cobrança sem desmontar a experiência atual.</div>

      <v-row class="mt-4">
        <v-col cols="12" md="4">
          <v-card variant="outlined" class="pa-4 h-100 rounded-xl">
            <div class="font-weight-bold mb-2">Etapa 1 · Catálogo por plano</div>
            <div class="text-body-2 text-medium-emphasis">Limites de produtos organizados e refletidos no dashboard e no cadastro.</div>
          </v-card>
        </v-col>
        <v-col cols="12" md="4">
          <v-card variant="outlined" class="pa-4 h-100 rounded-xl">
            <div class="font-weight-bold mb-2">Etapa 2 · Checkout recorrente</div>
            <div class="text-body-2 text-medium-emphasis">Pronto para integrar Stripe, Mercado Pago ou Asaas em uma camada final.</div>
          </v-card>
        </v-col>
        <v-col cols="12" md="4">
          <v-card variant="outlined" class="pa-4 h-100 rounded-xl">
            <div class="font-weight-bold mb-2">Etapa 3 · Upgrade contextual</div>
            <div class="text-body-2 text-medium-emphasis">Mensagens de limite, upgrade e benefícios já pensadas para aumentar conversão.</div>
          </v-card>
        </v-col>
      </v-row>
    </v-card>
  </div>
</template>
