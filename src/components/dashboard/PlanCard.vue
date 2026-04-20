<script setup lang="ts">
import type { SubscriptionPlan } from '@/types';

const props = defineProps<{
  plan: SubscriptionPlan;
  active?: boolean;
}>();
</script>

<template>
  <v-card class="glass-panel pa-5 h-100" :class="props.plan.recommended ? 'border border-primary' : ''">
    <div class="d-flex align-center justify-space-between ga-3 mb-4">
      <div>
        <div class="text-h6 font-weight-bold">{{ props.plan.name }}</div>
        <div class="text-body-2 text-medium-emphasis mt-1">{{ props.plan.tagline }}</div>
      </div>
      <v-chip v-if="props.active" color="success" variant="tonal">Ativo</v-chip>
      <v-chip v-else-if="props.plan.recommended" color="primary" variant="tonal">Recomendado</v-chip>
    </div>

    <div class="text-h4 font-weight-bold">{{ props.plan.priceLabel }}</div>
    <div class="text-body-2 text-medium-emphasis mt-2">{{ props.plan.description }}</div>
    <div class="mt-4 font-weight-medium">Limite de produtos: {{ props.plan.productLimit >= 999999 ? 'Ilimitado' : props.plan.productLimit }}</div>

    <v-list class="bg-transparent px-0 mt-3" density="compact">
      <v-list-item v-for="feature in props.plan.features" :key="feature" class="px-0">
        <template #prepend>
          <v-icon icon="mdi-check-circle-outline" color="success" class="mr-2" />
        </template>
        <v-list-item-title>{{ feature }}</v-list-item-title>
      </v-list-item>
    </v-list>

    <slot />
  </v-card>
</template>
