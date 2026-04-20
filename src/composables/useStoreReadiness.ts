import { computed } from 'vue';
import type { StoreSettings } from '@/types';

interface UseStoreReadinessOptions {
  settings: () => Partial<StoreSettings>;
  categoriesCount: () => number;
  productsCount: () => number;
}

export const useStoreReadiness = (options: UseStoreReadinessOptions) => {
  const steps = computed(() => {
    const settings = options.settings();

    return [
      {
        key: 'identity',
        title: 'Identidade principal',
        description: 'Nome da loja, título e subtítulo com proposta de valor clara.',
        done: Boolean(settings.storeName && settings.title && settings.subtitle),
      },
      {
        key: 'channel',
        title: 'Canal de venda',
        description: 'WhatsApp configurado para gerar links de compra imediata.',
        done: Boolean(settings.whatsappNumber),
      },
      {
        key: 'branding',
        title: 'Identidade visual',
        description: 'Logo e paleta para transmitir confiança e reconhecimento.',
        done: Boolean(settings.logoUrl && settings.primaryColor && settings.secondaryColor),
      },
      {
        key: 'plan',
        title: 'Plano selecionado',
        description: 'Camada SaaS preparada com plano ativo e evolução pronta para assinatura.',
        done: Boolean(settings.activePlanId),
      },
      {
        key: 'catalog-structure',
        title: 'Estrutura de catálogo',
        description: 'Categorias e subcategorias prontas para melhorar navegação.',
        done: options.categoriesCount() > 0,
      },
      {
        key: 'catalog-content',
        title: 'Produtos publicados',
        description: 'Ao menos um item ativo para a vitrine pública.',
        done: options.productsCount() > 0,
      },
      {
        key: 'premium-touch',
        title: 'Banner premium',
        description: 'Banner opcional para reforçar posicionamento e percepção de marca.',
        done: Boolean(settings.bannerUrl),
        optional: true,
      },
    ];
  });

  const completion = computed(() => {
    const nonOptional = steps.value.filter((step) => !step.optional);
    const done = nonOptional.filter((step) => step.done).length;
    return Math.round((done / Math.max(nonOptional.length, 1)) * 100);
  });

  const readyToLaunch = computed(() => completion.value === 100);

  return {
    steps,
    completion,
    readyToLaunch,
  };
};
