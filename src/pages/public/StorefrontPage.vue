<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import ProductCard from '@/components/public/ProductCard.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import { useProductFilters } from '@/composables/useProductFilters';
import { useCartStore } from '@/stores/cart';
import { useStorefrontStore } from '@/stores/storefront';
import { useUiStore } from '@/stores/ui';
import { productService } from '@/services/productService';
import { categoryService } from '@/services/categoryService';
import type { Category, Product, Subcategory } from '@/types';

const route = useRoute();
const cartStore = useCartStore();
const uiStore = useUiStore();
const useStore = useStorefrontStore();
const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const subcategories = ref<Subcategory[]>([]);
const loading = ref(false);

const storeSlug = computed(() => String(route.params.storeSlug || ''));
const { filters, filteredProducts } = useProductFilters(() => products.value);

const visibleSubcategories = computed(() => {
    if (!filters.value.categoryId) return subcategories.value;
    return subcategories.value.filter((item) => item.categoryId === filters.value.categoryId);
});

async function loadStorefront() {
    loading.value = true;
    try {
        if (!useStore.settings.ownerId) return;
        [products.value, categories.value, subcategories.value] = await Promise.all([
            productService.listPublicByStoreSlug(storeSlug.value),
            categoryService.listCategories(useStore.settings.ownerId),
            categoryService.listSubcategories(useStore.settings.ownerId),
        ]);
    } finally {
        loading.value = false;
    }
}

onMounted(loadStorefront);
</script>

<template>
    <div :style="useStore.themeStyles">
        <section class="pa-4 pa-md-8">
            <v-card class="overflow-hidden" rounded="xl">
                <div class="position-relative">
                    <v-img v-if="useStore.settings.bannerUrl" :src="useStore.settings.bannerUrl" height="300" cover />
                    <div class="pa-6 pa-md-10" :style="{
                        background: useStore.settings.bannerUrl
                            ? `linear-gradient(135deg, ${useStore.settings.primaryColor}CC, ${useStore.settings.secondaryColor}CC)`
                            : `linear-gradient(135deg, ${useStore.settings.primaryColor}, ${useStore.settings.secondaryColor})`,
                        marginTop: useStore.settings.bannerUrl ? '-300px' : '0'
                    }">
                        <div
                            class="d-flex flex-column flex-md-row align-start align-md-center justify-space-between ga-5 text-white">
                            <div class="d-flex align-center ga-4">
                                <v-avatar size="64" color="white">
                                    <v-img v-if="useStore.settings.logoUrl" :src="useStore.settings.logoUrl" cover />
                                    <span v-else class="text-h5 font-weight-bold">{{
                                        useStore.settings.storeName?.slice(0, 1) || 'S' }}</span>
                                </v-avatar>
                                <div>
                                    <div class="text-h4 font-weight-bold">{{ useStore.settings.storeName }}</div>
                                    <div class="text-body-1 mt-2" style="opacity: 0.88">{{
                                        useStore.settings.title }}</div>
                                </div>
                            </div>
                            <div class="d-flex flex-wrap ga-3">
                                <v-btn variant="flat" color="white" @click="uiStore.openCartDrawer">
                                    Carrinho ({{ cartStore.countByStore(storeSlug) }})
                                </v-btn>
                            </div>
                        </div>
                        <div class="text-body-1 text-white mt-5" style="max-width: 720px; opacity: 0.88">{{
                            useStore.settings.subtitle }}</div>
                    </div>
                </div>

                <div class="pa-4 pa-md-6 surface-soft">
                    <v-row>
                        <v-col cols="12" md="5">
                            <v-text-field v-model="filters.search" label="Buscar por nome" hide-details />
                        </v-col>
                        <v-col cols="12" sm="6" md="3">
                            <v-select v-model="filters.categoryId" :items="categories" item-title="name" item-value="id"
                                label="Categoria" clearable hide-details />
                        </v-col>
                        <v-col cols="12" sm="6" md="2">
                            <v-select v-model="filters.subcategoryId" :items="visibleSubcategories" item-title="name"
                                item-value="id" label="Subcategoria" clearable hide-details />
                        </v-col>
                        <v-col cols="12" md="2">
                            <v-select v-model="filters.sort" :items="[
                                { title: 'Destaques', value: 'featured' },
                                { title: 'Menor preço', value: 'price-asc' },
                                { title: 'Maior preço', value: 'price-desc' },
                                { title: 'A-Z', value: 'name-asc' }
                            ]" item-title="title" item-value="value" label="Ordenar" hide-details />
                        </v-col>
                    </v-row>
                    <div class="d-flex align-center justify-space-between mt-4">
                        <div class="text-body-2 text-medium-emphasis">{{ filteredProducts.length }} produto(s)
                            encontrado(s)</div>
                        <v-btn variant="text"
                            @click="filters.search = ''; filters.categoryId = null; filters.subcategoryId = null; filters.sort = 'featured'">Limpar
                            filtros</v-btn>
                    </div>
                </div>
            </v-card>
        </section>

        <section class="px-4 px-md-8 pb-8 pb-md-12">
            <v-row v-if="filteredProducts.length">
                <v-col v-for="product in filteredProducts" :key="product.id" cols="12" sm="6" lg="4" xl="3">
                    <ProductCard :product="product" :store-slug="storeSlug" />
                </v-col>
            </v-row>

            <EmptyState v-else-if="!loading" title="Nenhum produto encontrado"
                description="Ajuste a busca ou os filtros para explorar outros itens da vitrine." />

            <div v-else class="d-flex justify-center py-16">
                <v-progress-circular indeterminate color="primary" size="56" />
            </div>
        </section>
    </div>
</template>
