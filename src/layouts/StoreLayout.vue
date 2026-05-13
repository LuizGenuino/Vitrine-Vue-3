<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import ThemeToggle from '@/components/base/ThemeToggle.vue';
import CartDrawer from '@/components/public/CartDrawer.vue';
import { useCartStore } from '@/stores/cart';
import { useUiStore } from '@/stores/ui';
import { useStorefrontStore } from '@/stores/storefront';

const route = useRoute();
const cartStore = useCartStore();
const uiStore = useUiStore();
const useStore = useStorefrontStore();

const currentStoreSlug = computed(() => {
    const value = route.params.storeSlug;
    return typeof value === 'string' ? value : '';
});

const visibleCartCount = computed(() =>
    currentStoreSlug.value ? cartStore.countByStore(currentStoreSlug.value) : cartStore.count,
);
const storeName = computed(() => useStore.settings.storeName || 'Minha Loja');

onMounted(async () => {
    const value = route.params.storeSlug;
    await useStore.bootstrap({ slug: typeof value === 'string' ? value : value[0] });
});
</script>

<template>
    <div class="my-8"></div>
    <v-app-bar flat color="transparent" height="100" scroll-behavior="elevate" class="px-2 px-md-4">
        <v-container class="pa-0 fill-height d-flex align-center">
            <v-card class="store-navbar-card d-flex align-center justify-space-between w-100 px-4 py-2" rounded="pill"
                border>
                <router-link :to="{ name: 'storefront', params: { storeSlug: currentStoreSlug } }"
                    class="d-flex align-center ga-2 text-decoration-none">
                    <v-avatar color="primary" size="38" class="elevation-2">
                        <span class="text-white font-weight-bold text-uppercase">{{ storeName.charAt(0) }}</span>
                    </v-avatar>
                    <div class="store-info-text">
                        <div class="text-subtitle-1 font-weight-bold text-high-emphasis leading-tight">
                            {{ storeName }}
                        </div>
                        <div class="text-caption text-success d-flex align-center">
                            <v-icon icon="mdi-circle" size="8" class="mr-1"></v-icon>
                            Aberta agora
                        </div>
                    </div>
                </router-link>

                <div class="d-flex align-center ga-1 ga-sm-3">
                    <ThemeToggle />

                    <v-divider vertical inset class="mx-1 hidden-xs-only"></v-divider>

                    <v-btn color="primary" variant="flat" rounded="pill" class="px-4 px-md-6 cart-btn-glow"
                        @click="uiStore.openCartDrawer">
                        <v-badge :content="visibleCartCount" :model-value="visibleCartCount > 0" color="error"
                            offset-x="-2" offset-y="-2">
                            <v-icon icon="mdi-shopping-outline" class="mr-md-2"></v-icon>
                        </v-badge>
                        <span class="hidden-sm-and-down">Meu Carrinho</span>
                    </v-btn>
                </div>
            </v-card>
        </v-container>
    </v-app-bar>

    <v-main class="bg-background pt-4">
        <router-view />
        <CartDrawer :store-slug="currentStoreSlug" />
    </v-main>
</template>

<style scoped>
.store-navbar-card {
    background: rgba(var(--v-theme-surface), 0.85) !important;
    backdrop-filter: blur(15px) saturate(180%);
    -webkit-backdrop-filter: blur(15px) saturate(180%);
    transition: all 0.3s ease;
}

/* Estilo para o badge não deformar o botão */
:deep(.v-badge__wrapper) {
    margin-left: 0 !important;
}

.leading-tight {
    line-height: 1.1;
}

.store-info-text {
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Feedback visual sutil para o botão de carrinho se houver itens */
.cart-btn-glow {
    box-shadow: 0 4px 15px rgba(var(--v-theme-primary), 0.2);
}

@media (max-width: 600px) {
    .store-info-text {
        max-width: 120px;
    }
}
</style>