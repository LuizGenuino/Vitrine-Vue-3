import { ref, watch, type Ref } from 'vue'

export function useSupabaseQuery<T>(
    fetcher: () => Promise<T>,
    options: { immediate?: boolean; watchSource?: Ref<any>[] } = {}
) {
    const data = ref<T | null>(null)
    const loading = ref(false)
    const error = ref<Error | null>(null)

    async function execute() {
        loading.value = true
        error.value = null
        try {
            data.value = await fetcher() as any
        } catch (e) {
            error.value = e as Error
            console.error('[useSupabaseQuery]', e)
        } finally {
            loading.value = false
        }
    }

    if (options.immediate !== false) execute()
    if (options.watchSource) {
        watch(options.watchSource, () => execute(), { deep: true })
    }

    return { data, loading, error, refresh: execute }
}