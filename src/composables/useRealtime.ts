import { onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type Handler<T extends Record<string, any>> = (p: RealtimePostgresChangesPayload<T>) => void

export function useRealtime<T extends Record<string, any>>(input: {
    table: string
    event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
    onChange: Handler<T>
    scopedToStore?: boolean
}) {
    let channel: ReturnType<typeof supabase.channel> | null = null

    onMounted(() => {
        const storeId = useAuthStore().currentStoreId
        const filter = input.scopedToStore && storeId ? `store_id=eq.${storeId}` : undefined

        channel = supabase
            .channel(`rt-${input.table}-${crypto.randomUUID()}`)
            .on(
                'postgres_changes' as any,
                { event: input.event ?? '*', schema: 'public', table: input.table, filter },
                (payload) => input.onChange(payload as any)
            )
            .subscribe()
    })

    onBeforeUnmount(() => {
        if (channel) supabase.removeChannel(channel)
    })
}