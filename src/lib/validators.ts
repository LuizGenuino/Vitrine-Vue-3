// src/lib/validators.ts
export const authRules = {
  required: (v: unknown) => !!v || 'Campo obrigatório',
  email: (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'E-mail inválido',
  minLength: (n: number) => (v: string) =>
    (v?.length ?? 0) >= n || `Mínimo de ${n} caracteres`,
  strongPassword: (v: string) =>
    /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(v) ||
    'Mínimo 8 caracteres, com letras e números',
  matches: (other: string, msg = 'As senhas não coincidem') => (v: string) =>
    v === other || msg,
}
