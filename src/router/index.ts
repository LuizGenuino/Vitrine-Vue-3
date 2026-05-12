import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            component: () => import('@/layouts/HomeLayout.vue'),
            children: [
                { path: '', name: 'landing', component: () => import('@/pages/public/LandingPage.vue') },
            ],
        },
        {
            path: '/s/:storeSlug',
            component: () => import('@/layouts/StoreLayout.vue'),
            children: [
                { path: '', name: 'storefront', component: () => import('@/pages/public/StorefrontPage.vue') },
                {
                    path: '/:storeSlug/produto/:productSlug',
                    name: 'product',
                    component: () => import('@/pages/public/ProductPage.vue'),
                },
                { path: '/:storeSlug/carrinho', name: 'cart', component: () => import('@/pages/public/CartPage.vue') },
            ],
        },
        {
            path: '/auth',
            component: () => import('@/layouts/AuthLayout.vue'),
            children: [
                { path: 'login', name: 'login', component: () => import('@/pages/auth/LoginPage.vue') },
                { path: 'cadastro', name: 'register', component: () => import('@/pages/auth/RegisterPage.vue') },
            ],
        },
        {
            path: '/dashboard',
            component: () => import('@/layouts/DashboardLayout.vue'),
            meta: { requiresAuth: true },
            children: [
                { path: '', name: 'dashboard-overview', component: () => import('@/pages/dashboard/DashboardOverviewPage.vue') },
                {
                    path: 'configuracoes',
                    name: 'dashboard-settings',
                    component: () => import('@/pages/dashboard/DashboardSettingsPage.vue'),
                },
                {
                    path: 'categorias',
                    name: 'dashboard-categories',
                    component: () => import('@/pages/dashboard/CategoriesPage.vue'),
                },
                {
                    path: 'produtos',
                    name: 'dashboard-products',
                    component: () => import('@/pages/dashboard/ProductsPage.vue'),
                },
                {
                    path: 'planos',
                    name: 'dashboard-plans',
                    component: () => import('@/pages/dashboard/SubscriptionPlansPage.vue'),
                },
            ],
        },
    ],
});

router.beforeEach(async (to) => {
    const authStore = useAuthStore();
    authStore.init();

    if (authStore.loading) {
        await new Promise<void>((resolve) => {
            const stop = setInterval(() => {
                if (!authStore.loading) {
                    clearInterval(stop);
                    resolve();
                }
            }, 50);
        });
    }

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        return { name: 'login' };
    }

    if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated) {
        return { name: 'dashboard-overview' };
    }

    return true;
});

export default router;
