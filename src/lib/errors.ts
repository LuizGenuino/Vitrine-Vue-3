// src/lib/errors.ts (expansão)
export function humanizeSupabaseError(err: any): string {
  const code = err?.code
  const msg  = String(err?.message ?? '')

  // Códigos PostgREST/PostgreSQL
  switch (code) {
    case '23505':    return 'Registro duplicado (violação de UNIQUE)'
    case '23503':    return 'Referência inválida (foreign key)'
    case '23514':    return 'Valor viola regra de negócio (check)'
    case '42501':    return 'Sem permissão para esta operação (RLS)'
    case 'PGRST116': return 'Registro não encontrado'
  }

  // Mensagens típicas do supabase-auth-js
  if (msg.includes('Invalid login credentials'))
    return 'E-mail ou senha incorretos'
  if (msg.includes('Email not confirmed'))
    return 'Confirme seu e-mail antes de fazer login'
  if (msg.includes('User already registered'))
    return 'Este e-mail já está cadastrado'
  if (msg.includes('Password should be at least'))
    return 'A senha é muito curta'
  if (msg.includes('rate limit') || msg.includes('For security purposes'))
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente'
  if (msg.includes('User not found'))
    return 'Usuário não encontrado'

  return msg || 'Erro desconhecido'
}
