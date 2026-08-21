// src/router/guards.ts
import type { NavigationGuard } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

export const requireAuth: NavigationGuard = async (to) => {
    // 1. Libera rotas marcadas como públicas
    if (to.matched.some(record => record.meta.public)) {
        return true
    }

    const auth = useAuthStore()

    // Inicializa a auth se estiver carregando
    if (auth.loading) {
        await auth.init()
    }

    // 2. Não autenticado -> envia para o Login
    if (!auth.isAuthenticated) {
        if (to.name === 'login') return true
        return { name: 'login', query: { redirect: to.fullPath } }
    }

    // 3. Autenticado mas sem loja -> envia para Onboarding
    if (!auth.currentStoreId) {
        if (to.name === 'onboarding') return true
        return { name: 'onboarding' }
    }

    // 4. Se estiver tentando acessar o login estando logado, envia pro Overview
    if (to.name === 'login') {
        return { name: 'overview' }
    }

    if (to.name === 'onboarding') {
        return { name: 'overview' }
    }

    // 5. Permite que a navegação continue para a rota de destino (Dashboard, Produtos, etc.)
    return true
}

export const requireRole = (roles: string[]): NavigationGuard => () => {
    const auth = useAuthStore()
    if (!auth.currentRole || !roles.includes(auth.currentRole)) {
        return { name: 'forbidden' }
    }
    return true
}