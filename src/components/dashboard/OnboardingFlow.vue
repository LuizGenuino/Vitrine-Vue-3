<script setup lang="ts">
defineProps<{
    steps: Array<{
        title: string;
        routeName: string;
        done: boolean;
    }>;
}>();
</script>

<template>
    <v-card class="glass-panel pa-5 pa-md-6">
        <div class="section-title">Fluxo guiado</div>
        <div class="section-subtitle mt-1">Uma sequência simples para tirar a vitrine do zero até a publicação.</div>

        <div class="d-flex flex-column ga-4 mt-5">
            <router-link v-for="(step, index) in steps" :key="step.routeName" :to="{ name: step.routeName }"
                class="d-block">
                <v-card variant="outlined" class="pa-4">
                    <div class="d-flex align-center ga-4">
                        <v-avatar :color="step.done ? 'success' : 'surface-variant'" size="34">{{ index + 1
                            }}</v-avatar>
                        <div class="flex-grow-1">
                            <div class="font-weight-bold">{{ step.title }}</div>
                            <div class="text-body-2 text-medium-emphasis mt-1">
                                {{ step.done ? 'Etapa concluída' : 'Etapa pendente' }}
                            </div>
                        </div>
                        <v-icon :icon="step.done ? 'mdi-check' : 'mdi-arrow-right'" />
                    </div>
                </v-card>
            </router-link>
        </div>
    </v-card>
</template>
