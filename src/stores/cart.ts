import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { CartItem } from '@/types';

const CART_STORAGE_KEY = 'saas-showcase-cart';

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]'));

  watch(
    items,
    (value) => localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(value)),
    { deep: true },
  );

  const total = computed(() => items.value.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const count = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0));

  function itemsByStore(storeSlug: string) {
    return items.value.filter((item) => item.storeSlug === storeSlug);
  }

  function countByStore(storeSlug: string) {
    return itemsByStore(storeSlug).reduce((sum, item) => sum + item.quantity, 0);
  }

  function totalByStore(storeSlug: string) {
    return itemsByStore(storeSlug).reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  function addItem(payload: CartItem) {
    const existing = items.value.find(
      (item) => item.productId === payload.productId && item.storeSlug === payload.storeSlug,
    );
    if (existing) {
      existing.quantity += payload.quantity;
      return;
    }
    items.value.push(payload);
  }

  function updateQuantity(productId: string, quantity: number, storeSlug?: string) {
    const target = items.value.find((item) => item.productId === productId && (!storeSlug || item.storeSlug === storeSlug));
    if (!target) return;
    target.quantity = Math.max(1, quantity);
  }

  function removeItem(productId: string, storeSlug?: string) {
    items.value = items.value.filter((item) => !(item.productId === productId && (!storeSlug || item.storeSlug === storeSlug)));
  }

  function clear() {
    items.value = [];
  }

  return { items, total, count, itemsByStore, countByStore, totalByStore, addItem, updateQuantity, removeItem, clear };
});
