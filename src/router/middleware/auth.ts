import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'

export function authMiddleware(
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
    next: NavigationGuardNext,
) {
    const isAuthenticated = !!localStorage.getItem('token')

    if (!isAuthenticated) {
        return next({ name: 'login' }) 
    }

    next() 
}