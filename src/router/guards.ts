import type { NavigationGuard } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

export const requireAuth: NavigationGuard = async (to) => {
    const auth = useAuthStore()
    if (auth.loading) await auth.init()

    if (!auth.isAuthenticated) {
        return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (!auth.currentStoreId && to.name !== 'onboarding') {
        return { name: 'onboarding' }
    }
}

export const requireRole = (roles: string[]): NavigationGuard => () => {
    const auth = useAuthStore()
    if (!auth.currentRole || !roles.includes(auth.currentRole)) {
        return { name: 'forbidden' }
    }
}