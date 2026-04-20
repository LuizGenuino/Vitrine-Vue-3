import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { StoreSettings } from '@/types';
import { storeService } from '@/services/storeService';

const defaultSettings: StoreSettings = {
  ownerId: '',
  slug: '',
  storeName: 'Sua vitrine',
  title: 'Produtos com apresentação premium',
  subtitle: 'Personalize a experiência e venda rápido pelo WhatsApp.',
  primaryColor: '#4F46E5',
  secondaryColor: '#14B8A6',
  whatsappNumber: '',
  activePlanId: 'free',
};

export const useStorefrontStore = defineStore('storefront', () => {
  const settings = ref<StoreSettings>({ ...defaultSettings });
  const loading = ref(false);

  const themeStyles = computed(() => ({
    '--brand-primary': settings.value.primaryColor,
    '--brand-secondary': settings.value.secondaryColor,
  }));

  async function loadByOwner(ownerId: string) {
    loading.value = true;
    try {
      settings.value = (await storeService.getByOwner(ownerId)) || { ...defaultSettings, ownerId };
      settings.value.activePlanId = settings.value.activePlanId || 'free';
    } finally {
      loading.value = false;
    }
  }

  async function loadBySlug(slug: string) {
    loading.value = true;
    try {
      settings.value = (await storeService.getBySlug(slug)) || { ...defaultSettings, slug };
      settings.value.activePlanId = settings.value.activePlanId || 'free';
    } finally {
      loading.value = false;
    }
  }

  function patch(payload: Partial<StoreSettings>) {
    settings.value = { ...settings.value, ...payload, activePlanId: payload.activePlanId || settings.value.activePlanId || 'free' };
  }

  return { settings, loading, themeStyles, loadByOwner, loadBySlug, patch };
});
