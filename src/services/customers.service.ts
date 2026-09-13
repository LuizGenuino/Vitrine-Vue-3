import { supabase } from '@/lib/supabase'
import { BaseService, ServiceError } from './base.service'
import type { Customer, CustomerInsert } from '@/types/models'
import type { UpdateDto } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

class CustomersService extends BaseService<Customer, CustomerInsert, UpdateDto<'customers'>> {
    protected table: keyof Database['public']['Tables'] = 'customers'
    protected selectQuery = '*, addresses:customer_addresses(*)'

    async searchByText(term: string, limit = 10) {
        const { data } = await supabase
            .from('customers')
            .select('id, full_name, email, phone')
            .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
            .is('deleted_at', null).limit(limit)
        return (data ?? []) as Partial<Customer>[]
    }

    async addAddress(customerId: string, address: {
        label?: string; street: string; number?: string
        neighborhood?: string; city: string; state: string
        postalCode: string; isDefault?: boolean
    }) {
        const { data, error } = await supabase
            .from('customer_addresses').insert({
                customer_id: customerId,
                label: address.label,
                street: address.street,
                number: address.number,
                neighborhood: address.neighborhood,
                city: address.city,
                state: address.state,
                postal_code: address.postalCode,
                is_default: address.isDefault ?? false,
            }).select().single()
        if (error) throw ServiceError.from(error)
        return data
    }

    /** LGPD: dispara função RPC de anonimização */
    async anonymize(customerId: string) {
        const { error } = await supabase.rpc('anonymize_customer', { p_customer: customerId })
        if (error) throw ServiceError.from(error)
    }
}

export const customersService = new CustomersService()