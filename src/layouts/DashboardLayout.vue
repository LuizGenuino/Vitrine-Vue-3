<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useStorefrontStore } from '@/stores/storefront';
import { planService } from '@/services/planService';
import ThemeToggle from '@/components/base/ThemeToggle.vue';

const drawer = ref(true);
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const useStore = useStorefrontStore();

authStore.init();

// Itens com ícones e agrupamento lógico
const menuItems = [
    { section: 'GERENCIAMENTO' },
    { title: 'Visão Geral', icon: 'mdi-view-dashboard-outline', to: { name: 'dashboard-overview' } },
    { title: 'Produtos', icon: 'mdi-package-variant-closed', to: { name: 'dashboard-products' } },
    { title: 'Categorias', icon: 'mdi-tag-outline', to: { name: 'dashboard-categories' } },
    { section: 'CONFIGURAÇÕES' },
    { title: 'Minha Loja', icon: 'mdi-store-cog-outline', to: { name: 'dashboard-settings' } },
    { title: 'Assinatura', icon: 'mdi-credit-card-outline', to: { name: 'dashboard-plans' } },
];

const currentTitle = computed(() => menuItems.find((item) => item.to?.name === route.name)?.title || 'Dashboard');

const publicUrl = computed(() =>
    useStore.settings.slug ? `${window.location.origin}/s/${useStore.settings.slug}` : '',
);

const activePlan = computed(() => planService.getById(useStore.settings.activePlanId));


const productsCount = computed(() => {
    return useStore.products.length;
})

const productUsagePercent = computed(() => {
    const limit = activePlan.value.productLimit || 1;
    return (productsCount.value / limit) * 100;
});


onMounted(async () => {
    if (!authStore.user?.uid) return;
    await useStore.bootstrap({ ownerId: authStore.user.uid });
});

async function handleLogout() {
    await authStore.logout();
    router.push({ name: 'login' });
}
</script>

<template>
    <v-layout class="bg-background dashboard-container">

        <v-app-bar flat border class="px-4">
            <v-app-bar-nav-icon @click="drawer = !drawer" class="hidden-lg-and-up"></v-app-bar-nav-icon>

            <v-toolbar-title class="font-weight-bold d-flex align-center">
                <v-icon icon="mdi-rocket-launch" color="primary" class="mr-2" size="small"></v-icon>
                <span class="text-subtitle-1 font-weight-black">{{ currentTitle }}</span>
            </v-toolbar-title>

            <v-spacer class="hidden-sm-and-down"></v-spacer>

            <div class="d-flex align-center ga-2">
                <v-btn v-if="publicUrl" prepend-icon="mdi-eye-outline" variant="tonal" color="primary" size="small"
                    rounded="pill" class="text-none hidden-sm-and-down" :href="publicUrl" target="_blank">
                    Ver Vitrine
                </v-btn>

                <v-divider vertical inset class="mx-2"></v-divider>
                <ThemeToggle />

                <v-menu location="bottom end">
                    <template v-slot:activator="{ props }">
                        <v-avatar v-bind="props" color="primary" size="32" class="cursor-pointer elevation-2">
                            <span class="text-caption text-white">{{ authStore.user?.email?.charAt(0).toUpperCase()
                            }}</span>
                        </v-avatar>
                    </template>
                    <v-list width="200" rounded="lg" class="mt-2">
                        <v-list-item :title="authStore.user?.email || ''" subtitle="Administrador"></v-list-item>
                        <v-divider class="my-2"></v-divider>
                        <v-list-item prepend-icon="mdi-logout" title="Sair" color="error"
                            @click="handleLogout"></v-list-item>
                    </v-list>
                </v-menu>
            </div>
        </v-app-bar>

        <v-navigation-drawer v-model="drawer" width="280" class="border-e">
            <div class="pa-5">
                <div class="d-flex align-center ga-3 mb-6">
                    <v-avatar color="primary" rounded="lg" size="40">
                        <v-icon icon="mdi-storefront" color="white"></v-icon>
                    </v-avatar>
                    <div>
                        <div class="text-subtitle-2 font-weight-black leading-tight">
                            {{ useStore.settings.storeName || 'Minha Loja' }}
                        </div>
                        <div class="text-caption text-medium-emphasis">Painel de Controle</div>
                    </div>
                </div>

                <v-card variant="tonal" color="primary" rounded="xl" class="pa-4 border-0">
                    <div class="d-flex justify-space-between align-center mb-2">
                        <span class="text-caption font-weight-bold uppercase">PLANO {{ activePlan.name.toUpperCase()
                            }}</span>
                        <v-icon icon="mdi-shield-check" size="16"></v-icon>
                    </div>
                    <v-progress-linear :model-value="productUsagePercent" height="6" rounded
                        class="mb-2"></v-progress-linear>
                    <div class="text-caption d-flex justify-space-between opacity-80">
                        <span>{{ productsCount }} de {{ planService.getLimitLabel(activePlan.productLimit) }}</span>
                        <span>{{ Math.round(productUsagePercent) }}%</span>
                    </div>
                </v-card>
            </div>

            <v-list nav class="px-4">
                <template v-for="(item, i) in menuItems" :key="i">
                    <div v-if="item.section" class="text-overline text-medium-emphasis mt-4 mb-2 ml-4">
                        {{ item.section }}
                    </div>
                    <v-list-item v-else :to="item.to" :prepend-icon="item.icon" :title="item.title" rounded="xl"
                        color="primary" class="mb-1"></v-list-item>
                </template>
            </v-list>

            <template #append>
                <div class="pa-4">
                    <v-card variant="outlined" rounded="xl" class="pa-4 border-dashed">
                        <div class="text-caption font-weight-bold mb-1">Ajuda & Suporte</div>
                        <v-btn block size="small" variant="text" prepend-icon="mdi-whatsapp"
                            class="text-none justify-start">
                            Falar com suporte
                        </v-btn>
                    </v-card>
                </div>
            </template>
        </v-navigation-drawer>

        <v-main class="bg-grey-lighten-4 main-content">
            <div class="scrollable-area">
                <div class="pa-8 max-width-container">
                    <v-fade-transition mode="out-in">
                        <router-view />
                    </v-fade-transition>
                </div>
            </div>
        </v-main>
    </v-layout>
</template>

<style scoped>
/* 1. Trava o layout na altura da tela */
.dashboard-container {
    height: 100dvh !important;
    overflow: hidden;
    /* Impede que o layout inteiro role */
}

/* 2. Faz o v-main preencher a altura e gerenciar o scroll */
.main-content {
    height: 100%;
}

.scrollable-area {
    height: 100%;
    overflow-y: auto;
    /* Apenas o conteúdo rola */
    scroll-behavior: smooth;
}

/* 3. Estética Senior: Container de largura máxima para telas grandes */
.max-width-container {
    max-width: 1600px;
    margin: 0 auto;
}

.leading-tight {
    line-height: 1.2 !important;
}

/* Scrollbar refinada para o conteúdo principal */
.scrollable-area::-webkit-scrollbar {
    width: 6px;
}

.scrollable-area::-webkit-scrollbar-thumb {
    background: rgba(var(--v-theme-primary), 0.1);
    border-radius: 10px;
}

.scrollable-area::-webkit-scrollbar-track {
    background: transparent;
}

/* Border dashed personalizada */
.border-dashed {
    border-style: dashed !important;
    border-width: 1px !important;
    border-color: rgba(var(--v-border-color), 0.3) !important;
}
</style>