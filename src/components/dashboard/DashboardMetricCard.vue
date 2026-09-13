<script setup lang="ts">
interface Props {
    label: string
    value: number | string
    icon: string
    description?: string
    color?: string
}
withDefaults(defineProps<Props>(), { color: 'primary' })
defineEmits<{ click: [] }>()
</script>

<template>
    <v-card rounded="xl" border flat class="pa-5 metric-card h-100" @click="$emit('click')">
        <div class="d-flex align-center justify-space-between mb-3">
            <v-avatar :color="color" variant="tonal" size="44" rounded="lg">
                <v-icon :color="color" size="24">{{ icon }}</v-icon>
            </v-avatar>
        </div>
        <div class="text-h4 font-weight-black">{{ value }}</div>
        <div class="text-body-2 font-weight-medium mt-1">{{ label }}</div>
        <div v-if="description" class="text-caption text-medium-emphasis mt-1">
            {{ description }}
        </div>
    </v-card>
</template>

<style scoped>
.metric-card {
    cursor: pointer;
    transition: all .2s ease;
}

.metric-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, .06);
}
</style>
