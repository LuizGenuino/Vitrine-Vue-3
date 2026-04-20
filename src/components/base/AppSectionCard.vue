<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <v-card class="glass-panel pa-5 pa-md-6">
    <div class="d-flex flex-column flex-md-row align-start justify-space-between ga-3 mb-5">
      <div>
        <div class="section-title">{{ title }}</div>
        <div v-if="subtitle" class="section-subtitle mt-1">{{ subtitle }}</div>
      </div>
      <slot name="actions" />
    </div>
    <slot />
  </v-card>
</template>
