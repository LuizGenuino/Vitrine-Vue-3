export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "14.15"
    }
    graphql_public: {
        Tables: {
            [_ in never]: never
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            graphql: {
                Args: {
                    extensions?: Json
                    operationName?: string
                    query?: string
                    variables?: Json
                }
                Returns: Json
            }
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
    public: {
        Tables: {
            analytics_events: {
                Row: {
                    created_at: string
                    customer_id: string | null
                    event_type: Database["public"]["Enums"]["analytics_event_type"]
                    id: string
                    ip_address: unknown
                    metadata: Json
                    product_id: string | null
                    session_id: string | null
                    store_id: string
                    user_agent: string | null
                }
                Insert: {
                    created_at?: string
                    customer_id?: string | null
                    event_type: Database["public"]["Enums"]["analytics_event_type"]
                    id?: string
                    ip_address?: unknown
                    metadata?: Json
                    product_id?: string | null
                    session_id?: string | null
                    store_id: string
                    user_agent?: string | null
                }
                Update: {
                    created_at?: string
                    customer_id?: string | null
                    event_type?: Database["public"]["Enums"]["analytics_event_type"]
                    id?: string
                    ip_address?: unknown
                    metadata?: Json
                    product_id?: string | null
                    session_id?: string | null
                    store_id?: string
                    user_agent?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "analytics_events_customer_id_fkey"
                        columns: ["customer_id"]
                        isOneToOne: false
                        referencedRelation: "customers"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "analytics_events_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "analytics_events_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
            audit_logs: {
                Row: {
                    action: string
                    created_at: string
                    id: string
                    ip_address: unknown
                    new_values: Json | null
                    old_values: Json | null
                    record_id: string
                    store_id: string | null
                    table_name: string
                    user_id: string | null
                }
                Insert: {
                    action: string
                    created_at?: string
                    id?: string
                    ip_address?: unknown
                    new_values?: Json | null
                    old_values?: Json | null
                    record_id: string
                    store_id?: string | null
                    table_name: string
                    user_id?: string | null
                }
                Update: {
                    action?: string
                    created_at?: string
                    id?: string
                    ip_address?: unknown
                    new_values?: Json | null
                    old_values?: Json | null
                    record_id?: string
                    store_id?: string | null
                    table_name?: string
                    user_id?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "audit_logs_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "audit_logs_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            categories: {
                Row: {
                    created_at: string
                    created_by: string | null
                    deleted_at: string | null
                    description: string | null
                    id: string
                    image_url: string | null
                    is_active: boolean
                    name: string
                    parent_id: string | null
                    slug: string
                    sort_order: number
                    store_id: string
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    description?: string | null
                    id?: string
                    image_url?: string | null
                    is_active?: boolean
                    name: string
                    parent_id?: string | null
                    slug: string
                    sort_order?: number
                    store_id: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    description?: string | null
                    id?: string
                    image_url?: string | null
                    is_active?: boolean
                    name?: string
                    parent_id?: string | null
                    slug?: string
                    sort_order?: number
                    store_id?: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "categories_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "categories_parent_id_fkey"
                        columns: ["parent_id"]
                        isOneToOne: false
                        referencedRelation: "categories"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "categories_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "categories_updated_by_fkey"
                        columns: ["updated_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            coupons: {
                Row: {
                    code: string
                    created_at: string
                    created_by: string | null
                    deleted_at: string | null
                    id: string
                    is_active: boolean
                    max_uses: number | null
                    min_order_value: number | null
                    store_id: string
                    type: Database["public"]["Enums"]["coupon_type"]
                    updated_at: string
                    updated_by: string | null
                    uses_count: number
                    valid_from: string | null
                    valid_until: string | null
                    value: number
                }
                Insert: {
                    code: string
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    id?: string
                    is_active?: boolean
                    max_uses?: number | null
                    min_order_value?: number | null
                    store_id: string
                    type: Database["public"]["Enums"]["coupon_type"]
                    updated_at?: string
                    updated_by?: string | null
                    uses_count?: number
                    valid_from?: string | null
                    valid_until?: string | null
                    value: number
                }
                Update: {
                    code?: string
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    id?: string
                    is_active?: boolean
                    max_uses?: number | null
                    min_order_value?: number | null
                    store_id?: string
                    type?: Database["public"]["Enums"]["coupon_type"]
                    updated_at?: string
                    updated_by?: string | null
                    uses_count?: number
                    valid_from?: string | null
                    valid_until?: string | null
                    value?: number
                }
                Relationships: [
                    {
                        foreignKeyName: "coupons_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "coupons_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "coupons_updated_by_fkey"
                        columns: ["updated_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            customer_addresses: {
                Row: {
                    city: string
                    complement: string | null
                    country: string
                    created_at: string
                    customer_id: string
                    deleted_at: string | null
                    id: string
                    is_default: boolean
                    label: string | null
                    neighborhood: string | null
                    number: string | null
                    postal_code: string
                    state: string
                    street: string
                    updated_at: string
                }
                Insert: {
                    city: string
                    complement?: string | null
                    country?: string
                    created_at?: string
                    customer_id: string
                    deleted_at?: string | null
                    id?: string
                    is_default?: boolean
                    label?: string | null
                    neighborhood?: string | null
                    number?: string | null
                    postal_code: string
                    state: string
                    street: string
                    updated_at?: string
                }
                Update: {
                    city?: string
                    complement?: string | null
                    country?: string
                    created_at?: string
                    customer_id?: string
                    deleted_at?: string | null
                    id?: string
                    is_default?: boolean
                    label?: string | null
                    neighborhood?: string | null
                    number?: string | null
                    postal_code?: string
                    state?: string
                    street?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "customer_addresses_customer_id_fkey"
                        columns: ["customer_id"]
                        isOneToOne: false
                        referencedRelation: "customers"
                        referencedColumns: ["id"]
                    },
                ]
            }
            customers: {
                Row: {
                    birth_date: string | null
                    cpf_cnpj: string | null
                    created_at: string
                    created_by: string | null
                    deleted_at: string | null
                    email: string | null
                    full_name: string
                    id: string
                    phone: string | null
                    store_id: string
                    tags: string[]
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    birth_date?: string | null
                    cpf_cnpj?: string | null
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    email?: string | null
                    full_name: string
                    id?: string
                    phone?: string | null
                    store_id: string
                    tags?: string[]
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    birth_date?: string | null
                    cpf_cnpj?: string | null
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    email?: string | null
                    full_name?: string
                    id?: string
                    phone?: string | null
                    store_id?: string
                    tags?: string[]
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "customers_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "customers_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "customers_updated_by_fkey"
                        columns: ["updated_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            favorites: {
                Row: {
                    created_at: string
                    customer_id: string
                    id: string
                    product_id: string
                }
                Insert: {
                    created_at?: string
                    customer_id: string
                    id?: string
                    product_id: string
                }
                Update: {
                    created_at?: string
                    customer_id?: string
                    id?: string
                    product_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "favorites_customer_id_fkey"
                        columns: ["customer_id"]
                        isOneToOne: false
                        referencedRelation: "customers"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "favorites_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                ]
            }
            integrations: {
                Row: {
                    config: Json
                    created_at: string
                    created_by: string | null
                    credentials: string | null
                    deleted_at: string | null
                    id: string
                    is_active: boolean
                    provider: string
                    store_id: string
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    config?: Json
                    created_at?: string
                    created_by?: string | null
                    credentials?: string | null
                    deleted_at?: string | null
                    id?: string
                    is_active?: boolean
                    provider: string
                    store_id: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    config?: Json
                    created_at?: string
                    created_by?: string | null
                    credentials?: string | null
                    deleted_at?: string | null
                    id?: string
                    is_active?: boolean
                    provider?: string
                    store_id?: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "integrations_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "integrations_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "integrations_updated_by_fkey"
                        columns: ["updated_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            inventory_movements: {
                Row: {
                    created_at: string
                    created_by: string | null
                    id: string
                    notes: string | null
                    product_id: string
                    quantity: number
                    reference_id: string | null
                    reference_type: string | null
                    store_id: string
                    type: Database["public"]["Enums"]["inventory_movement_type"]
                    unit_cost: number | null
                }
                Insert: {
                    created_at?: string
                    created_by?: string | null
                    id?: string
                    notes?: string | null
                    product_id: string
                    quantity: number
                    reference_id?: string | null
                    reference_type?: string | null
                    store_id: string
                    type: Database["public"]["Enums"]["inventory_movement_type"]
                    unit_cost?: number | null
                }
                Update: {
                    created_at?: string
                    created_by?: string | null
                    id?: string
                    notes?: string | null
                    product_id?: string
                    quantity?: number
                    reference_id?: string | null
                    reference_type?: string | null
                    store_id?: string
                    type?: Database["public"]["Enums"]["inventory_movement_type"]
                    unit_cost?: number | null
                }
                Relationships: [
                    {
                        foreignKeyName: "inventory_movements_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "inventory_movements_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "inventory_movements_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
            order_items: {
                Row: {
                    created_at: string
                    id: string
                    order_id: string
                    product_id: string
                    quantity: number
                    total: number
                    unit_price: number
                }
                Insert: {
                    created_at?: string
                    id?: string
                    order_id: string
                    product_id: string
                    quantity: number
                    total: number
                    unit_price: number
                }
                Update: {
                    created_at?: string
                    id?: string
                    order_id?: string
                    product_id?: string
                    quantity?: number
                    total?: number
                    unit_price?: number
                }
                Relationships: [
                    {
                        foreignKeyName: "order_items_order_id_fkey"
                        columns: ["order_id"]
                        isOneToOne: false
                        referencedRelation: "orders"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "order_items_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                ]
            }
            order_payments: {
                Row: {
                    amount: number
                    created_at: string
                    gateway: string
                    gateway_transaction_id: string | null
                    id: string
                    order_id: string
                    paid_at: string | null
                    raw_response: Json | null
                    status: Database["public"]["Enums"]["payment_status"]
                    updated_at: string
                }
                Insert: {
                    amount: number
                    created_at?: string
                    gateway: string
                    gateway_transaction_id?: string | null
                    id?: string
                    order_id: string
                    paid_at?: string | null
                    raw_response?: Json | null
                    status?: Database["public"]["Enums"]["payment_status"]
                    updated_at?: string
                }
                Update: {
                    amount?: number
                    created_at?: string
                    gateway?: string
                    gateway_transaction_id?: string | null
                    id?: string
                    order_id?: string
                    paid_at?: string | null
                    raw_response?: Json | null
                    status?: Database["public"]["Enums"]["payment_status"]
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "order_payments_order_id_fkey"
                        columns: ["order_id"]
                        isOneToOne: false
                        referencedRelation: "orders"
                        referencedColumns: ["id"]
                    },
                ]
            }
            order_shipments: {
                Row: {
                    carrier: string | null
                    created_at: string
                    delivered_at: string | null
                    estimated_delivery: string | null
                    id: string
                    order_id: string
                    shipped_at: string | null
                    tracking_code: string | null
                    updated_at: string
                }
                Insert: {
                    carrier?: string | null
                    created_at?: string
                    delivered_at?: string | null
                    estimated_delivery?: string | null
                    id?: string
                    order_id: string
                    shipped_at?: string | null
                    tracking_code?: string | null
                    updated_at?: string
                }
                Update: {
                    carrier?: string | null
                    created_at?: string
                    delivered_at?: string | null
                    estimated_delivery?: string | null
                    id?: string
                    order_id?: string
                    shipped_at?: string | null
                    tracking_code?: string | null
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "order_shipments_order_id_fkey"
                        columns: ["order_id"]
                        isOneToOne: false
                        referencedRelation: "orders"
                        referencedColumns: ["id"]
                    },
                ]
            }
            orders: {
                Row: {
                    coupon_id: string | null
                    created_at: string
                    created_by: string | null
                    customer_id: string | null
                    deleted_at: string | null
                    discount: number
                    id: string
                    notes: string | null
                    order_number: string
                    payment_method: string | null
                    shipping_cost: number
                    status: Database["public"]["Enums"]["order_status"]
                    store_id: string
                    subtotal: number
                    total: number
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    coupon_id?: string | null
                    created_at?: string
                    created_by?: string | null
                    customer_id?: string | null
                    deleted_at?: string | null
                    discount?: number
                    id?: string
                    notes?: string | null
                    order_number: string
                    payment_method?: string | null
                    shipping_cost?: number
                    status?: Database["public"]["Enums"]["order_status"]
                    store_id: string
                    subtotal?: number
                    total?: number
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    coupon_id?: string | null
                    created_at?: string
                    created_by?: string | null
                    customer_id?: string | null
                    deleted_at?: string | null
                    discount?: number
                    id?: string
                    notes?: string | null
                    order_number?: string
                    payment_method?: string | null
                    shipping_cost?: number
                    status?: Database["public"]["Enums"]["order_status"]
                    store_id?: string
                    subtotal?: number
                    total?: number
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "orders_coupon_id_fkey"
                        columns: ["coupon_id"]
                        isOneToOne: false
                        referencedRelation: "coupons"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "orders_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "orders_customer_id_fkey"
                        columns: ["customer_id"]
                        isOneToOne: false
                        referencedRelation: "customers"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "orders_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "orders_updated_by_fkey"
                        columns: ["updated_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            permissions: {
                Row: {
                    code: string
                    description: string | null
                    id: string
                }
                Insert: {
                    code: string
                    description?: string | null
                    id?: string
                }
                Update: {
                    code?: string
                    description?: string | null
                    id?: string
                }
                Relationships: []
            }
            plans: {
                Row: {
                    created_at: string
                    features: Json
                    id: string
                    is_active: boolean
                    max_products: number
                    max_storage_mb: number
                    max_users: number
                    name: string
                    price_monthly: number
                    price_yearly: number
                    tier: Database["public"]["Enums"]["plan_tier"]
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    features?: Json
                    id?: string
                    is_active?: boolean
                    max_products?: number
                    max_storage_mb?: number
                    max_users?: number
                    name: string
                    price_monthly?: number
                    price_yearly?: number
                    tier: Database["public"]["Enums"]["plan_tier"]
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    features?: Json
                    id?: string
                    is_active?: boolean
                    max_products?: number
                    max_storage_mb?: number
                    max_users?: number
                    name?: string
                    price_monthly?: number
                    price_yearly?: number
                    tier?: Database["public"]["Enums"]["plan_tier"]
                    updated_at?: string
                }
                Relationships: []
            }
            product_attributes: {
                Row: {
                    created_at: string
                    id: string
                    name: string
                    product_id: string
                    value: string
                }
                Insert: {
                    created_at?: string
                    id?: string
                    name: string
                    product_id: string
                    value: string
                }
                Update: {
                    created_at?: string
                    id?: string
                    name?: string
                    product_id?: string
                    value?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "product_attributes_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                ]
            }
            product_images: {
                Row: {
                    alt_text: string | null
                    created_at: string
                    id: string
                    is_primary: boolean
                    product_id: string
                    sort_order: number
                    url: string
                }
                Insert: {
                    alt_text?: string | null
                    created_at?: string
                    id?: string
                    is_primary?: boolean
                    product_id: string
                    sort_order?: number
                    url: string
                }
                Update: {
                    alt_text?: string | null
                    created_at?: string
                    id?: string
                    is_primary?: boolean
                    product_id?: string
                    sort_order?: number
                    url?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "product_images_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                ]
            }
            products: {
                Row: {
                    category_id: string | null
                    cost_price: number | null
                    created_at: string
                    created_by: string | null
                    deleted_at: string | null
                    description: string | null
                    id: string
                    is_featured: boolean
                    name: string
                    price: number
                    seo_description: string | null
                    seo_keywords: string | null
                    seo_title: string | null
                    sku: string
                    slug: string
                    status: Database["public"]["Enums"]["product_status"]
                    store_id: string
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    category_id?: string | null
                    cost_price?: number | null
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    description?: string | null
                    id?: string
                    is_featured?: boolean
                    name: string
                    price: number
                    seo_description?: string | null
                    seo_keywords?: string | null
                    seo_title?: string | null
                    sku: string
                    slug: string
                    status?: Database["public"]["Enums"]["product_status"]
                    store_id: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    category_id?: string | null
                    cost_price?: number | null
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    description?: string | null
                    id?: string
                    is_featured?: boolean
                    name?: string
                    price?: number
                    seo_description?: string | null
                    seo_keywords?: string | null
                    seo_title?: string | null
                    sku?: string
                    slug?: string
                    status?: Database["public"]["Enums"]["product_status"]
                    store_id?: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "products_category_id_fkey"
                        columns: ["category_id"]
                        isOneToOne: false
                        referencedRelation: "categories"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "products_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "products_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "products_updated_by_fkey"
                        columns: ["updated_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    created_at: string
                    deleted_at: string | null
                    full_name: string
                    id: string
                    phone: string | null
                    preferences: Json
                    updated_at: string
                }
                Insert: {
                    avatar_url?: string | null
                    created_at?: string
                    deleted_at?: string | null
                    full_name: string
                    id: string
                    phone?: string | null
                    preferences?: Json
                    updated_at?: string
                }
                Update: {
                    avatar_url?: string | null
                    created_at?: string
                    deleted_at?: string | null
                    full_name?: string
                    id?: string
                    phone?: string | null
                    preferences?: Json
                    updated_at?: string
                }
                Relationships: []
            }
            reviews: {
                Row: {
                    approved_by: string | null
                    comment: string | null
                    created_at: string
                    customer_id: string
                    deleted_at: string | null
                    id: string
                    is_approved: boolean
                    order_id: string | null
                    product_id: string
                    rating: number
                    store_id: string
                    title: string | null
                    updated_at: string
                }
                Insert: {
                    approved_by?: string | null
                    comment?: string | null
                    created_at?: string
                    customer_id: string
                    deleted_at?: string | null
                    id?: string
                    is_approved?: boolean
                    order_id?: string | null
                    product_id: string
                    rating: number
                    store_id: string
                    title?: string | null
                    updated_at?: string
                }
                Update: {
                    approved_by?: string | null
                    comment?: string | null
                    created_at?: string
                    customer_id?: string
                    deleted_at?: string | null
                    id?: string
                    is_approved?: boolean
                    order_id?: string | null
                    product_id?: string
                    rating?: number
                    store_id?: string
                    title?: string | null
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "reviews_approved_by_fkey"
                        columns: ["approved_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "reviews_customer_id_fkey"
                        columns: ["customer_id"]
                        isOneToOne: false
                        referencedRelation: "customers"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "reviews_order_id_fkey"
                        columns: ["order_id"]
                        isOneToOne: false
                        referencedRelation: "orders"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "reviews_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "reviews_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
            role_permissions: {
                Row: {
                    permission_id: string
                    role_id: string
                }
                Insert: {
                    permission_id: string
                    role_id: string
                }
                Update: {
                    permission_id?: string
                    role_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "role_permissions_permission_id_fkey"
                        columns: ["permission_id"]
                        isOneToOne: false
                        referencedRelation: "permissions"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "role_permissions_role_id_fkey"
                        columns: ["role_id"]
                        isOneToOne: false
                        referencedRelation: "roles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            roles: {
                Row: {
                    description: string | null
                    id: string
                    name: string
                }
                Insert: {
                    description?: string | null
                    id?: string
                    name: string
                }
                Update: {
                    description?: string | null
                    id?: string
                    name?: string
                }
                Relationships: []
            }
            stores: {
                Row: {
                    address: Json
                    banner_url: string | null
                    cnpj: string | null
                    created_at: string
                    created_by: string | null
                    deleted_at: string | null
                    email: string
                    id: string
                    is_active: boolean
                    logo_url: string | null
                    name: string
                    phone: string | null
                    settings: Json
                    slug: string
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    address?: Json
                    banner_url?: string | null
                    cnpj?: string | null
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    email: string
                    id?: string
                    is_active?: boolean
                    logo_url?: string | null
                    name: string
                    phone?: string | null
                    settings?: Json
                    slug: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    address?: Json
                    banner_url?: string | null
                    cnpj?: string | null
                    created_at?: string
                    created_by?: string | null
                    deleted_at?: string | null
                    email?: string
                    id?: string
                    is_active?: boolean
                    logo_url?: string | null
                    name?: string
                    phone?: string | null
                    settings?: Json
                    slug?: string
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "stores_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "stores_updated_by_fkey"
                        columns: ["updated_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            subscriptions: {
                Row: {
                    cancelled_at: string | null
                    created_at: string
                    created_by: string | null
                    current_period_end: string | null
                    current_period_start: string | null
                    deleted_at: string | null
                    gateway: string | null
                    gateway_subscription_id: string | null
                    id: string
                    plan_id: string
                    status: Database["public"]["Enums"]["subscription_status"]
                    store_id: string
                    trial_ends_at: string | null
                    updated_at: string
                    updated_by: string | null
                }
                Insert: {
                    cancelled_at?: string | null
                    created_at?: string
                    created_by?: string | null
                    current_period_end?: string | null
                    current_period_start?: string | null
                    deleted_at?: string | null
                    gateway?: string | null
                    gateway_subscription_id?: string | null
                    id?: string
                    plan_id: string
                    status?: Database["public"]["Enums"]["subscription_status"]
                    store_id: string
                    trial_ends_at?: string | null
                    updated_at?: string
                    updated_by?: string | null
                }
                Update: {
                    cancelled_at?: string | null
                    created_at?: string
                    created_by?: string | null
                    current_period_end?: string | null
                    current_period_start?: string | null
                    deleted_at?: string | null
                    gateway?: string | null
                    gateway_subscription_id?: string | null
                    id?: string
                    plan_id?: string
                    status?: Database["public"]["Enums"]["subscription_status"]
                    store_id?: string
                    trial_ends_at?: string | null
                    updated_at?: string
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "subscriptions_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "subscriptions_plan_id_fkey"
                        columns: ["plan_id"]
                        isOneToOne: false
                        referencedRelation: "plans"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "subscriptions_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: true
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "subscriptions_updated_by_fkey"
                        columns: ["updated_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            team_members: {
                Row: {
                    created_at: string
                    deleted_at: string | null
                    id: string
                    invited_by: string | null
                    is_active: boolean
                    joined_at: string
                    profile_id: string
                    role: Database["public"]["Enums"]["user_role"]
                    store_id: string
                    updated_at: string
                }
                Insert: {
                    created_at?: string
                    deleted_at?: string | null
                    id?: string
                    invited_by?: string | null
                    is_active?: boolean
                    joined_at?: string
                    profile_id: string
                    role?: Database["public"]["Enums"]["user_role"]
                    store_id: string
                    updated_at?: string
                }
                Update: {
                    created_at?: string
                    deleted_at?: string | null
                    id?: string
                    invited_by?: string | null
                    is_active?: boolean
                    joined_at?: string
                    profile_id?: string
                    role?: Database["public"]["Enums"]["user_role"]
                    store_id?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "team_members_invited_by_fkey"
                        columns: ["invited_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "team_members_profile_id_fkey"
                        columns: ["profile_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "team_members_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: {
            product_stock_balances: {
                Row: {
                    balance: number | null
                    product_id: string | null
                    store_id: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "inventory_movements_product_id_fkey"
                        columns: ["product_id"]
                        isOneToOne: false
                        referencedRelation: "products"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "inventory_movements_store_id_fkey"
                        columns: ["store_id"]
                        isOneToOne: false
                        referencedRelation: "stores"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Functions: {
            anonymize_customer: { Args: { p_customer: string }; Returns: undefined }
            generate_order_number: { Args: { p_store: string }; Returns: string }
            has_store_role: {
                Args: {
                    target_role: Database["public"]["Enums"]["user_role"]
                    target_store_id: string
                }
                Returns: boolean
            }
            is_store_member: { Args: { target_store_id: string }; Returns: boolean }
            show_limit: { Args: never; Returns: number }
            show_trgm: { Args: { "": string }; Returns: string[] }
        }
        Enums: {
            analytics_event_type:
            | "VIEW_PRODUCT"
            | "SEARCH"
            | "OPEN_WHATSAPP"
            | "CHECKOUT"
            | "PURCHASE"
            | "ADD_TO_CART"
            coupon_type: "PERCENTAGE" | "FIXED" | "SHIPPING"
            inventory_movement_type:
            | "ENTRY"
            | "SALE"
            | "ADJUSTMENT"
            | "LOSS"
            | "EXCHANGE"
            | "CANCELLATION"
            order_status: "PENDING" | "PAID" | "CANCELLED" | "DELIVERED" | "REFUNDED"
            payment_status:
            | "PENDING"
            | "APPROVED"
            | "DECLINED"
            | "REFUNDED"
            | "CHARGEBACK"
            plan_tier: "FREE" | "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE"
            product_status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED"
            subscription_status:
            | "ACTIVE"
            | "TRIALING"
            | "PAST_DUE"
            | "CANCELLED"
            | "EXPIRED"
            user_role: "SUDO" | "OWNER" | "ADMIN" | "MANAGER" | "SELLER" | "EDITOR"
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
    DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
}
    ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
    graphql_public: {
        Enums: {},
    },
    public: {
        Enums: {
            analytics_event_type: [
                "VIEW_PRODUCT",
                "SEARCH",
                "OPEN_WHATSAPP",
                "CHECKOUT",
                "PURCHASE",
                "ADD_TO_CART",
            ],
            coupon_type: ["PERCENTAGE", "FIXED", "SHIPPING"],
            inventory_movement_type: [
                "ENTRY",
                "SALE",
                "ADJUSTMENT",
                "LOSS",
                "EXCHANGE",
                "CANCELLATION",
            ],
            order_status: ["PENDING", "PAID", "CANCELLED", "DELIVERED", "REFUNDED"],
            payment_status: [
                "PENDING",
                "APPROVED",
                "DECLINED",
                "REFUNDED",
                "CHARGEBACK",
            ],
            plan_tier: ["FREE", "STARTER", "PRO", "BUSINESS", "ENTERPRISE"],
            product_status: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"],
            subscription_status: [
                "ACTIVE",
                "TRIALING",
                "PAST_DUE",
                "CANCELLED",
                "EXPIRED",
            ],
            user_role: ["OWNER", "ADMIN", "MANAGER", "SELLER", "EDITOR"],
        },
    },
} as const
