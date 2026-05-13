<script setup lang="ts">
defineProps<{
    title: string;
    description: string;
}>();
</script>

<template>
    <v-card class="glass-panel pa-8 text-center">
        <div class="text-h6 font-weight-bold">{{ title }}</div>
        <div class="text-body-2 text-medium-emphasis mt-2">{{ description }}</div>
        <slot />
    </v-card>
</template>
