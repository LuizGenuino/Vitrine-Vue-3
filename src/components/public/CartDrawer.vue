<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCartStore } from '@/stores/cart';
import { useStorefrontStore } from '@/stores/storefront';
import { useUiStore } from '@/stores/ui';
import { useWhatsApp } from '@/composables/useWhatsApp';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{
  storeSlug?: string;
}>();

const router = useRouter();
const cartStore = useCartStore();
const storefrontStore = useStorefrontStore();
const uiStore = useUiStore();
const { buildCartLink } = useWhatsApp();

const visibleItems = computed(() => (props.storeSlug ? cartStore.itemsByStore(props.storeSlug) : cartStore.items));
const total = computed(() => visibleItems.value.reduce((sum, item) => sum + item.price * item.quantity, 0));
const checkoutLink = computed(() =>
  storefrontStore.settings.whatsappNumber && visibleItems.value.length
    ? buildCartLink(storefrontStore.settings.whatsappNumber, visibleItems.value)
    : '#',
);

watch(
  () => props.storeSlug,
  async (slug) => {
    if (!slug) return;
    await storefrontStore.loadBySlug(slug);
  },
  { immediate: true },
);

function goToCart() {
  if (!props.storeSlug) return;
  uiStore.closeCartDrawer();
  router.push({ name: 'cart', params: { storeSlug: props.storeSlug } });
}
</script>

<template>
  <v-navigation-drawer v-model="uiStore.cartDrawerOpen" location="right" temporary width="420">
    <div class="pa-5 d-flex flex-column" style="height: 100%">
      <div class="d-flex align-center justify-space-between mb-5">
        <div>
          <div class="text-overline text-medium-emphasis">Carrinho rápido</div>
          <div class="text-h6 font-weight-bold">Resumo dos itens</div>
        </div>
        <v-btn icon="mdi-close" variant="text" @click="uiStore.closeCartDrawer" />
      </div>

      <div v-if="visibleItems.length" class="d-flex flex-column ga-3 flex-grow-1" style="min-height: 0; overflow: auto">
        <v-card v-for="item in visibleItems" :key="`${item.storeSlug}-${item.productId}`" variant="outlined" class="pa-3">
          <div class="d-flex ga-3 align-center">
            <v-avatar size="64" rounded="lg">
              <v-img :src="item.imageUrl || 'https://placehold.co/320x320?text=Item'" cover />
            </v-avatar>
            <div class="flex-grow-1">
              <div class="font-weight-bold">{{ item.name }}</div>
              <div class="text-body-2 text-medium-emphasis mt-1">{{ formatCurrency(item.price) }} • {{ item.quantity }} unidade(s)</div>
            </div>
            <v-btn icon="mdi-delete-outline" variant="text" color="error" @click="cartStore.removeItem(item.productId, item.storeSlug)" />
          </div>
        </v-card>
      </div>

      <v-card v-else variant="tonal" class="pa-4">
        <div class="font-weight-bold">Carrinho vazio</div>
        <div class="text-body-2 text-medium-emphasis mt-1">Adicione produtos para ver um resumo rápido aqui.</div>
      </v-card>

      <div class="mt-5 pt-4 border-t">
        <div class="d-flex justify-space-between align-center mb-4">
          <span class="text-medium-emphasis">Total</span>
          <span class="text-h6 font-weight-bold">{{ formatCurrency(total) }}</span>
        </div>
        <div class="d-flex flex-column ga-3">
          <v-btn color="primary" size="large" :disabled="!props.storeSlug || !visibleItems.length" @click="goToCart">
            Abrir carrinho completo
          </v-btn>
          <v-btn
            variant="outlined"
            size="large"
            :disabled="!storefrontStore.settings.whatsappNumber || !visibleItems.length"
            :href="checkoutLink"
            target="_blank"
          >
            Finalizar pelo WhatsApp
          </v-btn>
        </div>
      </div>
    </div>
  </v-navigation-drawer>
</template>
