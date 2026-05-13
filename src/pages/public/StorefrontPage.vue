<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
const storefront = useStorefrontStore();

const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const subcategories = ref<Subcategory[]>([]);
const loading = ref(true);

const storeSlug = computed(() => {
    const slug = route.params.storeSlug;
    return typeof slug === 'string' ? slug : '';
});

const { filters, filteredProducts } = useProductFilters(() => products.value);

// Filtros rápidos
const clearFilters = () => {
    filters.value.search = '';
    filters.value.categoryId = null;
    filters.value.subcategoryId = null;
    filters.value.sort = 'featured';
};

const hasActiveFilters = computed(() =>
    filters.value.search !== '' || filters.value.categoryId !== null || filters.value.subcategoryId !== null
);

const visibleSubcategories = computed(() => {
    if (!filters.value.categoryId) return [];
    return subcategories.value.filter((item) => item.categoryId === filters.value.categoryId);
});

async function loadData() {
    loading.value = true;
    try {
        // Aguarda o ownerId estar disponível no store
        if (!storefront.settings.ownerId) return;

        const [prodData, catData, subData] = await Promise.all([
            productService.listPublicByStoreSlug(storeSlug.value),
            categoryService.listCategories(storefront.settings.ownerId),
            categoryService.listSubcategories(storefront.settings.ownerId),
        ]);

        products.value = prodData;
        categories.value = catData;
        subcategories.value = subData;
    } catch (error) {
        console.error("Erro ao carregar vitrine:", error);
    } finally {
        loading.value = false;
    }
}

// Recarrega se o ownerId mudar (garante que dados carreguem após o fetch inicial do storefront)
watch(() => storefront.settings.ownerId, (newId) => {
    if (newId) loadData();
}, { immediate: true });

console.log('Storefront settings in StorefrontPage:', storefront.settings);
</script>

<template>
    <div :style="storefront.themeStyles" class="min-h-screen">
        <header class="relative overflow-hidden">
            <v-img v-if="storefront.settings.branding.bannerUrl" :src="storefront.settings.branding.bannerUrl"
                height="320" cover class="align-end">
                <div class="fill-height banner-overlay d-flex align-end pa-6 pa-md-12">
                    <v-container class="pa-0">
                        <div class="d-flex flex-column flex-md-row align-center ga-6 text-white">
                            <v-avatar size="90" color="white" class="elevation-10">
                                <v-img v-if="storefront.settings.branding.logoUrl"
                                    :src="storefront.settings.branding.logoUrl" cover />
                                <span v-else class="text-h4 font-weight-bold text-primary">
                                    {{ storefront.settings.storeName?.slice(0, 1) }}
                                </span>
                            </v-avatar>

                            <div class="text-center text-md-left">
                                <h1 class="text-h3 font-weight-black mb-1">{{ storefront.settings.storeName }}</h1>
                                <p class="text-body-1 opacity-90">{{ storefront.settings.title }}</p>
                                <v-chip size="small" color="success" variant="flat" class="mt-2 font-weight-bold">
                                    <v-icon start icon="mdi-whatsapp"></v-icon> Pedidos via WhatsApp
                                </v-chip>
                            </div>
                        </div>
                    </v-container>
                </div>
            </v-img>
            <div class="pa-6 pa-md-10" :style="{
                background: storefront.settings.branding.primaryColor && storefront.settings.branding.secondaryColor
                    ? `linear-gradient(135deg, ${storefront.settings.branding.primaryColor}CC, ${storefront.settings.branding.secondaryColor}CC)`
                    : `linear-gradient(135deg, ${storefront.settings.branding.primaryColor}, ${storefront.settings.branding.secondaryColor})`
            }">
                <div
                    class="d-flex flex-column flex-md-row align-start align-md-center justify-space-between ga-5 text-white">
                    <div class="d-flex align-center ga-4">
                        <v-avatar size="64" color="white">
                            <v-img v-if="storefront.settings.branding.logoUrl"
                                :src="storefront.settings.branding.logoUrl" cover />
                            <span v-else class="text-h5 font-weight-bold">{{
                                storefront.settings.storeName?.slice(0, 1) || 'S' }}</span>
                        </v-avatar>
                        <div>
                            <div class="text-h4 font-weight-bold">{{ storefront.settings.storeName }}</div>
                            <div class="text-body-1 mt-2" style="opacity: 0.88">{{
                                storefront.settings.title }}</div>
                        </div>
                    </div>

                    <div class="d-flex flex-wrap ga-3">

                        <v-btn variant="flat" color="white" @click="uiStore.openCartDrawer">

                            Carrinho ({{ cartStore.countByStore(storeSlug) }})

                        </v-btn>

                    </div>

                </div>

                <div class="text-body-1 text-white mt-5" style="max-width: 720px; opacity: 0.88">{{

                    storefront.settings.subtitle }}</div>

            </div>

        </header>

        <v-container class="mt-n8 relative z-10">
            <v-card rounded="xl" elevation="10" class="pa-4 border">
                <v-row align="center">
                    <v-col cols="12" lg="4">
                        <v-text-field v-model="filters.search" placeholder="O que você procura hoje?"
                            prepend-inner-icon="mdi-magnify" variant="solo-filled" flat hide-details rounded="pill" />
                    </v-col>

                    <v-col cols="12" lg="8">
                        <v-chip v-for="cat in categories" :key="cat.id"
                            :variant="filters.categoryId === cat.id ? 'flat' : 'tonal'"
                            :color="filters.categoryId === cat.id ? 'primary' : ''" class="font-weight-medium"
                            @click="filters.categoryId = filters.categoryId === cat.id ? null : (cat.id ?? null)">
                            {{ cat.name }}
                        </v-chip>
                    </v-col>
                </v-row>

                <v-divider v-if="visibleSubcategories.length" class="my-4"></v-divider>

                <div v-if="visibleSubcategories.length" class="d-flex align-center ga-2 overflow-x-auto no-scrollbar">
                    <span class="text-caption font-weight-bold text-uppercase opacity-60 mr-2">Sub:</span>
                    <v-chip v-for="sub in visibleSubcategories" :key="sub.id" size="small"
                        :color="filters.subcategoryId === sub.id ? 'primary' : ''"
                        :variant="filters.subcategoryId === sub.id ? 'flat' : 'outlined'"
                        @click="filters.subcategoryId = filters.subcategoryId === sub.id ? null : (sub.id ?? null)">
                        {{ sub.name }}
                    </v-chip>
                </div>

                <div class="d-flex align-center justify-space-between mt-4">
                    <div class="text-caption text-medium-emphasis">
                        <strong>{{ filteredProducts.length }}</strong> produtos encontrados
                    </div>
                    <v-btn v-if="hasActiveFilters" variant="text" size="small" color="primary"
                        class="text-none font-weight-bold" @click="clearFilters">
                        Limpar Filtros
                    </v-btn>

                    <v-menu width="200">
                        <template v-slot:activator="{ props }">
                            <v-btn variant="tonal" size="small" v-bind="props" prepend-icon="mdi-sort">
                                Ordenar
                            </v-btn>
                        </template>
                        <v-list>
                            <v-list-item @click="filters.sort = 'price-asc'" title="Menor Preço" />
                            <v-list-item @click="filters.sort = 'price-desc'" title="Maior Preço" />
                            <v-list-item @click="filters.sort = 'name-asc'" title="A - Z" />
                        </v-list>
                    </v-menu>
                </div>
            </v-card>
        </v-container>

        <v-container class="pb-16">
            <v-row v-if="loading">
                <v-col v-for="n in 8" :key="n" cols="12" sm="6" lg="3">
                    <v-skeleton-loader type="card, heading, subtitle" class="rounded-xl border"></v-skeleton-loader>
                </v-col>
            </v-row>

            <v-row v-else-if="filteredProducts.length">
                <v-col v-for="product in filteredProducts" :key="product.id" cols="12" sm="6" lg="3" xl="2">
                    <ProductCard :product="product" :store-slug="storeSlug" />
                </v-col>
            </v-row>

            <v-fade-transition v-else>
                <div class="py-16">
                    <EmptyState title="Nenhum item por aqui"
                        description="Tente mudar os filtros ou o termo de busca para encontrar o que deseja."
                        icon="mdi-package-variant-closed" />
                </div>
            </v-fade-transition>
        </v-container>
    </div>
</template>

<style scoped>
.banner-overlay {
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.3) 50%, transparent 100%);
}

.no-scrollbar::-webkit-scrollbar {
    display: none;
}

.no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

.z-10 {
    position: relative;
    z-index: 10;
}

.min-h-screen {
    min-height: 100vh;
}
</style>