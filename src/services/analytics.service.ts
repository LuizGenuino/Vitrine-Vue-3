import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import type { AnalyticsEvent } from '@/types/models'
import type { Enums } from '@/lib/supabase'

type EventType = Enums<'analytics_event_type'>

class AnalyticsService {
    private sessionId = crypto.randomUUID()

    /** Registra evento — chamada fire-and-forget */
    track(input: {
        eventType: EventType
        productId?: string
        customerId?: string
        metadata?: Record<string, any>
    }) {
        const storeId = useAuthStore().currentStoreId
        if (!storeId) return

        void supabase.from('analytics_events').insert({
            store_id: storeId,
            event_type: input.eventType,
            session_id: this.sessionId,
            product_id: input.productId,
            customer_id: input.customerId,
            metadata: input.metadata ?? {},
            user_agent: navigator.userAgent,
        })
    }

    async summary(days = 30) {
        const since = new Date(Date.now() - days * 864e5).toISOString()
        const { data } = await supabase
            .from('analytics_events')
            .select('event_type, created_at')
            .gte('created_at', since)

        const counters: Record<string, number> = {}
        for (const ev of data ?? []) {
            counters[ev.event_type] = (counters[ev.event_type] ?? 0) + 1
        }
        return counters
    }

    async topProducts(limit = 10) {
        const { data } = await supabase
            .from('analytics_events')
            .select('product_id, product:products(name)')
            .eq('event_type', 'VIEW_PRODUCT')
            .not('product_id', 'is', null).limit(1000)

        const counts: Record<string, { name: string; views: number }> = {}
        for (const ev of data ?? []) {
            const id = ev.product_id as string
            const name = (ev.product as any)?.name ?? '—'
            counts[id] = counts[id] ?? { name, views: 0 }
            counts[id].views++
        }
        return Object.entries(counts)
            .sort((a, b) => b[1].views - a[1].views)
            .slice(0, limit)
    }
}

export const analyticsService = new AnalyticsService()