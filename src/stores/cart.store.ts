// src/stores/cart.store.ts
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useStorefrontStore } from './storefront.store'

export interface CartItem {
    product_id: string
    name: string
    sku: string
    price: number
    quantity: number
    image_url: string | null
}

export const useCartStore = defineStore('cart', () => {
    const items = ref<CartItem[]>([])
    const sf = useStorefrontStore()

    const storageKey = computed(() =>
        sf.store ? `vibestore-cart-${sf.store.id}` : null,
    )

    // Sync com localStorage sempre que muda de loja ou carrinho
    watch([storageKey, items], ([key]) => {
        if (!key) return
        localStorage.setItem(key, JSON.stringify(items.value))
    }, { deep: true })

    // Carrega ao trocar de loja
    watch(storageKey, (key) => {
        if (!key) { items.value = []; return }
        const raw = localStorage.getItem(key)
        items.value = raw ? JSON.parse(raw) : []
    }, { immediate: true })

    const itemCount = computed(() =>
        items.value.reduce((s, i) => s + i.quantity, 0),
    )

    const subtotal = computed(() =>
        items.value.reduce((s, i) => s + i.price * i.quantity, 0),
    )

    function addItem(item: Omit<CartItem, 'quantity'>, qty = 1) {
        const existing = items.value.find(i => i.product_id === item.product_id)
        if (existing) {
            existing.quantity += qty
        } else {
            items.value.push({ ...item, quantity: qty })
        }
        sf.trackEvent({ eventType: 'ADD_TO_CART', productId: item.product_id })
    }

    function updateQuantity(productId: string, qty: number) {
        const item = items.value.find(i => i.product_id === productId)
        if (!item) return
        if (qty <= 0) return removeItem(productId)
        item.quantity = qty
    }

    function removeItem(productId: string) {
        items.value = items.value.filter(i => i.product_id !== productId)
    }

    function clear() {
        items.value = []
    }

    return {
        items, itemCount, subtotal,
        addItem, updateQuantity, removeItem, clear,
    }
})
