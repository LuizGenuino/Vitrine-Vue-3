import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { Category, Product, StoreSettings, StoreSettingsForm } from '@/types';
import { storeService } from '@/services/storeService';
import { createDefaultSettings } from './storefrontFactory';
import { categoryService } from '@/services/categoryService';
import { productService } from '@/services/productService';

export const useStorefrontStore = defineStore('storefront', () => {
    // --- STATE ---
    const settings = ref<StoreSettings>(createDefaultSettings());
    const products = ref<Product[]>([]);
    const categories = ref<Category[]>([]);
    const loading = ref(false);
    const isInitialized = ref(false);
    const error = shallowRef<string | null>(null);

    // --- COMPOSITION: Theme Management ---
    const themeStyles = computed(() => ({
        '--brand-primary': settings.value.branding.primaryColor,
        '--brand-secondary': settings.value.branding.secondaryColor,
    }));

    // --- ACTIONS: Private Fetchers ---
    async function internalLoad(fetcher: () => Promise<StoreSettings | null>) {
        loading.value = true;
        error.value = null;
        try {
            const data = await fetcher();
            if (data) {
                settings.value = {
                    ...data,
                    activePlanId: data.activePlanId || 'free'
                };
            }
        } catch (e: any) {
            error.value = e.message || 'Falha ao carregar configurações';
        } finally {
            loading.value = false;
            isInitialized.value = true;
        }
    }

    async function loadDataStore(uid: string) {
        if (!uid) return;
        loading.value = true;
        try {
            const [catData, prodData] = await Promise.all([
                categoryService.listCategories(uid),
                productService.listByOwner(uid),
            ]);
            categories.value = catData;
            products.value = prodData;
        } catch (e) {
            console.error("Erro ao carregar dashboard", e);
        } finally {
            loading.value = false;
        }
    }

    // --- BOOTSTRAP LOGIC ---
    /**
     * O Bootstrap decide a estratégia de carregamento baseada no contexto.
     * Pode ser chamado no App.vue ou num Navigation Guard.
     */
    async function bootstrap(context: { ownerId?: string; slug?: string }) {
        if (isInitialized.value && !context.ownerId && !context.slug) return;

        if (context.ownerId) {
            await internalLoad(() => storeService.getByOwner(context.ownerId!));
            await loadDataStore(context.ownerId)
        } else if (context.slug) {
            await internalLoad(() => storeService.getBySlug(context.slug!));
        }
    }

    // --- MUTATIONS ---
    function patchSettings(payload: Partial<StoreSettingsForm>) {
        settings.value = {
            ...settings.value,
            ...payload,
            activePlanId: payload.activePlanId || settings.value.activePlanId
        };
    }

    function reset() {
        settings.value = createDefaultSettings();
        isInitialized.value = false;
    }

    return {
        // State (Readonly na medida do possível)
        settings,
        loading,
        isInitialized,
        error,
        themeStyles,
        products,
        categories,
        store: {
            products: products.value,
            categories: categories.value,
        },
        // Logic
        bootstrap,
        patchSettings,
        loadDataStore,
        reset
    };
});