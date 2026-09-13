import { supabase } from '@/lib/supabase'
import { BaseService, ServiceError } from './base.service'
import type { Store, TeamMember } from '@/types/models'
import type { InsertDto, UpdateDto } from '@/lib/supabase'
import type { Constants, Database } from '@/types/database.types'

class StoresService extends BaseService<Store, InsertDto<'stores'>, UpdateDto<'stores'>> {
    protected table: keyof Database['public']['Tables'] = 'stores'

    /** Cria loja + assinatura trial + membership OWNER */
    async createWithOnboarding(payload: {
        name: string
        slug: string
        email: string
        phone?: string
        cnpj?: string
        planTier?: typeof Constants['public']['Enums']['plan_tier'][number]
    }) {
        const { data: user } = await supabase.auth.getUser()
        if (!user.user) throw new ServiceError('NO_AUTH', 'Usuário não autenticado')

        // 1. cria loja
        const { data: store, error: e1 } = await supabase
            .from('stores')
            .insert({
                name: payload.name,
                slug: payload.slug,
                email: payload.email,
                phone: payload.phone,
                cnpj: payload.cnpj,
            })
            .select().single()
        if (e1) throw ServiceError.from(e1)

        // 2. localiza plano (default FREE)
        const { data: plan } = await supabase
            .from('plans').select('id')
            .eq('tier', payload.planTier ?? 'FREE').single()

        // 3. cria assinatura trial 14 dias
        if (plan) {
            await supabase.from('subscriptions').insert({
                store_id: store.id,
                plan_id: plan.id,
                status: 'TRIALING',
                trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString(),
            })
        }

        // 4. cria membership OWNER
        await supabase.from('team_members').insert({
            profile_id: user.user.id,
            store_id: store.id,
            role: 'OWNER',
        })

        return store as Store
    }

    /** Convida um usuário existente para a loja atual */
    async inviteMember(profileId: string, role: TeamMember['role']) {
        const { data, error } = await supabase
            .from('team_members')
            .insert({
                profile_id: profileId,
                store_id: this.storeId(),
                role,
            })
            .select().single()
        if (error) throw ServiceError.from(error)
        return data
    }
}

export const storesService = new StoresService()