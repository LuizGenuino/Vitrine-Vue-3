export function humanizeSupabaseError(err: any): string {
  const code = err?.code
  switch (code) {
    case '23505': return 'Registro duplicado (violação de UNIQUE)'
    case '23503': return 'Referência inválida (foreign key)'
    case '23514': return 'Valor viola regra de negócio (check)'
    case '42501': return 'Sem permissão para esta operação (RLS)'
    case 'PGRST116': return 'Registro não encontrado'
    default: return err?.message ?? 'Erro desconhecido'
  }
}