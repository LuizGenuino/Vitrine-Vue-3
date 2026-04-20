<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import EmptyState from '@/components/base/EmptyState.vue';
import { useCartStore } from '@/stores/cart';
import { useStorefrontStore } from '@/stores/storefront';
import { useWhatsApp } from '@/composables/useWhatsApp';
import { formatCurrency } from '@/utils/format';

const route = useRoute();
const cartStore = useCartStore();
const storefrontStore = useStorefrontStore();
const { buildCartLink } = useWhatsApp();

const storeSlug = computed(() => String(route.params.storeSlug || ''));
const items = computed(() => cartStore.itemsByStore(storeSlug.value));
const total = computed(() => items.value.reduce((sum, item) => sum + item.price * item.quantity, 0));
const whatsappLink = computed(() => buildCartLink(storefrontStore.settings.whatsappNumber, items.value));

onMounted(() => storefrontStore.loadBySlug(storeSlug.value));
</script>

<template>
  <div class="pa-4 pa-md-8">
    <div class="d-flex flex-column flex-md-row align-start align-md-center justify-space-between ga-4 mb-6">
      <div>
        <div class="text-overline text-medium-emphasis">Carrinho</div>
        <div class="text-h4 font-weight-bold">Resumo da compra</div>
      </div>
      <v-btn variant="text" color="error" @click="cartStore.clear">Limpar carrinho</v-btn>
    </div>

    <v-row v-if="items.length">
      <v-col cols="12" lg="8">
        <v-card v-for="item in items" :key="item.productId" class="glass-panel pa-4 mb-4">
          <div class="d-flex flex-column flex-md-row ga-4 align-start align-md-center justify-space-between">
            <div class="d-flex align-center ga-4">
              <v-avatar size="72" rounded="lg">
                <v-img :src="item.imageUrl || 'https://placehold.co/300x300?text=Item'" cover />
              </v-avatar>
              <div>
                <div class="font-weight-bold">{{ item.name }}</div>
                <div class="text-body-2 text-medium-emphasis">{{ formatCurrency(item.price) }} por unidade</div>
              </div>
            </div>
            <div class="d-flex align-center ga-3">
              <v-text-field
                :model-value="item.quantity"
                type="number"
                min="1"
                density="compact"
                hide-details
                style="max-width: 100px"
                @update:model-value="cartStore.updateQuantity(item.productId, Number($event), item.storeSlug)"
              />
              <div class="font-weight-bold">{{ formatCurrency(item.price * item.quantity) }}</div>
              <v-btn variant="text" color="error" @click="cartStore.removeItem(item.productId, item.storeSlug)">Remover</v-btn>
            </div>
          </div>
        </v-card>
      </v-col>

      <v-col cols="12" lg="4">
        <v-card class="glass-panel pa-5" rounded="xl">
          <div class="text-h6 font-weight-bold">Fechamento</div>
          <div class="d-flex justify-space-between mt-4">
            <span class="text-medium-emphasis">Itens</span>
            <span>{{ items.length }}</span>
          </div>
          <div class="d-flex justify-space-between mt-2">
            <span class="text-medium-emphasis">Total</span>
            <span class="font-weight-bold">{{ formatCurrency(total) }}</span>
          </div>
          <v-btn color="primary" size="large" block class="mt-6" :href="whatsappLink" target="_blank">
            Comprar agora via WhatsApp
          </v-btn>
        </v-card>
      </v-col>
    </v-row>

    <EmptyState
      v-else
      title="Seu carrinho está vazio"
      description="Adicione itens na vitrine para gerar um pedido e finalizar via WhatsApp."
    />
  </div>
</template>
