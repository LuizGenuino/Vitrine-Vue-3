import type { StoreSettings } from '@/types';

export const createDefaultSettings = (overrides: Partial<StoreSettings> = {}): StoreSettings => ({
    ownerId: '',
    slug: '',
    storeName: 'Sua vitrine',
    title: 'Produtos com apresentação premium',
    subtitle: 'Personalize a experiência e venda rápido pelo WhatsApp.',
    primaryColor: '#4F46E5',
    secondaryColor: '#14B8A6',
    whatsappNumber: '',
    activePlanId: 'free',
    ...overrides,
});