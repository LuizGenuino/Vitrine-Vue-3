import { toast } from '@/utils/swal/toast'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Notification {
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    timeout?: number
}

export const useNotifications = defineStore('notifications', () => {
    function push(n: Omit<Notification, 'id'>) {
        toast(n.message, n.type)
    }

    const success = (m: string) => push({ type: 'success', message: m })
    const error = (m: string) => push({ type: 'error', message: m })
    const warning = (m: string) => push({ type: 'warning', message: m })
    const info = (m: string) => push({ type: 'info', message: m })

    return {success, error, warning, info }
})