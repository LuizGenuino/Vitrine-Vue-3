import { computed, ref } from 'vue';
import type { Product, ProductFilters } from '@/types';

const initialFilters: ProductFilters = {
  search: '',
  categoryId: null,
  subcategoryId: null,
  sort: 'featured',
};

export const useProductFilters = (productsSource: () => Product[]) => {
  const filters = ref<ProductFilters>({ ...initialFilters });

  const filteredProducts = computed(() => {
    const products = [...productsSource()];
    const search = filters.value.search.toLowerCase().trim();

    let result = products.filter((product) => {
      const matchesSearch = !search || product.name.toLowerCase().includes(search);
      const matchesCategory = !filters.value.categoryId || product.categoryId === filters.value.categoryId;
      const matchesSubcategory = !filters.value.subcategoryId || product.subcategoryId === filters.value.subcategoryId;
      return matchesSearch && matchesCategory && matchesSubcategory;
    });

    switch (filters.value.sort) {
      case 'price-asc':
        result = result.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        result = result.sort((a, b) => b.price - a.price);
        break;
      case 'name-asc':
        result = result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        break;
    }

    return result;
  });

  return { filters, filteredProducts };
};
