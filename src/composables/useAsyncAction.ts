import { ref } from 'vue'
import { useNotifications } from '@/stores/notifications.store'
import { humanizeSupabaseError } from '@/lib/errors'

export function useAsyncAction<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: { successMsg?: string } = {}
) {
  const loading = ref(false)
  const notify  = useNotifications()

  async function execute(...args: TArgs) {
    loading.value = true
    try {
      const result = await fn(...args)
      if (options.successMsg) notify.success(options.successMsg)
      return result
    } catch (e) {
      notify.error(humanizeSupabaseError(e))
      throw e
    } finally {
      loading.value = false
    }
  }

  return { execute, loading }
}