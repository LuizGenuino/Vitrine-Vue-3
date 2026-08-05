<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useStorefrontStore } from '@/stores/storefront';
import { useFeedbackStore } from '@/stores/feedback';
import { storeService } from '@/services/storeService';
import { planService } from '@/services/planService';
import { usePlanAccess } from '@/composables/usePlanAccess';
import PlanCard from '@/components/dashboard/PlanCard.vue';
import type { StoreSettings } from '@/types';
import { toast } from '@/utils/swal/toast';

const authStore = useAuthStore();
const useStore = useStorefrontStore();
const feedbackStore = useFeedbackStore();
const loading = ref(false);

const productsCount = computed(() => useStore.products.length);
const plans = computed(() => planService.list());
const activePlan = computed(() => planService.getById(useStore.settings.activePlanId));

const { productLimitLabel, usagePercent, remainingProducts, isNearLimit } = usePlanAccess(
    computed(() => useStore.settings.activePlanId),
    productsCount,
);

async function activatePlan(planId: string) {
    if (!authStore.user?.uid) return;
    const selectedPlan = planService.getById(planId);

    if (!selectedPlan.availableForCheckout && planId !== 'free') {
        feedbackStore.show('Estamos preparando o sistema de pagamentos. Por enquanto, aproveite os recursos do plano gratuito!', 'info');
        return;
    }

    loading.value = true;
    try {
        const payload: StoreSettings = {
            ...useStore.settings,
            ownerId: authStore.user.uid,
            activePlanId: selectedPlan.id,
        };
        await storeService.save(payload);
        useStore.patchSettings({ ...payload });
        feedbackStore.show(`Plano ${selectedPlan.name} ativado com sucesso.`, 'success');
        toast(`Plano ${selectedPlan.name} ativado com sucesso.`, 'success');
    } catch (error) {
        feedbackStore.show('Erro ao ativar plano.', 'error');
        toast('Erro ao ativar plano.', 'error');
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="d-flex flex-column ga-8 pb-10">
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-6">
            <div style="max-width: 600px">
                <h1 class="text-h4 text-sm-h3 font-weight-black mb-2 ">Escolha o tamanho do seu <span
                        class="text-primary">sucesso</span></h1>
                <p class="text-body-1 text-medium-emphasis">
                    Seja você um artesão local ou uma loja em expansão, temos a estrutura certa para o seu catálogo
                    brilhar.
                </p>
            </div>

            <v-card variant="flat" border rounded="xl" class="pa-5 bg-surface" width="100%" max-width="380">
                <div class="d-flex align-center justify-space-between mb-3">
                    <span class="text-caption font-weight-bold text-uppercase opacity-60">Uso do Catálogo</span>
                    <v-chip size="x-small" :color="isNearLimit ? 'warning' : 'primary'" variant="flat">
                        {{ activePlan.name }}
                    </v-chip>
                </div>
                <div class="text-h5 font-weight-black mb-1">{{ productsCount }} / {{ productLimitLabel }}</div>
                <v-progress-linear :model-value="usagePercent" :color="isNearLimit ? 'warning' : 'primary'" height="8"
                    rounded class="mb-2" />
                <div class="text-caption text-medium-emphasis">
                    {{ remainingProducts > 0 ?
                        `Você ainda pode cadastrar ${remainingProducts} produtos.` : 'Limite atingido para o plano atual.'
                    }}
                </div>
            </v-card>
        </header>

        <v-row align="stretch">
            <v-col v-for="plan in plans" :key="plan.id" cols="12" md="6" lg="3">
                <v-hover v-slot="{ isHovering, props }">
                    <v-card v-bind="props" :elevation="isHovering ? 12 : 0"
                        :class="['h-100 pa-6 d-flex flex-column transition-swing border', activePlan.id === plan.id ? 'border-primary border-opacity-100' : '']"
                        rounded="xl">
                        <div class="d-flex justify-end mb-n6">
                            <v-chip v-if="activePlan.id === plan.id" color="primary" size="x-small"
                                class="font-weight-black text-uppercase">Plano Atual</v-chip>
                        </div>

                        <div class="text-overline font-weight-bold text-primary mb-2">{{ plan.name }}</div>
                        <div class="d-flex align-baseline mb-4">
                            <span class="text-h4 font-weight-black">{{ plan.priceLabel === 'Grátis' ? 'R$ 0' :
                                plan.priceLabel }}</span>
                            <span v-if="plan.priceLabel !== 'Grátis'"
                                class="text-caption ml-1 text-medium-emphasis">/mês</span>
                        </div>

                        <p class="text-body-2 text-medium-emphasis mb-6">{{ plan.tagline ||
                            'Ideal para testar sua vitrine digital.' }}</p>

                        <v-divider class="mb-6"></v-divider>

                        <div class="flex-grow-1">
                            <div v-for="feature in plan.features" :key="feature" class="d-flex align-center ga-2 mb-3">
                                <v-icon icon="mdi-check-circle" color="primary" size="18"></v-icon>
                                <span class="text-body-2">{{ feature }}</span>
                            </div>
                        </div>

                        <div class="mt-8">
                            <v-btn block rounded="pill" :variant="activePlan.id === plan.id ? 'tonal' : 'flat'"
                                :color="activePlan.id === plan.id ? 'primary' : 'primary'"
                                :disabled="loading || (plan.id !== 'free' && !plan.availableForCheckout)"
                                :loading="loading && activePlan.id !== plan.id" class="text-none font-weight-bold"
                                @click="activatePlan(plan.id)">
                                {{ activePlan.id === plan.id ? 'Plano Ativo' : plan.availableForCheckout ?
                                    'Selecionar Plano' : 'Em breve' }}
                            </v-btn>
                        </div>
                    </v-card>
                </v-hover>
            </v-col>
        </v-row>

        <v-card variant="flat" color="primary" rounded="xl" class="pa-8 pa-md-12 text-white overflow-hidden">
            <v-row align="center">
                <v-col cols="12" md="7">
                    <h2 class="text-h4 font-weight-black mb-4">Sua vitrine sempre em evolução</h2>
                    <p class="text-h6 opacity-80 mb-0 font-weight-regular">
                        Estamos trabalhando para trazer pagamentos integrados, domínios personalizados e relatórios
                        avançados de vendas nas próximas semanas.
                    </p>
                </v-col>
                <v-col cols="12" md="5" class="d-flex justify-md-end">
                    <v-btn color="white" variant="flat" rounded="pill" class="text-primary font-weight-bold">
                        Ver Roadmap de Recursos
                    </v-btn>
                </v-col>
            </v-row>
        </v-card>
    </div>
</template>

<style scoped>
.transition-swing {
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.5, 1);
}

.border-opacity-100 {
    border-width: 2px !important;
}

.uppercase {
    text-transform: uppercase;
}
</style>