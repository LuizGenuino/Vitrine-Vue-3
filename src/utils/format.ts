export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

export const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const buildTimestamp = () => new Date().toISOString();

export const textoLimitado = (texto: string, limite: number) => {
    const palavras = texto.split(' ');
    if (palavras.length <= limite) return texto;
    return palavras.slice(0, limite).join(' ') + '...';
}
