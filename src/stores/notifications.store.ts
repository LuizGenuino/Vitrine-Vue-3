import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  timeout?: number
}

export const useNotifications = defineStore('notifications', () => {
  const items = ref<Notification[]>([])

  function push(n: Omit<Notification, 'id'>) {
    const id = crypto.randomUUID()
    items.value.push({ ...n, id })
    setTimeout(() => remove(id), n.timeout ?? 5000)
  }
  const  remove  = (id: string) => items.value = items.value.filter(i => i.id !== id)
  const  success = (m: string) => push({ type: 'success', message: m })
  const  error   = (m: string) => push({ type: 'error',   message: m })

  return { items, push, remove, success, error }
})