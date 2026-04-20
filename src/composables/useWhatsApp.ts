import type { CartItem, Product } from '@/types';
import { formatCurrency } from '@/utils/format';

const normalizePhone = (value: string) => value.replace(/\D/g, '');

export const useWhatsApp = () => {
  function buildProductLink(phone: string, product: Product) {
    const message = `Olá! Tenho interesse no produto *${product.name}* no valor de ${formatCurrency(product.price)}.`;
    return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
  }

  function buildCartLink(phone: string, items: CartItem[]) {
    const lines = items.map(
      (item) => `• ${item.name} x${item.quantity} — ${formatCurrency(item.price * item.quantity)}`,
    );
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const message = [`Olá! Quero finalizar este pedido:`, '', ...lines, '', `Total: ${formatCurrency(total)}`].join('\n');
    return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
  }

  return { buildProductLink, buildCartLink };
};
