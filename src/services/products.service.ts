import { supabase } from '@/lib/supabase'
import { BaseService, ServiceError, type ListOptions, type ListResult } from './base.service'
import type { Product, ProductInsert, ProductUpdate, ProductWithRelations } from '@/types/models'
import type { Constants, Database } from '@/types/database.types'

export interface ProductFilters {
    search?: string
    categoryId?: string
    status?: typeof Constants['public']['Enums']['product_status'][number]
    featured?: boolean
    minPrice?: number
    maxPrice?: number
}

class ProductsService extends BaseService<Product, ProductInsert, ProductUpdate> {
    protected table: keyof Database['public']['Tables'] = 'products'
    protected selectQuery = '*, category:categories(id,name), product_images(id,url,is_primary,sort_order)'

    /** Listagem com busca textual, filtros e paginação */
    async listAdvanced(
        opts: ListOptions & ProductFilters = {}
    ): Promise<ListResult<ProductWithRelations>> {
        const { page = 1, pageSize = 25, orderBy = 'created_at', ascending = false } = opts
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        let query = supabase
            .from('products')
            .select(this.selectQuery, { count: 'exact' })
            .is('deleted_at', null)
            .order(orderBy, { ascending })
            .range(from, to)

        if (opts.search) {
            query = query.ilike('name', `%${opts.search}%`)
        }
        if (opts.categoryId) query = query.eq('category_id', opts.categoryId)
        if (opts.status) query = query.eq('status', opts.status)
        if (opts.featured !== undefined) query = query.eq('is_featured', opts.featured)
        if (opts.minPrice !== undefined) query = query.gte('price', opts.minPrice)
        if (opts.maxPrice !== undefined) query = query.lte('price', opts.maxPrice)

        const { data, error, count } = await query
        if (error) throw ServiceError.from(error)

        return {
            data: (data ?? []) as unknown as ProductWithRelations[],
            count: count ?? 0,
            page, pageSize,
            totalPages: Math.ceil((count ?? 0) / pageSize),
        }
    }

    /** Cria produto + atributos + estoque inicial (numa mesma transação lógica) */
    async createComplete(input: {
        product: Omit<ProductInsert, 'store_id'>
        attributes?: { name: string; value: string }[]
        initialStock?: number
    }) {
        const storeId = this.storeId()

        const { data: product, error } = await supabase
            .from('products')
            .insert({ ...input.product, store_id: storeId })
            .select().single()
        if (error) throw ServiceError.from(error)

        if (input.attributes?.length) {
            await supabase.from('product_attributes').insert(
                input.attributes.map(a => ({ ...a, product_id: product.id }))
            )
        }

        if (input.initialStock && input.initialStock > 0) {
            await supabase.from('inventory_movements').insert({
                store_id: storeId,
                product_id: product.id,
                type: 'ENTRY',
                quantity: input.initialStock,
                reference_type: 'manual',
                notes: 'Estoque inicial',
            })
        }
        return product as Product
    }

    /** Busca por SKU dentro da loja atual */
    async findBySku(sku: string) {
        const { data } = await supabase
            .from('products').select('*')
            .eq('store_id', this.storeId()).eq('sku', sku).maybeSingle()
        return data
    }

    /** Alterna is_featured */
    async toggleFeatured(id: string, value: boolean) {
        return this.update(id, { is_featured: value })
    }
}

export const productsService = new ProductsService()