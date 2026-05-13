<script setup lang="ts">
import { ref } from 'vue';

const modelValue = defineModel<string>({ default: '#4F46E5' });

defineProps<{
    label: string;
}>();

const open = ref(false);
</script>

<template>
    <v-menu v-model="open" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props }">
            <v-card v-bind="props" class="pa-3 d-flex align-center justify-space-between" rounded="lg"
                variant="outlined">
                <div>
                    <div class="text-caption text-medium-emphasis">{{ label }}</div>
                    <div class="font-weight-medium mt-1">{{ modelValue }}</div>
                </div>
                <div :style="{ width: '32px', height: '32px', borderRadius: '10px', background: modelValue }" />
            </v-card>
        </template>

        <v-card class="pa-3">
            <v-color-picker v-model="modelValue" hide-inputs show-swatches mode="hex" />
        </v-card>
    </v-menu>
</template>
