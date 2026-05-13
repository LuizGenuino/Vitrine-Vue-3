<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { productService } from '@/services/productService';
import { categoryService } from '@/services/categoryService';
import { useStorefrontStore } from '@/stores/storefront';
import { useCartStore } from '@/stores/cart';
import { useUiStore } from '@/stores/ui';
import { useWhatsApp } from '@/composables/useWhatsApp';
import { formatCurrency } from '@/utils/format';
import type { Category, Product } from '@/types';

const route = useRoute();
const router = useRouter();
const storefrontStore = useStorefrontStore();
const cartStore = useCartStore();
const uiStore = useUiStore();
const { buildProductLink } = useWhatsApp();
const product = ref<Product | null>(null);
const categories = ref<Category[]>([]);
const loading = ref(false);
const activeImage = ref('');

const storeSlug = computed(() => String(route.params.storeSlug || ''));
const productSlug = computed(() => String(route.params.productSlug || ''));
const categoryName = computed(() => categories.value.find((item) => item.id === product.value?.categoryId)?.name || 'Categoria');

async function loadProduct() {
  loading.value = true;
  try {
    product.value = await productService.getPublicProductBySlug(storeSlug.value, productSlug.value);
    activeImage.value = product.value?.imageUrls[0] || '';

    if (storefrontStore.settings.ownerId) {
      categories.value = await categoryService.listCategories(storefrontStore.settings.ownerId);
    }
  } finally {
    loading.value = false;
  }
}

function addToCart() {
  if (!product.value) return;
  cartStore.addItem({
    productId: product.value.id || product.value.slug,
    storeSlug: storeSlug.value,
    name: product.value.name,
    price: product.value.price,
    quantity: 1,
    imageUrl: product.value.imageUrls[0],
  });
  uiStore.openCartDrawer();
}

function buyNow() {
  if (!product.value) return;
  window.open(buildProductLink(storefrontStore.settings.channels.whatsappNumber, product.value), '_blank');
}

onMounted(loadProduct);
</script>

<template>
  <div class="pa-4 pa-md-8" :style="storefrontStore.themeStyles">
    <v-btn variant="text" class="mb-4" @click="router.back()">Voltar</v-btn>

    <v-card v-if="product" class="glass-panel pa-4 pa-md-8" rounded="xl">
      <v-row align="start">
        <v-col cols="12" md="6">
          <v-img :src="activeImage || product.imageUrls[0] || 'https://placehold.co/800x800?text=Produto'" height="460" cover class="rounded-xl" />
          <v-row class="mt-2" dense>
            <v-col v-for="image in product.imageUrls" :key="image" cols="3">
              <v-card rounded="lg" variant="outlined" @click="activeImage = image">
                <v-img :src="image" height="84" cover />
              </v-card>
            </v-col>
          </v-row>
        </v-col>

        <v-col cols="12" md="6">
          <v-chip variant="tonal" class="mb-4">{{ categoryName }}</v-chip>
          <div class="text-h4 font-weight-bold">{{ product.name }}</div>
          <div class="text-h5 font-weight-bold mt-4" :style="{ color: storefrontStore.settings.branding.primaryColor }">
            {{ formatCurrency(product.price) }}
          </div>
          <div class="text-body-1 text-medium-emphasis mt-4">{{ product.description }}</div>
          <div class="text-body-1 text-medium-emphasis mt-4">{{ product.details }}</div>

          <v-divider class="my-6" />

          <div class="text-subtitle-1 font-weight-bold mb-3">Características</div>
          <div class="d-flex flex-wrap ga-2 mb-6">
            <v-chip v-for="item in product.characteristics" :key="item" variant="outlined">{{ item }}</v-chip>
          </div>

          <div class="d-flex flex-wrap ga-3">
            <v-btn size="large" color="primary" @click="buyNow">Comprar agora</v-btn>
            <v-btn size="large" variant="outlined" @click="addToCart">Adicionar ao carrinho</v-btn>
          </div>
        </v-col>
      </v-row>
    </v-card>

    <div v-else-if="loading" class="d-flex justify-center py-16">
      <v-progress-circular indeterminate color="primary" size="56" />
    </div>
  </div>
</template>
