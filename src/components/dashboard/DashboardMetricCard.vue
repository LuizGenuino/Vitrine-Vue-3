<script setup lang="ts">
import { computed } from 'vue';

interface Props {
    label: string;
    value: string | number;
    description?: string;
    icon: string;
    color?: string;
    // Novos atributos de nível Senior
    trend?: number; // Ex: 10 para +10% ou -5 para -5%
    loading?: boolean;
    prefix?: string;
}

const props = defineProps<Props>();

// Lógica de Tendência
const trendColor = computed(() => {
    if (!props.trend) return '';
    return props.trend > 0 ? 'success' : 'error';
});

const trendIcon = computed(() => {
    if (!props.trend) return '';
    return props.trend > 0 ? 'mdi-trending-up' : 'mdi-trending-down';
});
</script>

<template>
    <v-hover v-slot="{ isHovering, props: hoverProps }">
        <v-card v-bind="hoverProps" class="metric-card h-100 overflow-hidden" :elevation="isHovering ? 8 : 0"
            rounded="xl" border>
            <v-skeleton-loader v-if="loading" type="article" class="bg-transparent"></v-skeleton-loader>

            <v-card-text v-else class="pa-6">
                <div class="d-flex align-start justify-space-between mb-4">
                    <v-avatar :color="color || 'primary'" variant="tonal" size="48" rounded="lg" class="elevation-0">
                        <v-icon :icon="icon" size="24" />
                    </v-avatar>

                    <v-chip v-if="trend !== undefined" :color="trendColor" size="x-small" variant="flat"
                        class="font-weight-black">
                        <v-icon start :icon="trendIcon" size="12" />
                        {{ Math.abs(trend) }}%
                    </v-chip>
                </div>

                <div>
                    <div class="text-overline text-medium-emphasis font-weight-bold leading-none mb-1">
                        {{ label }}
                    </div>

                    <div class="d-flex align-baseline ga-1">
                        <span v-if="prefix" class="text-h6 text-medium-emphasis font-weight-medium">{{ prefix }}</span>
                        <h2 class="text-h4 font-weight-black tracking-tight">
                            {{ value }}
                        </h2>
                    </div>

                    <div v-if="description" class="text-caption text-medium-emphasis mt-3 d-flex align-center">
                        <v-icon icon="mdi-information-outline" size="14" class="mr-1" />
                        {{ description }}
                    </div>
                </div>
            </v-card-text>

            <div class="position-absolute bottom-0 left-0 w-100"
                :style="{ height: '4px', background: `rgb(var(--v-theme-${color || 'primary'}))` }"></div>
        </v-card>
    </v-hover>
</template>

<style scoped>
.metric-card {
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.5, 1);
    background: rgba(var(--v-theme-surface), 0.8) !important;
    backdrop-filter: blur(10px);
}

.tracking-tight {
    letter-spacing: -1px !important;
}

.leading-none {
    line-height: 1 !important;
}

/* Efeito de escala suave no hover */
.metric-card:hover {
    transform: translateY(-4px);
    border-color: rgba(var(--v-theme-primary), 0.5) !important;
}
</style>