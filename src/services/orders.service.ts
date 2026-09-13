import { supabase } from '@/lib/supabase'
import { BaseService, ServiceError } from './base.service'
import type { Order, OrderInsert, OrderWithRelations, OrderStatus } from '@/types/models'
import type { UpdateDto } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

export interface CheckoutInput {
    customerId?: string
    items: { productId: string; quantity: number; unitPrice: number }[]
    couponCode?: string
    shippingCost?: number
    paymentMethod?: string
    notes?: string
}

class OrdersService extends BaseService<Order, OrderInsert, UpdateDto<'orders'>> {
    protected table: keyof Database['public']['Tables'] = 'orders'
    protected selectQuery = `
    *,
    customer:customers(id, full_name, email, phone),
    order_items(*, product:products(id, name, sku)),
    payments:order_payments(*),
    shipment:order_shipments(*)
  `

    async getFull(id: string): Promise<OrderWithRelations | null> {
        const { data, error } = await supabase
            .from('orders').select(this.selectQuery).eq('id', id).maybeSingle()
        if (error) throw ServiceError.from(error)
        return data as unknown as OrderWithRelations | null
    }

    /** Fluxo de checkout: order + items + payment PENDING + validação de cupom */
    async checkout(input: CheckoutInput): Promise<Order> {
        const storeId = this.storeId()

        // 1. calcula totais
        const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
        let discount = 0
        let couponId: string | null = null

        if (input.couponCode) {
            const { data: coupon } = await supabase
                .from('coupons').select('*')
                .eq('store_id', storeId).eq('code', input.couponCode)
                .eq('is_active', true).maybeSingle()
            if (!coupon) throw new ServiceError('INVALID_COUPON', 'Cupom inválido ou expirado')
            couponId = coupon.id
            discount = coupon.type === 'PERCENTAGE' ? subtotal * (coupon.value / 100) : coupon.value
        }

        const shipping = input.shippingCost ?? 0
        const total = Math.max(0, subtotal - discount + shipping)

        // 2. gera número (via RPC)
        const { data: orderNumber } = await supabase
            .rpc('generate_order_number', { p_store: storeId })

        // 3. cria pedido
        const { data: order, error } = await supabase
            .from('orders')
            .insert({
                store_id: storeId,
                customer_id: input.customerId,
                coupon_id: couponId,
                order_number: orderNumber as string,
                status: 'PENDING',
                subtotal, discount,
                shipping_cost: shipping,
                total,
                payment_method: input.paymentMethod,
                notes: input.notes,
            })
            .select().single()
        if (error) throw ServiceError.from(error)

        // 4. cria items
        await supabase.from('order_items').insert(
            input.items.map(i => ({
                order_id: order.id,
                product_id: i.productId,
                quantity: i.quantity,
                unit_price: i.unitPrice,
                total: i.quantity * i.unitPrice,
            }))
        )

        // 5. cria pagamento PENDING
        await supabase.from('order_payments').insert({
            order_id: order.id,
            gateway: input.paymentMethod ?? 'manual',
            amount: total,
            status: 'PENDING',
        })

        // 6. incrementa uses_count do cupom
        if (couponId) {
            await supabase.rpc('increment_coupon_use' as any, { p_coupon: couponId })
                .then(() => { })
            //.catch(() => {return null }) // silencioso caso a RPC não exista ainda
        }

        return order as Order
    }

    async updateStatus(id: string, status: OrderStatus) {
        return this.update(id, { status })
    }

    async getStats(storeId?: string) {
        const sid = storeId ?? this.storeId()
        const { data } = await supabase
            .from('orders')
            .select('status, total')
            .eq('store_id', sid).is('deleted_at', null)

        const orders = data ?? []
        return {
            total: orders.length,
            paid: orders.filter(o => o.status === 'PAID').length,
            pending: orders.filter(o => o.status === 'PENDING').length,
            revenue: orders.filter(o => ['PAID', 'DELIVERED'].includes(o.status)).reduce((s, o) => s + Number(o.total), 0),
        }
    }
}

export const ordersService = new OrdersService()