<script setup lang="ts">
const modelValue = defineModel<string | number | null>();

defineProps<{
    label: string;
    hint?: string;
    type?: string;
}>();
</script>

<template>
    <v-text-field v-model="modelValue" :label="label" :hint="hint" :type="type || 'text'" persistent-hint />
</template>
