import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import { planService } from '@/services/planService';

export const usePlanAccess = (
  planId: MaybeRefOrGetter<string | undefined>,
  productCount: MaybeRefOrGetter<number>,
) => {
  const currentPlan = computed(() => planService.getById(toValue(planId)));
  const currentCount = computed(() => Number(toValue(productCount) || 0));
  const productLimitLabel = computed(() => planService.getLimitLabel(currentPlan.value.productLimit));
  const remainingProducts = computed(() => planService.getRemainingSlots(currentPlan.value.id, currentCount.value));
  const usagePercent = computed(() => planService.getUsagePercent(currentPlan.value.id, currentCount.value));
  const canCreateProduct = computed(() => planService.isWithinProductLimit(currentPlan.value.id, currentCount.value));
  const isNearLimit = computed(() => currentPlan.value.productLimit < 999999 && usagePercent.value >= 80 && canCreateProduct.value);
  const isLimitReached = computed(() => !canCreateProduct.value);

  return {
    currentPlan,
    currentCount,
    productLimitLabel,
    remainingProducts,
    usagePercent,
    canCreateProduct,
    isNearLimit,
    isLimitReached,
  };
};
