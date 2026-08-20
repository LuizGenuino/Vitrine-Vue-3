// @ts-nocheck
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { requireAuth } from './guards';

const router = createRouter({
    history: createWebHistory(),
    routes: [

        {
            path: '/invite/:id',
            name: 'invite',
            component: () => import('@/pages/public/InvitePage.vue'),
            meta: { public: true }, // não passa pelo requireAuth
        },
        {
            path: '/',
            component: () => import('@/layouts/HomeLayout.vue'),
            children: [
                { path: '', name: 'landing', component: () => import('@/pages/public/LandingPage.vue') },
            ],
        },
        // src/router/index.ts
        {
            path: '/s/:storeSlug',
            component: () => import('@/layouts/StoreLayout.vue'),
            meta: { public: true }, // 🔥 Toda a árvore pública
            children: [
                {
                    path: '',                        // → /s/:storeSlug
                    name: 'storefront',
                    component: () => import('@/pages/public/StorefrontPage.vue'),
                },
                {
                    path: 'produto/:productSlug',    // → /s/:storeSlug/produto/:productSlug
                    name: 'storefront-product',
                    component: () => import('@/pages/public/ProductPage.vue'),
                },
                // {
                //     path: 'categoria/:categorySlug', // → /s/:storeSlug/categoria/:categorySlug
                //     name: 'storefront-category',
                //     component: () => import('@/pages/public/CategoryPage.vue'),
                // },
                {
                    path: 'carrinho',                // → /s/:storeSlug/carrinho
                    name: 'storefront-cart',
                    component: () => import('@/pages/public/CartPage.vue'),
                },
                {
                    path: 'checkout',                // → /s/:storeSlug/checkout
                    name: 'storefront-checkout',
                    component: () => import('@/pages/public/CheckoutPage.vue'),
                },
                {
                    path: 'pedido/:orderNumber',     // → /s/:storeSlug/pedido/:orderNumber
                    name: 'storefront-order-status',
                    component: () => import('@/pages/public/OrderStatusPage.vue'),
                },
                {
                    path: 'busca',                   // → /s/:storeSlug/busca?q=...
                    name: 'storefront-search',
                    component: () => import('@/pages/public/SearchPage.vue'),
                },
                {
                    path: ':pathMatch(.*)*',         // 404 dentro da vitrine
                    name: 'storefront-not-found',
                    component: () => import('@/pages/public/StorefrontNotFound.vue'),
                },
            ],
        },

        {
            path: '/auth',
            component: () => import('@/layouts/AuthLayout.vue'),
            children: [
                { path: '/login', name: 'login', component: () => import('@/pages/auth/LoginPage.vue') },
                { path: '/cadastro', name: 'register', component: () => import('@/pages/auth/RegisterPage.vue') },
                { path: '/forgot-password', name: 'forgot-password', component: () => import('@/pages/auth/ForgotPassword.vue') },
                { path: '/reset-password', name: 'reset-password', component: () => import('@/pages/auth/ResetPassword.vue') },
            ],
        },
        {
            path: '/dashboard',
            component: () => import('@/layouts/DashboardLayout.vue'),
            beforeEnter: requireAuth,
            meta: { requiresAuth: true },
            children: [
                { path: '', name: 'overview', component: () => import('@/pages/dashboard/OverviewPage.vue') },
                {
                    path: 'produtos',
                    name: 'products',
                    component: () => import('@/pages/dashboard/ProductsPage.vue'),
                },
                {
                    path: 'categorias',
                    name: 'categories',
                    component: () => import('@/pages/dashboard/CategoriesPage.vue'),
                },
                {
                    path: 'estoque',
                    name: 'inventory',
                    component: () => import('@/pages/dashboard/InventoryPage.vue')
                },
                {
                    path: 'pedidos',
                    name: 'orders',
                    component: () => import('@/pages/dashboard/OrdersPage.vue')
                },
                {
                    path: 'clientes',
                    name: 'customers',
                    component: () => import('@/pages/dashboard/CustomersPage.vue')
                },
                {
                    path: 'graficos',
                    name: 'analytics',
                    component: () => import('@/pages/dashboard/AnalyticsPage.vue')
                },
                {
                    path: 'configuracoes',
                    name: 'settings',
                    component: () => import('@/pages/dashboard/SettingsPage.vue'),
                },
                {
                    path: 'cupons',
                    name: 'coupons',
                    component: () => import('@/pages/dashboard/CouponsPage.vue'),
                },
                {
                    path: 'equipe',
                    name: 'team',
                    component: () => import('@/pages/dashboard/TeamPage.vue'),
                },
                {
                    path: 'planos',
                    name: 'plans',
                    component: () => import('@/pages/dashboard/SubscriptionPlansPage.vue'),
                },
                {
                    path: '/onboarding',
                    name: 'onboarding',
                    component: () => import('@/pages/dashboard/OnboardingPage.vue'),
                    meta: { requiresAuth: true, hideLayout: true },
                },
                //sudo area
                // {
                //     path: 'admin',
                //     beforeEnter: requireRole(['OWNER', 'ADMIN']),
                //     children: [
                //         {
                //             path: 'usuarios',
                //             name: 'users',
                //             beforeEnter: requireRole(['OWNER', 'ADMIN']),
                //             component: () => import('@/pages/dashboard/UsersPage.vue'),
                //         },
                //         {
                //             path: 'clientes',
                //             name: 'customers',
                //             beforeEnter: requireRole(['OWNER', 'ADMIN']),
                //             component: () => import('@/pages/dashboard/CustomersPage.vue'),
                //         },
                //         {
                //             path: 'lojas',
                //             name: 'stores',
                //             beforeEnter: requireRole(['OWNER', 'ADMIN']),
                //             component: () => import('@/pages/dashboard/StoresPage.vue'),
                //         },
                //         {
                //             path: 'planos',
                //             name: 'plans',
                //             beforeEnter: requireRole(['OWNER', 'ADMIN']),
                //             component: () => import('@/pages/dashboard/SubscriptionPlansPage.vue'),
                //         },
                //         {
                //             path: 'configuracoes-gerais',
                //             name: 'general-settings',
                //             beforeEnter: requireRole(['OWNER', 'ADMIN']),
                //             component: () => import('@/pages/dashboard/GeneralSettingsPage.vue'),
                //         },
                //     ]
                // }

            ],
        },
    ],
});


router.beforeEach(requireAuth)

// router.beforeEach(async (to) => {
//     const authStore = useAuthStore();
//     authStore.init();

//     if (authStore.loading) {
//         await new Promise<void>((resolve) => {
//             const stop = setInterval(() => {
//                 if (!authStore.loading) {
//                     clearInterval(stop);
//                     resolve();
//                 }
//             }, 50);
//         });
//     }

//     if (to.meta.requiresAuth && !authStore.isAuthenticated) {
//         return { name: 'login' };
//     }

//     if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated) {
//         return { name: 'overview' };
//     }

//     return true;
// });

export default router;
