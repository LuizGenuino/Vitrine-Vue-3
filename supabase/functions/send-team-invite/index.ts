// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

import { buildInviteEmail } from './email-template.ts'
import { ResendProvider } from './providers/resend.ts'
import type { EmailProvider } from './providers/types.ts'

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface RequestBody {
    invite_id: string
    /** Se true, força reenvio mesmo que o convite já esteja próximo do envio anterior */
    resend?: boolean
}

interface ErrorResponse {
    error: string
    code: string
    details?: string
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const JSON_HEADERS = {
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
}

/** Rate limit: máximo 5 envios por convite em 10 minutos */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function jsonError(status: number, code: string, message: string, details?: string): Response {
    const body: ErrorResponse = { error: message, code }
    if (details) body.details = details
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function jsonOk(data: Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function requireEnv(name: string): string {
    const v = Deno.env.get(name)
    if (!v) throw new Error(`Env var ${name} não configurada`)
    return v
}

/* -------------------------------------------------------------------------- */
/*  Provider factory                                                          */
/* -------------------------------------------------------------------------- */

function createEmailProvider(): EmailProvider {
    const providerName = Deno.env.get('EMAIL_PROVIDER') ?? 'resend'

    switch (providerName) {
        case 'resend':
            return new ResendProvider({
                apiKey: requireEnv('RESEND_API_KEY'),
                fromAddress: requireEnv('EMAIL_FROM'),
                fromName: Deno.env.get('EMAIL_FROM_NAME') ?? 'VibeStore',
            })

        // case 'sendgrid':
        //   return new SendGridProvider({ ... })

        default:
            throw new Error(`Provider "${providerName}" não suportado`)
    }
}

/* -------------------------------------------------------------------------- */
/*  Rate limiting via tabela auxiliar                                         */
/*  (usa tabela `team_invite_sends` — criar migration se ainda não existir)   */
/* -------------------------------------------------------------------------- */

async function checkRateLimit(
    supabase: ReturnType<typeof createClient>,
    inviteId: string,
): Promise<{ allowed: boolean; recent: number }> {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()

    const { count } = await supabase
        .from('team_invite_sends')
        .select('id', { count: 'exact', head: true })
        .eq('invite_id', inviteId)
        .gte('sent_at', since)

    const recent = count ?? 0
    return { allowed: recent < RATE_LIMIT_MAX, recent }
}

async function recordSend(
    supabase: ReturnType<typeof createClient>,
    inviteId: string,
    status: 'sent' | 'failed',
    errorMsg?: string,
): Promise<void> {
    await supabase.from('team_invite_sends').insert({
        invite_id: inviteId,
        status,
        error: errorMsg ?? null,
    })
}

/* -------------------------------------------------------------------------- */
/*  Handler principal                                                         */
/* -------------------------------------------------------------------------- */

serve(async (req: Request) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (req.method !== 'POST') {
        return jsonError(405, 'METHOD_NOT_ALLOWED', 'Use POST')
    }

    /* ------------ 1. Autenticação do requisitante ------------ */
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return jsonError(401, 'MISSING_AUTH', 'Header Authorization obrigatório')
    }

    const supabaseUrl = requireEnv('SUPABASE_URL')
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

    // Cliente com service role para ignorar RLS internamente
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
    })

    // Cliente com JWT do usuário para validar identidade
    const supabaseUser = createClient(
        supabaseUrl,
        requireEnv('SUPABASE_ANON_KEY'),
        {
            auth: { persistSession: false },
            global: { headers: { Authorization: authHeader } },
        },
    )

    const { data: userData, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !userData?.user) {
        return jsonError(401, 'INVALID_AUTH', 'Token inválido ou expirado')
    }
    const requester = userData.user

    /* ------------ 2. Parse do body ------------ */
    let body: RequestBody
    try {
        body = await req.json()
    } catch {
        return jsonError(400, 'INVALID_BODY', 'JSON inválido')
    }

    if (!body.invite_id || typeof body.invite_id !== 'string') {
        return jsonError(400, 'MISSING_INVITE_ID', 'invite_id é obrigatório')
    }

    /* ------------ 3. Busca do convite + contexto ------------ */
    const { data: invite, error: inviteError } = await supabaseAdmin
        .from('team_invites')
        .select(`
      id, store_id, email, role, message, expires_at, accepted_at, invited_by,
      store:stores(id, name, slug, logo_url),
      invited_by_profile:profiles!invited_by(id, full_name, avatar_url)
    `)
        .eq('id', body.invite_id)
        .maybeSingle()

    if (inviteError) {
        return jsonError(500, 'DB_ERROR', 'Erro ao buscar convite', inviteError.message)
    }

    if (!invite) {
        return jsonError(404, 'INVITE_NOT_FOUND', 'Convite não encontrado')
    }

    if (invite.accepted_at) {
        return jsonError(409, 'ALREADY_ACCEPTED', 'Este convite já foi aceito')
    }

    if (new Date(invite.expires_at) < new Date()) {
        return jsonError(409, 'INVITE_EXPIRED', 'Convite expirado')
    }

    /* ------------ 4. Verifica se o requisitante pode enviar ------------ */
    const { data: membership } = await supabaseAdmin
        .from('team_members')
        .select('role, is_active')
        .eq('store_id', invite.store_id)
        .eq('profile_id', requester.id)
        .maybeSingle()

    if (!membership || !membership.is_active) {
        return jsonError(403, 'NOT_A_MEMBER', 'Você não pertence a essa loja')
    }

    if (!['OWNER', 'ADMIN'].includes(membership.role)) {
        return jsonError(403, 'INSUFFICIENT_ROLE', 'Apenas OWNER e ADMIN podem enviar convites')
    }

    /* ------------ 5. Rate limiting ------------ */
    const rateCheck = await checkRateLimit(supabaseAdmin, invite.id)
    if (!rateCheck.allowed) {
        return jsonError(
            429,
            'RATE_LIMITED',
            `Limite de ${RATE_LIMIT_MAX} envios em ${RATE_LIMIT_WINDOW_MS / 60000} minutos atingido`,
        )
    }

    /* ------------ 6. Monta e envia o e-mail ------------ */
    const store = invite.store as any
    const inviter = invite.invited_by_profile as any

    const appUrl = Deno.env.get('APP_URL') ?? 'https://vibestore.app'
    const inviteUrl = `${appUrl}/invite/${invite.id}`

    const emailPayload = buildInviteEmail({
        inviteUrl,
        storeName: store?.name ?? 'uma loja no VibeStore',
        storeLogoUrl: store?.logo_url,
        inviterName: inviter?.full_name ?? 'A equipe',
        inviterAvatar: inviter?.avatar_url,
        role: invite.role,
        message: invite.message,
        expiresAt: invite.expires_at,
        recipientEmail: invite.email,
    })

    const provider = createEmailProvider()

    try {
        const result = await provider.send({
            to: invite.email,
            subject: emailPayload.subject,
            html: emailPayload.html,
            text: emailPayload.text,
            replyTo: requester.email,
            tags: [
                { name: 'category', value: 'team_invite' },
                { name: 'store_id', value: invite.store_id },
            ],
        })

        await recordSend(supabaseAdmin, invite.id, 'sent')

        return jsonOk({
            success: true,
            message_id: result.id,
            resend_count: rateCheck.recent + 1,
        })
    } catch (err: any) {
        const errorMsg = err?.message ?? String(err)
        await recordSend(supabaseAdmin, invite.id, 'failed', errorMsg)

        console.error('[send-team-invite] Erro no provider:', err)
        return jsonError(502, 'PROVIDER_ERROR', 'Não foi possível enviar o e-mail', errorMsg)
    }
})
