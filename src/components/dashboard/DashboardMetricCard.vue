<script setup lang="ts">
defineProps<{
    label: string;
    value: string | number;
    description?: string;
    icon: string;
    color?: string;
}>();
</script>

<template>
    <v-card class="glass-panel pa-5 h-100">
        <div class="d-flex align-start justify-space-between ga-3">
            <div>
                <div class="text-body-2 text-medium-emphasis">{{ label }}</div>
                <div class="text-h4 font-weight-bold mt-2">{{ value }}</div>
                <div v-if="description" class="text-body-2 text-medium-emphasis mt-3">{{ description }}</div>
            </div>
            <v-avatar :color="color || 'primary'" variant="tonal" size="44">
                <v-icon :icon="icon" />
            </v-avatar>
        </div>
    </v-card>
</template>
