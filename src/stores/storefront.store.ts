// src/stores/storefront.store.ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Store, Category } from '@/types/models'

export const useStorefrontStore = defineStore('storefront', () => {
    const store = ref<Store | null>(null)
    const categories = ref<Category[]>([])
    const loading = ref(false)
    const notFound = ref(false)
    const currentSlug = ref<string | null>(null)

    /** Carrega a loja pelo slug — cachea resultado */
    async function loadBySlug(slug: string): Promise<Store | null> {
        // Já é a mesma loja carregada? Reaproveita
        if (currentSlug.value === slug && store.value) return store.value

        loading.value = true
        notFound.value = false
        currentSlug.value = slug

        try {
            const { data, error } = await supabase
                .from('stores')
                .select('*')
                .eq('slug', slug)
                .eq('is_active', true)
                .is('deleted_at', null)
                .maybeSingle()

            if (error) throw error
            if (!data) {
                notFound.value = true
                store.value = null
                return null
            }

            store.value = data 
            // Carrega categorias em paralelo
            const { data: cats } = await supabase
                .from('categories')
                .select('id, name, slug, parent_id, image_url, sort_order')
                .eq('store_id', data.id)
                .eq('is_active', true)
                .is('deleted_at', null)
                .order('sort_order')

            categories.value = (cats ?? []) as Category[]

            const currentStore = store.value || null
            return currentStore 
        } finally {
            loading.value = false
        }
    }

    /** Registra evento de analytics — fire-and-forget */
    function trackEvent(input: {
        eventType: 'VIEW_PRODUCT' | 'SEARCH' | 'ADD_TO_CART' | 'CHECKOUT' | 'PURCHASE' | 'OPEN_WHATSAPP'
        productId?: string
        metadata?: Record<string, any>
    }) {
        const currentStore = store.value
        if (!currentStore) return
        void supabase.from('analytics_events').insert({
            store_id: currentStore.id,
            event_type: input.eventType,
            product_id: input.productId,
            metadata: input.metadata ?? {},
            user_agent: navigator.userAgent,
            session_id: getOrCreateSessionId(),
        })
    }

    const themeColor = computed<string>(() =>
        (store.value as any)?.settings?.theme_color ?? '#6366f1',
    )

    return {
        store, categories, loading, notFound, currentSlug,
        themeColor,
        loadBySlug, trackEvent,
    }
})

/** Session ID persistido para agrupar eventos do mesmo visitante */
function getOrCreateSessionId(): string {
    const KEY = 'vibestore-session-id'
    let id = sessionStorage.getItem(KEY)
    if (!id) {
        id = crypto.randomUUID()
        sessionStorage.setItem(KEY, id)
    }
    return id
}
