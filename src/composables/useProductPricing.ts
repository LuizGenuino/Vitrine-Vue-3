import { computed } from 'vue';
import type { Product } from '@/types';

export const useProductPricing = (product: () => Partial<Product> | null | undefined) => {
  const hasPromotion = computed(() => {
    const current = product();
    return Boolean(current?.compareAtPrice && current.price && current.compareAtPrice > current.price);
  });

  const discountPercentage = computed(() => {
    const current = product();
    if (!current?.compareAtPrice || !current.price || current.compareAtPrice <= current.price) return 0;
    return Math.round(((current.compareAtPrice - current.price) / current.compareAtPrice) * 100);
  });

  const isLowStock = computed(() => {
    const current = product();
    return Number(current?.quantity || 0) > 0 && Number(current?.quantity || 0) <= 5;
  });

  return {
    hasPromotion,
    discountPercentage,
    isLowStock,
  };
};
