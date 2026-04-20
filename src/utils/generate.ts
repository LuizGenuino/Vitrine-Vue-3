export function gerarCodigo(tamanho: number = 6) {
  return Math.random().toString(36).substring(2, 2 + tamanho);
}