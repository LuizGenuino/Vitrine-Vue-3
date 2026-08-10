<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { supabase } from '@/lib/supabase'

import ThemeToggle from '@/components/base/ThemeToggle.vue'

import type { UserRole } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const notify = useNotifications()
const display = useDisplay()

const {
    user, profile, stores, currentStore, currentStoreId, currentRole,
} = storeToRefs(auth)

/* -------------------------------------------------------------------------- */
/*  Drawer — responsivo + persistente                                         */
/* -------------------------------------------------------------------------- */

const DRAWER_KEY = 'vibestore-drawer-open'

const drawer = ref(
    display.lgAndUp.value
        ? localStorage.getItem(DRAWER_KEY) !== 'false'
        : false,
)

watch(drawer, (v) => {
    if (display.lgAndUp.value) localStorage.setItem(DRAWER_KEY, String(v))
})

// Fecha drawer automaticamente após navegar (em mobile)
watch(() => route.fullPath, () => {
    if (display.mdAndDown.value) drawer.value = false
})

/* -------------------------------------------------------------------------- */
/*  Menu — com controle de permissão por role                                 */
/* -------------------------------------------------------------------------- */

interface MenuItem {
    title: string
    icon: string
    to: { name: string }
    badge?: number | string
    roles?: UserRole[]      // se omitido, todos veem
}
interface MenuSection {
    section: string
    items: MenuItem[]
}

const menuSections = computed<MenuSection[]>(() => [
    {
        section: 'GERENCIAMENTO',
        items: [
            { title: 'Visão geral', icon: 'mdi-view-dashboard-outline', to: { name: 'overview' } },
            { title: 'Produtos', icon: 'mdi-package-variant-closed', to: { name: 'products' } },
            { title: 'Categorias', icon: 'mdi-tag-outline', to: { name: 'categories' } },
            { title: 'Estoque', icon: 'mdi-warehouse', to: { name: 'inventory' } },
        ],
    },
    {
        section: 'VENDAS',
        items: [
            { title: 'Pedidos', icon: 'mdi-cart-outline', to: { name: 'orders' } },
            { title: 'Clientes', icon: 'mdi-account-group-outline', to: { name: 'customers' } },
            // { title: 'Cupons', icon: 'mdi-ticket-percent-outline', to: { name: 'coupons' } },
        ],
    },
    {
        section: 'INTELIGÊNCIA',
        items: [
            {
                title: 'Graficos', icon: 'mdi-chart-line', to: { name: 'analytics' },
                roles: ['OWNER', 'ADMIN', 'MANAGER']
            },
        ],
    },
    {
        section: 'CONFIGURAÇÕES',
        items: [
            {
                title: 'Minha loja', icon: 'mdi-store-cog-outline', to: { name: 'settings' },
                roles: ['OWNER', 'ADMIN']
            },
            // {
            //     title: 'Equipe', icon: 'mdi-account-multiple-outline', to: { name: 'team' },
            //     roles: ['OWNER', 'ADMIN']
            // },
            {
                title: 'Integrações', icon: 'mdi-connection', to: { name: 'integrations' },
                roles: ['OWNER', 'ADMIN']
            },
            {
                title: 'Assinatura', icon: 'mdi-credit-card-outline', to: { name: 'plans' },
                roles: ['OWNER']
            },
        ],
    },
])

const visibleSections = computed(() =>
    menuSections.value
        .map(sec => ({
            ...sec,
            items: sec.items.filter(i => !i.roles || (currentRole.value && i.roles.includes(currentRole.value))),
        }))
        .filter(sec => sec.items.length > 0),
)

const currentTitle = computed(() => {
    for (const sec of menuSections.value) {
        const found = sec.items.find(i => i.to.name === route.name)
        if (found) return found.title
    }
    return 'Dashboard'
})

/* -------------------------------------------------------------------------- */
/*  Assinatura + uso do plano (via Supabase)                                  */
/* -------------------------------------------------------------------------- */

interface SubscriptionInfo {
    plan_name: string
    plan_tier: string
    max_products: number
    max_users: number
    status: string
    trial_ends_at: string | null
}

const subscriptionQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return null
    const { data } = await supabase
        .from('subscriptions')
        .select('status, trial_ends_at, plan:plans(name, tier, max_products, max_users)')
        .eq('store_id', currentStoreId.value)
        .maybeSingle()
    if (!data?.plan) return null
    const plan = data.plan as any
    return {
        plan_name: plan.name,
        plan_tier: plan.tier,
        max_products: plan.max_products,
        max_users: plan.max_users,
        status: data.status,
        trial_ends_at: data.trial_ends_at,
    } as SubscriptionInfo
}, { watchSource: [currentStoreId] })

const productsCountQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return 0
    const { count } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
    return count ?? 0
}, { watchSource: [currentStoreId] })

const subscription = computed(() => subscriptionQuery.data.value)
const productsCount = computed(() => productsCountQuery.data.value ?? 0)
const productLimit = computed(() => subscription.value?.max_products ?? 50)
const productUsagePct = computed(() => Math.min(100, (productsCount.value / productLimit.value) * 100))

const usageColor = computed(() => {
    const p = productUsagePct.value
    if (p >= 90) return 'error'
    if (p >= 75) return 'warning'
    return 'primary'
})

// Trial expiring warning
const trialDaysLeft = computed(() => {
    if (subscription.value?.status !== 'TRIALING' || !subscription.value.trial_ends_at) return null
    const diff = new Date(subscription.value.trial_ends_at).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / 86_400_000))
})

/* -------------------------------------------------------------------------- */
/*  URL pública                                                               */
/* -------------------------------------------------------------------------- */

const publicUrl = computed(() =>
    currentStore.value?.slug
        ? `${window.location.origin}/s/${currentStore.value.slug}`
        : '',
)

/* -------------------------------------------------------------------------- */
/*  Perfil / avatar                                                           */
/* -------------------------------------------------------------------------- */

const initials = computed(() => {
    const name = profile.value?.full_name ?? user.value?.email ?? '?'
    return name
        .split(' ')
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
})

const roleLabel: Record<string, string> = {
    OWNER: 'Proprietário(a)',
    ADMIN: 'Administrador(a)',
    MANAGER: 'Gerente',
    SELLER: 'Vendedor(a)',
    EDITOR: 'Editor(a)',
}

/* -------------------------------------------------------------------------- */
/*  Trocar de loja                                                            */
/* -------------------------------------------------------------------------- */

function switchStore(storeId: string) {
    if (storeId === currentStoreId.value) return
    auth.switchStore(storeId)
    notify.success('Loja alterada com sucesso')
    // força reload das queries dependentes ao voltar ao dashboard
    router.push({ name: 'overview' })
}

/* -------------------------------------------------------------------------- */
/*  Ações                                                                     */
/* -------------------------------------------------------------------------- */

async function copyPublicUrl() {
    try {
        await navigator.clipboard.writeText(publicUrl.value)
        notify.success('Link copiado!')
    } catch {
        notify.error('Não foi possível copiar')
    }
}

async function handleLogout() {
    await auth.signOut()
    await router.push({ name: 'login' })
}
</script>

<template>
    <v-layout class="dashboard-container">

        <!-- ================================================================== -->
        <!--  APP BAR                                                            -->
        <!-- ================================================================== -->
        <v-app-bar flat border class="px-4" height="64">
            <v-app-bar-nav-icon @click="drawer = !drawer" />

            <v-toolbar-title class="font-weight-bold d-flex align-center">
                <span class="text-subtitle-1 font-weight-black">{{ currentTitle }}</span>
            </v-toolbar-title>

            <v-spacer />

            <div class="d-flex align-center ga-2">
                <!--  Ver vitrine  -->
                <v-btn v-if="publicUrl" prepend-icon="mdi-eye-outline" variant="tonal" color="primary" size="small"
                    rounded="pill" class="text-none hidden-sm-and-down" :href="publicUrl" target="_blank">
                    Ver vitrine
                </v-btn>

                <!--  Copiar link (mobile: só ícone)  -->
                <v-btn v-if="publicUrl" icon="mdi-content-copy" variant="text" size="small" class="hidden-md-and-up"
                    @click="copyPublicUrl" />

                <v-divider vertical inset class="mx-2 hidden-sm-and-down" />

                <!--  Theme toggle  -->
                <ThemeToggle />

                <!--  Menu do usuário  -->
                <v-menu location="bottom end" :close-on-content-click="false">
                    <template #activator="{ props: menuProps }">
                        <v-btn v-bind="menuProps" icon size="small" class="ml-1">
                            <v-avatar :image="profile?.avatar_url ?? undefined" color="primary" size="36">
                                <span v-if="!profile?.avatar_url" class="text-caption text-white font-weight-bold">
                                    {{ initials }}
                                </span>
                            </v-avatar>
                        </v-btn>
                    </template>

                    <v-card width="280" rounded="lg" class="mt-2">
                        <!--  Cabeçalho  -->
                        <div class="pa-4 d-flex align-center ga-3">
                            <v-avatar :image="profile?.avatar_url ?? undefined" color="primary" size="44">
                                <span v-if="!profile?.avatar_url" class="text-white font-weight-bold">
                                    {{ initials }}
                                </span>
                            </v-avatar>
                            <div class="min-width-0">
                                <div class="text-body-2 font-weight-bold text-truncate">
                                    {{ profile?.full_name ?? 'Usuário' }}
                                </div>
                                <div class="text-caption text-medium-emphasis text-truncate">
                                    {{ user?.email }}
                                </div>
                                <v-chip v-if="currentRole" size="x-small" color="primary" variant="tonal" class="mt-1">
                                    {{ roleLabel[currentRole] ?? currentRole }}
                                </v-chip>
                            </div>
                        </div>

                        <v-divider />

                        <!--  Troca de loja  -->
                        <div v-if="stores.length > 1" class="pa-2">
                            <div class="text-overline text-medium-emphasis px-2 pb-1">
                                Trocar loja
                            </div>
                            <v-list density="compact" class="pa-0" bg-color="transparent">
                                <v-list-item v-for="s in stores" :key="s.store_id"
                                    :active="s.store_id === currentStoreId" color="primary" rounded="lg"
                                    @click="switchStore(s.store_id)">
                                    <template #prepend>
                                        <v-avatar :image="s.store.logo_url ?? undefined" size="28"
                                            color="grey-lighten-3">
                                            <v-icon size="16">mdi-storefront</v-icon>
                                        </v-avatar>
                                    </template>
                                    <v-list-item-title class="text-body-2">
                                        {{ s.store.name }}
                                    </v-list-item-title>
                                    <template v-if="s.store_id === currentStoreId" #append>
                                        <v-icon color="primary" size="18">mdi-check</v-icon>
                                    </template>
                                </v-list-item>
                            </v-list>
                            <v-divider class="my-1" />
                        </div>

                        <!--  Ações  -->
                        <v-list density="compact" class="pa-2" bg-color="transparent">
                            <v-list-item prepend-icon="mdi-account-circle-outline" title="Meu perfil" rounded="lg"
                                @click="router.push({ name: 'profile' })" />
                            <v-list-item prepend-icon="mdi-plus-circle-outline" title="Criar nova loja" rounded="lg"
                                @click="router.push({ name: 'onboarding' })" />
                            <v-divider class="my-1" />
                            <v-list-item prepend-icon="mdi-logout" title="Sair" base-color="error" rounded="lg"
                                @click="handleLogout" />
                        </v-list>
                    </v-card>
                </v-menu>
            </div>
        </v-app-bar>

        <!-- ================================================================== -->
        <!--  NAVIGATION DRAWER                                                  -->
        <!-- ================================================================== -->
        <v-navigation-drawer v-model="drawer" width="280" class="border-e" :rail="false">
            <!--  Cabeçalho da loja  -->
            <div class="pa-5">
                <div class="d-flex align-center ga-3 mb-5">
                    <v-avatar :image="currentStore?.logo_url ?? undefined" color="primary" rounded="lg" size="42">
                        <v-icon v-if="!currentStore?.logo_url" icon="mdi-storefront" color="white" />
                    </v-avatar>
                    <div class="min-width-0 flex-grow-1">
                        <div class="text-subtitle-2 font-weight-black text-truncate leading-tight">
                            {{ currentStore?.name ?? 'Minha loja' }}
                        </div>
                        <div class="text-caption text-medium-emphasis">
                            Painel de controle
                        </div>
                    </div>
                </div>

                <!--  Widget do plano  -->
                <v-card v-if="subscription" variant="tonal" :color="usageColor" rounded="xl" class="pa-4 border-0">
                    <div class="d-flex justify-space-between align-center mb-2">
                        <span class="text-caption font-weight-bold">
                            PLANO {{ subscription.plan_name.toUpperCase() }}
                        </span>
                        <v-icon :icon="subscription.status === 'TRIALING' ? 'mdi-clock-outline' : 'mdi-shield-check'"
                            size="16" />
                    </div>

                    <v-progress-linear :model-value="productUsagePct" :color="usageColor" bg-opacity="0.2" height="6"
                        rounded class="mb-2" />

                    <div class="text-caption d-flex justify-space-between opacity-80">
                        <span>{{ productsCount }} de {{ productLimit }} produtos</span>
                        <span>{{ Math.round(productUsagePct) }}%</span>
                    </div>

                    <!--  Aviso de trial expirando  -->
                    <v-alert v-if="trialDaysLeft !== null && trialDaysLeft <= 7" density="compact"
                        :type="trialDaysLeft <= 3 ? 'error' : 'warning'" variant="tonal" rounded="lg" class="mt-3 pa-2">
                        <div class="text-caption font-weight-bold">
                            {{ trialDaysLeft === 0
                                ? 'Seu teste termina hoje!'
                                : `Teste termina em ${trialDaysLeft} dia(s)` }}
                        </div>
                    </v-alert>
                </v-card>

                <v-skeleton-loader v-else type="card" />
            </div>

            <!--  Menu  -->
            <v-list nav class="px-4">
                <template v-for="(section, i) in visibleSections" :key="section.section">
                    <div class="text-overline text-medium-emphasis mb-2 ml-2" :class="{ 'mt-4': i > 0 }">
                        {{ section.section }}
                    </div>
                    <v-list-item v-for="item in section.items" :key="item.title" :to="item.to" :prepend-icon="item.icon"
                        rounded="xl" color="primary" class="mb-1">
                        <v-list-item-title>{{ item.title }}</v-list-item-title>
                        <template v-if="item.badge" #append>
                            <v-chip size="x-small" color="error" variant="flat">
                                {{ item.badge }}
                            </v-chip>
                        </template>
                    </v-list-item>
                </template>
            </v-list>

            <!--  Rodapé do drawer  -->
            <template #append>
                <div class="pa-4">
                    <v-card variant="outlined" rounded="xl" class="pa-4 border-dashed">
                        <div class="text-caption font-weight-bold mb-1">
                            Ajuda &amp; suporte
                        </div>
                        <div class="text-caption text-medium-emphasis mb-3">
                            Precisa de uma mão? Fale conosco.
                        </div>
                        <v-btn block size="small" variant="tonal" color="success" prepend-icon="mdi-whatsapp"
                            class="text-none" href="https://wa.me/5511999999999" target="_blank">
                            Falar com suporte
                        </v-btn>
                    </v-card>
                </div>
            </template>
        </v-navigation-drawer>

        <!-- ================================================================== -->
        <!--  MAIN CONTENT                                                       -->
        <!-- ================================================================== -->
        <v-main class="main-content">
            <div class="scrollable-area">
                <div class="pa-6 pa-md-8 max-width-container">
                    <router-view v-slot="{ Component }">
                        <v-fade-transition mode="out-in">
                            <component :is="Component" />
                        </v-fade-transition>
                    </router-view>
                </div>
            </div>
        </v-main>

    </v-layout>
</template>

<style scoped>
.dashboard-container {
    height: 100dvh !important;
    overflow: hidden;
}

.main-content {
    height: 100%;
    background-color: rgb(var(--v-theme-background));
}

.scrollable-area {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-behavior: smooth;
}

.max-width-container {
    max-width: 1600px;
    margin: 0 auto;
}

.leading-tight {
    line-height: 1.2 !important;
}

.min-width-0 {
    min-width: 0;
}

/* Scrollbar refinada */
.scrollable-area::-webkit-scrollbar {
    width: 8px;
}

.scrollable-area::-webkit-scrollbar-thumb {
    background: rgba(var(--v-theme-on-surface), 0.15);
    border-radius: 10px;
}

.scrollable-area::-webkit-scrollbar-thumb:hover {
    background: rgba(var(--v-theme-on-surface), 0.25);
}

.scrollable-area::-webkit-scrollbar-track {
    background: transparent;
}

/* Border dashed */
.border-dashed {
    border-style: dashed !important;
    border-width: 1px !important;
    border-color: rgba(var(--v-border-color), 0.35) !important;
}

/* Transições suaves nos itens de menu */
.v-list-item {
    transition: all 0.15s ease;
}
</style>



<!-- <script setup lang="ts">
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
    { title: 'Visão Geral', icon: 'mdi-view-dashboard-outline', to: { name: 'overview' } },
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
</style> -->