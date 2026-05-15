<script setup lang="ts">
import { computed } from 'vue';

interface Step {
    key: string;
    title: string;
    description: string;
    done: boolean;
    optional?: boolean;
    to?: any; // Adicionamos navegação para tornar o checklist útil
}

const props = defineProps<{
    title?: string;
    completion: number;
    steps: Step[];
}>();

// Ordenação inteligente: Pendentes primeiro, Opcionais por último
const sortedSteps = computed(() => {
    return [...props.steps].sort((a, b) => {
        if (a.done === b.done) return 0;
        return a.done ? 1 : -1;
    });
});

const isFullyCompleted = computed(() => props.completion === 100);
</script>

<template>
    <v-card rounded="xl" border flat class="overflow-hidden">
        <v-card-item :class="isFullyCompleted ? 'bg-success-lighten-5' : 'bg-surface'">
            <template v-slot:prepend>
                <v-icon :icon="isFullyCompleted ? 'mdi-party-popper' : 'mdi-rocket-launch-outline'"
                    :color="isFullyCompleted ? 'success' : 'primary'" size="large" />
            </template>

            <v-card-title class="text-h6 font-weight-bold">
                {{ isFullyCompleted ? 'Tudo pronto para decolar!' : (title || 'Checklist de Lançamento') }}
            </v-card-title>

            <template v-slot:append>
                <v-chip :color="isFullyCompleted ? 'success' : 'primary'" variant="flat" font-weight-bold size="small">
                    {{ completion }}%
                </v-chip>
            </template>
        </v-card-item>

        <v-progress-linear :model-value="completion" :color="isFullyCompleted ? 'success' : 'primary'" height="6"
            flat />

        <v-list lines="two" class="pa-2">
            <v-hover v-for="step in sortedSteps" :key="step.key" v-slot="{ isHovering, props: hoverProps }">
                <v-list-item v-bind="hoverProps" :to="step.done ? undefined : step.to" :active="false" rounded="lg"
                    class="mb-1 transition-all"
                    :class="{ 'opacity-50 grayscale': step.done, 'bg-grey-lighten-5': isHovering && !step.done }">
                    <template v-slot:prepend>
                        <v-icon :icon="step.done ? 'mdi-check-circle' : 'mdi-circle-outline'"
                            :color="step.done ? 'success' : 'grey-lighten-1'" class="mr-2" />
                    </template>

                    <v-list-item-title :class="['font-weight-bold', { 'text-decoration-line-through': step.done }]">
                        {{ step.title }}
                        <v-chip v-if="step.optional" size="x-small" variant="tonal"
                            class="ml-2 text-uppercase">Opcional</v-chip>
                    </v-list-item-title>

                    <v-list-item-subtitle class="mt-1">
                        {{ step.description }}
                    </v-list-item-subtitle>

                    <template v-slot:append>
                        <v-icon v-if="!step.done" icon="mdi-chevron-right" color="primary"
                            :class="{ 'translate-x-2': isHovering }" style="transition: transform 0.2s" />
                        <v-icon v-else icon="mdi-lock-outline" size="small" color="grey-lighten-1" />
                    </template>
                </v-list-item>
            </v-hover>
        </v-list>

        <v-divider />
        <div class="pa-4 bg-grey-lighten-5 text-center">
            <p v-if="!isFullyCompleted" class="text-caption text-medium-emphasis">
                Complete as tarefas em destaque para liberar sua vitrine pública.
            </p>
            <v-btn v-else color="success" variant="text" block append-icon="mdi-share-variant"
                class="text-none font-weight-bold">
                Compartilhar link da minha loja
            </v-btn>
        </div>
    </v-card>
</template>

<style scoped>
.transition-all {
    transition: all 0.3s ease;
}

.opacity-50 {
    opacity: 0.6;
}

.grayscale {
    filter: grayscale(0.8);
}

.translate-x-2 {
    transform: translateX(6px);
}

:deep(.v-list-item-title) {
    font-size: 0.95rem !important;
}
</style>