<script setup lang="ts">
import type { Product } from '@/types';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{
  product: Product;
  storeSlug: string;
}>();
</script>

<template>
  <router-link :to="{ name: 'product', params: { storeSlug, productSlug: props.product.slug } }">
    <v-card class="product-card h-100 pa-3" rounded="xl">
      <v-img
        :src="props.product.imageUrls[0] || 'https://placehold.co/800x800?text=Produto'"
        height="220"
        cover
        class="rounded-xl"
      />
      <div class="mt-4">
        <div class="text-body-1 font-weight-bold">{{ props.product.name }}</div>
        <div class="text-body-2 text-medium-emphasis mt-1" style="min-height: 42px">
          {{ props.product.description }}
        </div>
        <div class="d-flex align-center justify-space-between mt-4">
          <div class="text-h6 font-weight-bold">{{ formatCurrency(props.product.price) }}</div>
          <v-chip size="small" variant="tonal">Estoque: {{ props.product.quantity }}</v-chip>
        </div>
      </div>
    </v-card>
  </router-link>
</template>
