import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import type { Database } from '@/types/database.types'
import type { PostgrestError } from '@supabase/supabase-js'

export interface ListOptions {
    page?: number
    pageSize?: number
    orderBy?: string
    ascending?: boolean
    search?: string
    filters?: Record<string, any>
}

export interface ListResult<T> {
    data: T[]
    count: number
    page: number
    pageSize: number
    totalPages: number
}

export class ServiceError extends Error {
    constructor(public code: string, message: string, public details?: unknown) {
        super(message)
    }
    static from(err: PostgrestError | Error) {
        if ('code' in err) {
            return new ServiceError(err.code, err.message, err)
        }
        return new ServiceError('UNKNOWN', err.message)
    }
}

export abstract class BaseService<
    TRow extends { id: string },
    TInsert,
    TUpdate,
> {
    protected abstract table: keyof Database['public']['Tables']
    protected selectQuery: string = '*'
    protected softDeleteField: string | null = 'deleted_at'

    protected getTable(): keyof Database['public']['Tables'] {
        if (!this.table) {
            throw new ServiceError('NO_TABLE', 'Nenhuma tabela definida para o serviço')
        }

        return this.table
    }

    protected storeId(): string {
        const auth = useAuthStore()
        if (!auth.currentStoreId) {
            throw new ServiceError('NO_STORE', 'Nenhuma loja ativa selecionada')
        }
        return auth.currentStoreId
    }

    async list(opts: ListOptions = {}): Promise<ListResult<TRow>> {
        const {
            page = 1, pageSize = 25,
            orderBy = 'created_at', ascending = false,
            filters = {},
        } = opts

        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        let query = supabase
            .from(this.getTable())
            .select(this.selectQuery, { count: 'exact' })
            .order(orderBy, { ascending })
            .range(from, to)

        if (this.softDeleteField) {
            query = query.is(this.softDeleteField, null)
        }

        for (const [k, v] of Object.entries(filters)) {
            if (v !== null && v !== undefined && v !== '') {
                query = query.eq(k, v)
            }
        }

        const { data, error, count } = await query
        if (error) throw ServiceError.from(error)

        return {
            data: (data ?? []) as unknown as TRow[],
            count: count ?? 0,
            page, pageSize,
            totalPages: Math.ceil((count ?? 0) / pageSize),
        }
    }

    async get(id: string): Promise<TRow | null> {
        const { data, error } = await supabase
            .from(this.getTable())
            .select(this.selectQuery)
            .eq('id' as any, id)
            .maybeSingle()
        if (error) throw ServiceError.from(error)
        return data as unknown as TRow | null
    }

    async create(payload: TInsert): Promise<TRow> {
        const { data, error } = await supabase
            .from(this.getTable()).insert(payload as any).select().single()
        if (error) throw ServiceError.from(error)
        return data as unknown as TRow
    }

    async update(id: string, payload: TUpdate): Promise<TRow> {
        const { data, error } = await supabase
            .from(this.getTable()).update(payload as any).eq('id' as any, id).select().single()
        if (error) throw ServiceError.from(error)
        return data as unknown as TRow
    }

    async softDelete(id: string): Promise<void> {
        if (!this.softDeleteField) throw new ServiceError('NO_SOFT_DELETE', 'Tabela não suporta soft delete')
        const { error } = await supabase
            .from(this.getTable())
            .update({ [this.softDeleteField]: new Date().toISOString() } as any)
            .eq('id' as any, id)
        if (error) throw ServiceError.from(error)
    }

    async hardDelete(id: string): Promise<void> {
        const { error } = await supabase.from(this.getTable()).delete().eq('id' as any, id)
        if (error) throw ServiceError.from(error)
    }
}