import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Variáveis VITE_SUPABASE_* não configuradas')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: 'vibestore-auth',
        flowType: 'pkce',
    },
    db: { schema: 'public' },
    global: {
        headers: { 'x-application-name': 'vibestore-web' },
    },
    realtime: {
        params: { eventsPerSecond: 10 },
    },
})

// Helpers de tipagem — reutilizáveis em toda a aplicação
export type Tables<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Row']

export type InsertDto<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Insert']

export type UpdateDto<T extends keyof Database['public']['Tables']> =
    Database['public']['Tables'][T]['Update']

export type Enums<T extends keyof Database['public']['Enums']> =
    Database['public']['Enums'][T]