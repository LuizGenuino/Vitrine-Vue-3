<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ThemeToggle from '@/components/base/ThemeToggle.vue';
import CartDrawer from '@/components/public/CartDrawer.vue';
import { useCartStore } from '@/stores/cart';
import { useUiStore } from '@/stores/ui';

const route = useRoute();
const cartStore = useCartStore();
const uiStore = useUiStore();

const currentStoreSlug = computed(() => {
  const value = route.params.storeSlug;
  return typeof value === 'string' ? value : '';
});

const visibleCartCount = computed(() =>
  currentStoreSlug.value ? cartStore.countByStore(currentStoreSlug.value) : cartStore.count,
);
</script>

<template>
  <v-main class="bg-background">
    <div class="px-4 px-md-8 pt-4 pt-md-6">
      <v-card class="backdrop-soft px-4 py-3 d-flex align-center justify-space-between" rounded="pill">
        <router-link :to="{ name: 'storefront' }" class="d-flex align-center ga-3">
          <v-avatar color="primary" size="34">V</v-avatar>
          <div>
             <div class="font-weight-bold">VibeStore</div>
            <div class="text-caption text-medium-emphasis">Sua Vitrine Digital Simplificada</div>
          </div>
        </router-link>

        <div class="d-flex align-center ga-2">
          <ThemeToggle />
          <v-btn variant="tonal" color="primary" @click="uiStore.openCartDrawer">
            Carrinho
            <v-chip size="small" class="ml-2">{{ visibleCartCount }}</v-chip>
          </v-btn>
        </div>
      </v-card>
    </div>

    <router-view />
    <CartDrawer :store-slug="currentStoreSlug" />
  </v-main>
</template>
