import { supabase } from '@/lib/supabase'
import { ServiceError } from './base.service'
import { useAuthStore } from '@/stores/auth.store'
import type { InventoryMove, InventoryType } from '@/types/models'

class InventoryService {
    private storeId() {
        const id = useAuthStore().currentStoreId
        if (!id) throw new ServiceError('NO_STORE', 'Loja não selecionada')
        return id
    }

    /** Registra movimentação (nunca UPDATE direto de estoque!) */
    async registerMovement(input: {
        productId: string
        type: InventoryType
        quantity: number
        unitCost?: number
        referenceType?: string
        referenceId?: string
        notes?: string
    }): Promise<InventoryMove> {
        const { data, error } = await supabase
            .from('inventory_movements')
            .insert({
                store_id: this.storeId(),
                product_id: input.productId,
                type: input.type,
                quantity: input.quantity,
                unit_cost: input.unitCost,
                reference_type: input.referenceType,
                reference_id: input.referenceId,
                notes: input.notes,
            })
            .select().single()
        if (error) throw ServiceError.from(error)
        return data as InventoryMove
    }

    async getBalance(productId: string): Promise<number> {
        const { data } = await supabase
            .from('product_stock_balances')
            .select('balance').eq('product_id', productId).maybeSingle()
        return data?.balance ?? 0
    }

    async getBalances(productIds: string[]): Promise<Record<string, number>> {
        if (!productIds.length) return {}
        const { data } = await supabase
            .from('product_stock_balances')
            .select('product_id, balance').in('product_id', productIds)
        const map: Record<string, number> = {}
        for (const r of data ?? []) map[r.product_id!] = r.balance ?? 0
        return map
    }

    async history(productId: string, limit = 50) {
        const { data } = await supabase
            .from('inventory_movements').select('*')
            .eq('product_id', productId)
            .order('created_at', { ascending: false }).limit(limit)
        return (data ?? []) as InventoryMove[]
    }
}

export const inventoryService = new InventoryService()