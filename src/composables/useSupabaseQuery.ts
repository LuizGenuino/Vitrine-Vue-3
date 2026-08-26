import {
    ref,
    watch,
    type WatchSource,
} from 'vue'

interface UseSupabaseQueryOptions {
    immediate?: boolean
    watchSource?: WatchSource | WatchSource[]
}

export function useSupabaseQuery<T>(
    fetcher: () => Promise<T>,
    options: UseSupabaseQueryOptions = {},
) {
    const data = ref<T | null>(null)
    const loading = ref(false)
    const error = ref<Error | null>(null)

    async function execute(): Promise<T | null> {
        loading.value = true
        error.value = null

        try {
            const result = await fetcher()

            data.value = result

            return result
        } catch (e) {
            error.value = e as Error

            console.error('[useSupabaseQuery]', e)

            return null
        } finally {
            loading.value = false
        }
    }

    if (options.immediate !== false) {
        void execute()
    }

    if (options.watchSource) {
        watch(
            options.watchSource,
            () => {
                void execute()
            },
        )
    }

    return {
        data,
        loading,
        error,
        refresh: execute,
    }
}