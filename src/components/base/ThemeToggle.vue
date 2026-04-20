<script setup lang="ts">
import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';

const uiStore = useUiStore();

const icon = computed(() => (uiStore.themeMode === 'light' ? 'mdi-weather-night' : 'mdi-white-balance-sunny'));
const label = computed(() => (uiStore.themeMode === 'light' ? 'Modo escuro' : 'Modo claro'));
</script>

<template>
  <v-tooltip location="bottom">
    <template #activator="{ props }">
      <v-btn v-bind="props" :icon="icon" variant="text" @click="uiStore.toggleTheme" />
    </template>
    <span>{{ label }}</span>
  </v-tooltip>
</template>
