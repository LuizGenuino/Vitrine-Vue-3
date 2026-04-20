<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useStorefrontStore } from '@/stores/storefront';
import { storeService } from '@/services/storeService';
import { categoryService } from '@/services/categoryService';
import { productService } from '@/services/productService';
import { planService } from '@/services/planService';
import { useAsyncState } from '@/composables/useAsyncState';
import { useImageUpload } from '@/composables/useImageUpload';
import { useStoreReadiness } from '@/composables/useStoreReadiness';
import { usePlanAccess } from '@/composables/usePlanAccess';
import { slugify } from '@/utils/format';
import AppSectionCard from '@/components/base/AppSectionCard.vue';
import AppTextField from '@/components/base/AppTextField.vue';
import ColorPickerField from '@/components/base/ColorPickerField.vue';
import DashboardPreviewPanel from '@/components/dashboard/DashboardPreviewPanel.vue';
import OnboardingChecklist from '@/components/dashboard/OnboardingChecklist.vue';
import type { StoreSettings } from '@/types';

const authStore = useAuthStore();
const storefrontStore = useStorefrontStore();
const { loading, error, run } = useAsyncState();
const { uploading, uploadMany } = useImageUpload();
const success = ref('');
const categoriesCount = ref(0);
const productsCount = ref(0);

const form = reactive<StoreSettings>({
  ownerId: '',
  slug: '',
  storeName: '',
  title: '',
  subtitle: '',
  primaryColor: '#4F46E5',
  secondaryColor: '#14B8A6',
  logoUrl: '',
  bannerUrl: '',
  whatsappNumber: '',
  activePlanId: 'free',
});

const { steps, completion } = useStoreReadiness({
  settings: () => form,
  categoriesCount: () => categoriesCount.value,
  productsCount: () => productsCount.value,
});

const activePlan = computed(() => planService.getById(form.activePlanId));
const { productLimitLabel, usagePercent, remainingProducts } = usePlanAccess(
  computed(() => form.activePlanId),
  productsCount,
);

function patchForm(payload: Partial<StoreSettings>) {
  Object.assign(form, payload);
  storefrontStore.patch(payload);
}

async function loadCounts(ownerId: string) {
  const [categories, products] = await Promise.all([
    categoryService.listCategories(ownerId),
    productService.listByOwner(ownerId),
  ]);
  categoriesCount.value = categories.length;
  productsCount.value = products.length;
}

onMounted(async () => {
  authStore.init();
  if (!authStore.user?.uid) return;
  await storefrontStore.loadByOwner(authStore.user.uid);
  patchForm({ ...storefrontStore.settings, ownerId: authStore.user.uid, activePlanId: storefrontStore.settings.activePlanId || 'free' });
  await loadCounts(authStore.user.uid);
});

const publicUrl = computed(() => (form.slug ? `${window.location.origin}/s/${form.slug}` : ''));
const suggestedSlug = computed(() => slugify(form.storeName || 'minha-loja'));

async function handleImageUpload(event: Event, field: 'logoUrl' | 'bannerUrl', folder: 'logos' | 'banners') {
  const files = (event.target as HTMLInputElement).files;
  if (!files?.length || !authStore.user?.uid) return;
  const [imageUrl] = await uploadMany(authStore.user.uid, folder, [files[0]]);
  patchForm({ [field]: imageUrl });
}

async function copyPublicUrl() {
  if (!publicUrl.value) return;
  await navigator.clipboard.writeText(publicUrl.value);
  success.value = 'Link público copiado para a área de transferência.';
}

async function handleSave() {
  success.value = '';
  await run(async () => {
    const ownerId = authStore.user?.uid || '';
    const payload: StoreSettings = {
      ...form,
      ownerId,
      activePlanId: form.activePlanId || 'free',
      slug: form.slug || suggestedSlug.value,
    };
    const id = await storeService.save(payload);
    patchForm({ ...payload, id });
    success.value = 'Configurações salvas com sucesso.';
  });
}
</script>

<template>
  <v-row>
    <v-col cols="12" lg="7">
      <div class="d-flex flex-column ga-6">
        <v-card class="glass-panel pa-5 pa-md-6">
          <div class="d-flex flex-column flex-md-row justify-space-between align-start ga-4">
            <div>
              <div class="section-title">Status da vitrine</div>
              <div class="section-subtitle mt-1">Acompanhe rapidamente o quanto sua operação está pronta para ir ao ar.</div>
            </div>
            <v-chip color="primary" variant="tonal">{{ completion }}% concluído</v-chip>
          </div>
          <v-progress-linear :model-value="completion" color="primary" height="10" rounded class="mt-4" />
        </v-card>

        <AppSectionCard title="Plano ativo" subtitle="A camada SaaS já está pronta para a versão final sem alterar o funcionamento atual.">
          <div class="d-flex flex-column flex-md-row justify-space-between align-start ga-4">
            <div>
              <div class="text-h6 font-weight-bold">{{ activePlan.name }}</div>
              <div class="text-body-2 text-medium-emphasis mt-1">{{ activePlan.tagline }}</div>
              <div class="text-body-2 text-medium-emphasis mt-2">{{ productsCount }} produtos cadastrados · limite {{ productLimitLabel }}</div>
            </div>
            <v-btn variant="outlined" :to="{ name: 'dashboard-plans' }">Gerenciar planos</v-btn>
          </div>
          <v-progress-linear :model-value="usagePercent" color="primary" height="8" rounded class="mt-4 mb-3" />
          <v-alert variant="tonal" type="info">
            {{ activePlan.productLimit >= 999999 ? 'Seu plano atual já está sem limitação prática.' : `${remainingProducts} vagas disponíveis antes da necessidade de upgrade.` }}
          </v-alert>
        </AppSectionCard>

        <AppSectionCard title="Identidade da loja" subtitle="Organize sua marca com clareza visual e consistência.">
          <v-row>
            <v-col cols="12" md="6">
              <AppTextField v-model="form.storeName" label="Nome da loja" @update:model-value="storefrontStore.patch({ storeName: String($event) })" />
            </v-col>
            <v-col cols="12" md="6">
              <AppTextField v-model="form.slug" label="Slug público" hint="Ex: minha-loja" @update:model-value="storefrontStore.patch({ slug: String($event) })" />
            </v-col>
            <v-col cols="12">
              <v-alert variant="tonal" type="info">Sugestão automática de slug: <strong>{{ suggestedSlug }}</strong></v-alert>
            </v-col>
            <v-col cols="12">
              <AppTextField v-model="form.title" label="Título principal" @update:model-value="storefrontStore.patch({ title: String($event) })" />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="form.subtitle" label="Subtítulo" rows="3" @update:model-value="storefrontStore.patch({ subtitle: String($event) })" />
            </v-col>
            <v-col cols="12" md="6">
              <AppTextField v-model="form.whatsappNumber" label="WhatsApp" hint="Formato internacional ou nacional" @update:model-value="storefrontStore.patch({ whatsappNumber: String($event) })" />
            </v-col>
            <v-col cols="12" md="6">
              <v-file-input label="Logo da loja" accept="image/*" show-size @change="handleImageUpload($event, 'logoUrl', 'logos')" :loading="uploading" />
            </v-col>
          </v-row>
        </AppSectionCard>

        <AppSectionCard title="Visual premium" subtitle="Aprimore percepção de marca com banner e paleta consistente.">
          <v-row>
            <v-col cols="12" md="6">
              <ColorPickerField v-model="form.primaryColor" label="Cor primária" @update:model-value="storefrontStore.patch({ primaryColor: $event })" />
            </v-col>
            <v-col cols="12" md="6">
              <ColorPickerField v-model="form.secondaryColor" label="Cor secundária" @update:model-value="storefrontStore.patch({ secondaryColor: $event })" />
            </v-col>
            <v-col cols="12">
              <v-file-input label="Banner opcional" accept="image/*" show-size @change="handleImageUpload($event, 'bannerUrl', 'banners')" :loading="uploading" />
            </v-col>
          </v-row>
        </AppSectionCard>

        <AppSectionCard title="Publicação" subtitle="Acesse rapidamente o link da vitrine e distribua para clientes.">
          <div class="d-flex flex-column flex-md-row ga-3 align-start align-md-center">
            <v-text-field :model-value="publicUrl" label="URL pública" readonly class="flex-grow-1" />
            <v-btn color="primary" :disabled="!publicUrl" @click="copyPublicUrl">Copiar link</v-btn>
          </div>
        </AppSectionCard>

        <div>
          <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
          <v-alert v-if="success" type="success" variant="tonal" class="mb-4">{{ success }}</v-alert>
          <div class="d-flex flex-wrap ga-3">
            <v-btn color="primary" size="large" :loading="loading || uploading" @click="handleSave">Salvar configurações</v-btn>
            <v-btn v-if="publicUrl" variant="outlined" :href="publicUrl" target="_blank">Abrir vitrine pública</v-btn>
          </div>
        </div>
      </div>
    </v-col>

    <v-col cols="12" lg="5">
      <div class="d-flex flex-column ga-6">
        <DashboardPreviewPanel :settings="form" />
        <OnboardingChecklist :completion="completion" :steps="steps" title="Checklist lateral" />
      </div>
    </v-col>
  </v-row>
</template>
