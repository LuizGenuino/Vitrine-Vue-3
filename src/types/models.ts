import type { Tables, InsertDto, UpdateDto, Enums } from '@/lib/supabase'

// Entidades (Row)
export type Profile = Tables<'profiles'>
export type Store = Tables<'stores'>
export type Plan = Tables<'plans'>
export type Subscription = Tables<'subscriptions'>
export type TeamMember = Tables<'team_members'>
export type Category = Tables<'categories'>
export type Product = Tables<'products'>
export type ProductImage = Tables<'product_images'>
export type Customer = Tables<'customers'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type Coupon = Tables<'coupons'>
export type Review = Tables<'reviews'>
export type InventoryMove = Tables<'inventory_movements'>
export type AnalyticsEvent = Tables<'analytics_events'>
export type TeamInvites = Tables<'team_invites'>

// DTOs de escrita
export type ProductInsert = InsertDto<'products'>
export type ProductUpdate = UpdateDto<'products'>
export type OrderInsert = InsertDto<'orders'>
export type CustomerInsert = InsertDto<'customers'>

// Enums
export type UserRole = Enums<'user_role'>
export type OrderStatus = Enums<'order_status'>
export type ProductStatus = Enums<'product_status'>
export type InventoryType = Enums<'inventory_movement_type'>
export type PaymentStatus = Enums<'payment_status'>

// Views compostas (para páginas de detalhe)
export interface ProductWithRelations extends Product {
    category: Category | null
    product_images: ProductImage[]
    stock_balance?: number
}

export interface OrderWithRelations extends Order {
    customer: Customer | null
    order_items: (OrderItem & { product: Product })[]
}