// supabase/functions/delete-account/index.ts
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

serve(async (req) => {
    // Valida JWT do usuário
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401 })

    const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const user = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
    )

    const { data: userData } = await user.auth.getUser()
    if (!userData?.user) return new Response('Unauthorized', { status: 401 })

    // Verifica que não é owner de nenhuma loja ativa
    const { data: ownerMemberships } = await admin
        .from('team_members')
        .select('id')
        .eq('profile_id', userData.user.id)
        .eq('role', 'OWNER')
        .eq('is_active', true)

    if (ownerMemberships?.length) {
        return new Response(
            JSON.stringify({ error: 'Transfira ou arquive suas lojas primeiro' }),
            { status: 409 },
        )
    }

    // Soft delete no profile + hard delete no auth
    await admin.from('profiles')
        .update({
            full_name: 'ANONIMIZADO',
            phone: null, avatar_url: null,
            preferences: {},
            deleted_at: new Date().toISOString(),
        })
        .eq('id', userData.user.id)

    await admin.auth.admin.deleteUser(userData.user.id)

    return new Response(JSON.stringify({ success: true }), { status: 200 })
})
