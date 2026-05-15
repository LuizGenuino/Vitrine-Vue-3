import type { CartItem, Product } from '@/types';
import { formatCurrency } from '@/utils/format';

// Interface para os dados de checkout (Nome, Endereço, etc)
interface CheckoutInfo {
    name: string,
    cep: string,
    address: string,
    number: string,
    neighborhood: string,
    city: string,
    complement: string,
    paymentMethod: string,
}

const normalizePhone = (value: string) => {
    if (!value) return '';
    const cleaned = value.replace(/\D/g, '');
    // Garante o código do país (Brasil - 55) se o usuário não digitou
    return cleaned.length <= 11 ? `55${cleaned}` : cleaned;
};

export const useWhatsApp = () => {

    /**
     * Constrói o link para compra direta de um único produto
     */
    function buildProductLink(phone: string, product: Product, quantity: number = 1) {
        const message = [
            `*NOVO INTERESSE EM PRODUTO*`,
            `--------------------------`,
            `*Produto:* ${product.name}`,
            `*Qtd:* ${quantity}`,
            `*Preço:* ${formatCurrency(product.price)}`,
            `--------------------------`,
            `*Total: ${formatCurrency(product.price * quantity)}*`,
            '',
            `Tenho interesse neste item, como podemos prosseguir?`
        ].join('\n');

        return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
    }

    /**
     * Constrói o link para o carrinho completo com dados do cliente
     */
    function buildCartLink(phone: string, items: CartItem[], customer?: CheckoutInfo) {
        const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

        // Formata a lista de itens com bullet points e negrito
        const itemLines = items.map(
            (item) => `• *${item.quantity}x* ${item.name} de ${formatCurrency(item.price)} cada ${item.quantity > 1 ? '(' + formatCurrency(item.price * item.quantity) + ')' : ''}`
        );

        // Montagem da mensagem estruturada como um "Recibo"
        const messageLines = [
            `*📦 NOVO PEDIDO RECEBIDO*`,
            `--------------------------------`,
            ...itemLines,
            `--------------------------------`,
            `*VALOR TOTAL:* ${formatCurrency(total)}`,
            ''
        ];

        // Se houver dados do cliente, adiciona a seção de entrega (UX: Ganho de tempo para o lojista)
        if (customer && customer.name) {
            messageLines.push(
                `*👤 DADOS DO CLIENTE*`,
                `*Nome:* ${customer.name}`,
                `*Pagamento:* ${customer.paymentMethod}`,
                '\n',
                `*👤 DADOS DE ENTREGA*`,
                `*Cidade:* ${customer.city || ""}`,
                `*Bairro:* ${customer.neighborhood || ""}`,
                `*Endereço:* ${customer.address || ""}`,
                `*Numero:* ${customer.number || ""}`,
                `*Complemento:* ${customer.complement || ""}`,
                '\n',
            );
        }

        messageLines.push(`_Enviado via VibeStore_`);

        const finalMessage = messageLines.join('\n');
        return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(finalMessage)}`;
    }

    return { buildProductLink, buildCartLink };
};