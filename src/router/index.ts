// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import { requireAuth } from './guards';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/invite/:id',
            name: 'invite',
            component: () => import('@/pages/public/InvitePage.vue'),
            meta: { public: true },
        },
        {
            path: '/',
            component: () => import('@/layouts/HomeLayout.vue'),
            meta: { public: true }, // Adicionado public para a landing page
            children: [
                { path: '', name: 'landing', component: () => import('@/pages/public/LandingPage.vue') },
            ],
        },
        {
            path: '/s/:storeSlug',
            component: () => import('@/layouts/StoreLayout.vue'),
            meta: { public: true },
            children: [
                {
                    path: '',
                    name: 'storefront',
                    component: () => import('@/pages/public/StorefrontPage.vue'),
                },
                {
                    path: 'produto/:productSlug',
                    name: 'storefront-product',
                    component: () => import('@/pages/public/ProductPage.vue'),
                },
                {
                    path: 'carrinho',
                    name: 'storefront-cart',
                    component: () => import('@/pages/public/CartPage.vue'),
                },
                {
                    path: 'checkout',
                    name: 'storefront-checkout',
                    component: () => import('@/pages/public/CheckoutPage.vue'),
                },
                {
                    path: 'pedido/:orderNumber',
                    name: 'storefront-order-status',
                    component: () => import('@/pages/public/OrderStatusPage.vue'),
                },
                {
                    path: 'busca',
                    name: 'storefront-search',
                    component: () => import('@/pages/public/SearchPage.vue'),
                },
                {
                    path: ':pathMatch(.*)*',
                    name: 'storefront-not-found',
                    component: () => import('@/pages/public/StorefrontNotFound.vue'),
                },
            ],
        },
        {
            path: '/auth',
            component: () => import('@/layouts/AuthLayout.vue'),
            meta: { public: true }, // Adicionado public para as telas de auth
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
            // REMOVIDO: beforeEnter: requireAuth (já é tratado globalmente abaixo)
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
                    path: 'perfil',
                    name: 'profile',
                    component: () => import('@/pages/dashboard/ProfilePage.vue'),
                },

            ],
        },
        {
            path: '/onboarding', // Corrigido de '/onboarding' para 'onboarding'
            name: 'onboarding',
            component: () => import('@/pages/dashboard/Onboarding/OnboardingPage.vue'),
            meta: { hideLayout: true },
        },
    ],
});

router.beforeEach(requireAuth);

export default router;