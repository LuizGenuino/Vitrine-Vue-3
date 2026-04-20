import type { SubscriptionPlan } from '@/types';

const UNLIMITED_LIMIT = 999999;

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    priceLabel: 'Grátis',
    productLimit: 25,
    tagline: 'Para validar a operação e rodar a vitrine atual sem custo.',
    description: 'Plano gratuito ativo por padrão, ideal para testes reais de catálogo e vendas pelo WhatsApp.',
    features: [
      'Até 25 produtos cadastrados',
      'Dashboard completo com branding, categorias e produtos',
      'Vitrine pública com busca, filtros e carrinho local',
      'Checkout simples via WhatsApp',
    ],
    availableForCheckout: true,
  },
  {
    id: 'starter',
    name: 'Starter',
    priceLabel: 'Em breve',
    productLimit: 100,
    tagline: 'Para marcas em crescimento com catálogo mais amplo.',
    description: 'Estrutura preparada para futura monetização, com espaço para mais produtos e recursos comerciais.',
    features: [
      'Até 100 produtos',
      'Base para recursos promocionais',
      'Pronto para domínio customizado',
      'Estrutura pronta para relatórios evoluídos',
    ],
    recommended: true,
    availableForCheckout: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    priceLabel: 'Em breve',
    productLimit: 500,
    tagline: 'Para operações robustas e catálogos maiores.',
    description: 'Camada intermediária pronta para a versão final com mais escala e elasticidade comercial.',
    features: [
      'Até 500 produtos',
      'Mais espaço para campanhas e destaques',
      'Estrutura preparada para automações futuras',
      'Base pronta para upgrades operacionais',
    ],
    availableForCheckout: false,
  },
  {
    id: 'scale',
    name: 'Scale',
    priceLabel: 'Em breve',
    productLimit: UNLIMITED_LIMIT,
    tagline: 'Para operação madura com expansão ampla.',
    description: 'Plano enterprise-ready preparado para a etapa final do SaaS com catálogos praticamente ilimitados.',
    features: [
      'Produtos praticamente ilimitados',
      'Base pronta para recursos premium',
      'Estrutura preparada para times maiores',
      'Escalabilidade pensada para evolução contínua',
    ],
    availableForCheckout: false,
  },
];

export const planService = {
  list() {
    return SUBSCRIPTION_PLANS;
  },
  getById(planId?: string) {
    return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId) || SUBSCRIPTION_PLANS[0];
  },
  getLimitLabel(limit: number) {
    return limit >= UNLIMITED_LIMIT ? 'Ilimitado' : `${limit}`;
  },
  isWithinProductLimit(planId: string | undefined, productCount: number) {
    const plan = this.getById(planId);
    return plan.productLimit >= UNLIMITED_LIMIT || productCount < plan.productLimit;
  },
  getRemainingSlots(planId: string | undefined, productCount: number) {
    const plan = this.getById(planId);
    if (plan.productLimit >= UNLIMITED_LIMIT) return UNLIMITED_LIMIT;
    return Math.max(plan.productLimit - productCount, 0);
  },
  getUsagePercent(planId: string | undefined, productCount: number) {
    const plan = this.getById(planId);
    if (plan.productLimit >= UNLIMITED_LIMIT) return 0;
    return Math.min(Math.round((productCount / Math.max(plan.productLimit, 1)) * 100), 100);
  },
};
