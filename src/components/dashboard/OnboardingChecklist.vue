<script setup lang="ts">
defineProps<{
    title?: string;
    completion: number;
    steps: Array<{
        key: string;
        title: string;
        description: string;
        done: boolean;
        optional?: boolean;
    }>;
}>();
</script>

<template>
    <v-card class="glass-panel pa-5 pa-md-6">
        <div class="d-flex align-center justify-space-between ga-4 mb-4">
            <div>
                <div class="section-title">{{ title || 'Checklist de lançamento' }}</div>
                <div class="section-subtitle mt-1">Feche o essencial para publicar uma vitrine com padrão de mercado.
                </div>
            </div>
            <v-chip color="primary" variant="tonal">{{ completion }}%</v-chip>
        </div>

        <v-progress-linear :model-value="completion" color="primary" rounded height="10" class="mb-5" />

        <div class="d-flex flex-column ga-3">
            <v-card v-for="step in steps" :key="step.key" variant="outlined" class="pa-4">
                <div class="d-flex align-start ga-3">
                    <v-avatar :color="step.done ? 'success' : 'surface-variant'" size="30">
                        <v-icon :icon="step.done ? 'mdi-check' : 'mdi-circle-outline'" size="18" />
                    </v-avatar>
                    <div class="flex-grow-1">
                        <div class="font-weight-bold d-flex align-center ga-2">
                            <span>{{ step.title }}</span>
                            <v-chip v-if="step.optional" size="x-small" variant="outlined">Opcional</v-chip>
                        </div>
                        <div class="text-body-2 text-medium-emphasis mt-1">{{ step.description }}</div>
                    </div>
                </div>
            </v-card>
        </div>
    </v-card>
</template>
