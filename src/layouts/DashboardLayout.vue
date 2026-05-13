<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useStorefrontStore } from '@/stores/storefront';
import { planService } from '@/services/planService';
import ThemeToggle from '@/components/base/ThemeToggle.vue';

const drawer = ref(true);
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const useStore = useStorefrontStore();

authStore.init();

const items = [
    { title: 'Visão geral', to: { name: 'dashboard-overview' } },
    { title: 'Configurações', to: { name: 'dashboard-settings' } },
    { title: 'Categorias', to: { name: 'dashboard-categories' } },
    { title: 'Produtos', to: { name: 'dashboard-products' } },
    { title: 'Planos', to: { name: 'dashboard-plans' } },
];

const currentTitle = computed(() => items.find((item) => item.to.name === route.name)?.title || 'Dashboard');
const publicUrl = computed(() =>
    useStore.settings.slug ? `${window.location.origin}/s/${useStore.settings.slug}` : '',
);
const activePlan = computed(() => planService.getById(useStore.settings.activePlanId));

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
    <v-layout class="bg-background">
        <v-navigation-drawer v-model="drawer" width="280" class="pa-3">
            <v-card class="brand-gradient pa-5 text-white mb-4" rounded="xl">
                <div class="text-overline mb-2">Workspace</div>
                <div class="text-h6 font-weight-bold">Vitrine SaaS V3</div>
                <div class="text-body-2 mt-2" style="opacity: 0.86">
                    SaaS com catálogo, vitrine pública e base pronta para monetização por assinatura.
                </div>
            </v-card>

            <v-card class="glass-panel pa-4 mb-4" rounded="xl">
                <div class="text-caption text-medium-emphasis mb-1">Plano atual</div>
                <div class="d-flex align-center justify-space-between ga-3">
                    <div>
                        <div class="font-weight-bold">{{ activePlan.name }}</div>
                        <div class="text-body-2 text-medium-emphasis">Até {{
                            planService.getLimitLabel(activePlan.productLimit) }} produtos</div>
                    </div>
                    <v-chip color="primary" variant="tonal">{{ activePlan.priceLabel }}</v-chip>
                </div>
            </v-card>

            <v-list nav>
                <v-list-item v-for="item in items" :key="item.title" :to="item.to" rounded="lg">
                    <v-list-item-title>{{ item.title }}</v-list-item-title>
                </v-list-item>
            </v-list>

            <template #append>
                <div class="pa-3 d-flex flex-column ga-3">
                    <v-btn v-if="publicUrl" block variant="outlined" :href="publicUrl" target="_blank">Ver
                        vitrine</v-btn>
                    <v-btn block color="primary" variant="flat" @click="handleLogout">Sair</v-btn>
                </div>
            </template>
        </v-navigation-drawer>

        <v-main>
            <div class="page-shell">
                <div class="d-flex flex-column flex-md-row align-start align-md-center justify-space-between ga-4 mb-6">
                    <div>
                        <div class="text-overline text-medium-emphasis">Painel</div>
                        <div class="text-h5 font-weight-bold">{{ currentTitle }}</div>
                    </div>
                    <div class="d-flex align-center ga-3 flex-wrap justify-end">
                        <v-chip color="primary" variant="tonal">Plano {{ activePlan.name }}</v-chip>
                        <div class="text-body-2 text-medium-emphasis">{{ authStore.user?.email }}</div>
                        <ThemeToggle />
                    </div>
                </div>
                <router-view />
            </div>
        </v-main>
    </v-layout>
</template>
