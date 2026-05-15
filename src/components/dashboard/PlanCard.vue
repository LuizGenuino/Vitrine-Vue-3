<script setup lang="ts">
import { computed } from 'vue';
import type { SubscriptionPlan } from '@/types';

const props = defineProps<{
    plan: SubscriptionPlan;
    active?: boolean;
}>();

// Estilos dinâmicos baseados no estado do card
const cardClasses = computed(() => ({
    'plan-card--active': props.active,
    'plan-card--recommended': props.plan.recommended && !props.active,
    'elevation-12': props.plan.recommended || props.active,
    'elevation-2': !props.plan.recommended && !props.active,
}));

const priceDisplay = computed(() => {
    if (props.plan.priceLabel.toLowerCase().includes('grátis')) return { val: 'R$ 0', sub: '/sempre' };
    const parts = props.plan.priceLabel.split('/');
    return { val: parts[0], sub: parts[1] ? `/${parts[1]}` : '/mês' };
});
</script>

<template>
    <v-hover v-slot="{ isHovering, props: hoverProps }">
        <v-card v-bind="hoverProps"
            :class="['plan-card transition-swing overflow-hidden h-100 d-flex flex-column', cardClasses]"
            :style="isHovering ? 'transform: translateY(-8px)' : ''" rounded="xl" border>
            <div class="position-absolute top-0 right-0 pa-4">
                <v-fade-transition>
                    <v-chip v-if="active" color="success" variant="flat" size="small"
                        class="font-weight-black text-uppercase shadow-sm">
                        Seu Plano
                    </v-chip>
                    <v-chip v-else-if="plan.recommended" color="primary" variant="flat" size="small"
                        class="font-weight-black text-uppercase shadow-sm">
                        Melhor Escolha
                    </v-chip>
                </v-fade-transition>
            </div>

            <v-card-text class="pa-6 pa-md-8 flex-grow-1">
                <div class="mb-6">
                    <div class="text-overline font-weight-black text-primary mb-1">{{ plan.name }}</div>
                    <div class="text-body-2 text-medium-emphasis">{{ plan.tagline }}</div>
                </div>

                <div class="d-flex align-baseline mb-4">
                    <span class="text-h3 font-weight-black">{{ priceDisplay.val }}</span>
                    <span class="text-subtitle-1 text-medium-emphasis ml-1">{{ priceDisplay.sub }}</span>
                </div>

                <p class="text-body-2 text-medium-emphasis mb-6">
                    {{ plan.description }}
                </p>

                <v-divider class="mb-6 opacity-10"></v-divider>

                <div class="d-flex align-center ga-3 mb-6 bg-grey-lighten-4 pa-3 rounded-lg border">
                    <v-icon icon="mdi-package-variant-closed" color="primary"></v-icon>
                    <div>
                        <div class="text-caption font-weight-bold text-uppercase leading-none">Capacidade</div>
                        <div class="text-body-2 font-weight-black">
                            {{ plan.productLimit >= 999999 ? 'Produtos Ilimitados' : `${plan.productLimit} Produtos no
                            Catálogo` }}
                        </div>
                    </div>
                </div>

                <div class="text-subtitle-2 font-weight-bold mb-4">O que está incluído:</div>
                <v-list class="bg-transparent pa-0" density="compact">
                    <v-list-item v-for="feature in plan.features" :key="feature" class="px-0 min-h-0 mb-2">
                        <template #prepend>
                            <v-icon icon="mdi-check-circle" color="primary" size="18" class="mr-3 opacity-80" />
                        </template>
                        <v-list-item-title class="text-body-2 whitespace-normal leading-tight">
                            {{ feature }}
                        </v-list-item-title>
                    </v-list-item>
                </v-list>
            </v-card-text>

            <v-card-actions class="pa-6 pa-md-8 pt-0">
                <slot />
            </v-card-actions>

            <div v-if="active" class="active-overlay"></div>
        </v-card>
    </v-hover>
</template>

<style scoped>
.plan-card {
    transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
    background: rgba(var(--v-theme-surface), 0.9) !important;
    backdrop-filter: blur(10px);
    position: relative;
}

/* Estilo para Plano Recomendado */
.plan-card--recommended {
    border: 2px solid rgb(var(--v-theme-primary)) !important;
}

/* Estilo para Plano Ativo */
.plan-card--active {
    border: 2px solid rgb(var(--v-theme-success)) !important;
}

.active-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: rgb(var(--v-theme-success));
}

.shadow-sm {
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.whitespace-normal {
    white-space: normal !important;
}

.leading-tight {
    line-height: 1.25 !important;
}

.leading-none {
    line-height: 1 !important;
}
</style>