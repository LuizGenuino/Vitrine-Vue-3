<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
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

// Componentes
import AppSectionCard from '@/components/base/AppSectionCard.vue';
import ColorPickerField from '@/components/base/ColorPickerField.vue';
import DashboardPreviewPanel from '@/components/dashboard/DashboardPreviewPanel.vue';
import OnboardingChecklist from '@/components/dashboard/OnboardingChecklist.vue';
import type { StoreSettings, StoreSettingsForm } from '@/types';

const authStore = useAuthStore();
const useStore = useStorefrontStore();
const { loading, error, run } = useAsyncState();
const { uploading, uploadMany } = useImageUpload();
const success = ref('');
const categoriesCount = ref(0);
const productsCount = ref(0);
const logoInput = ref<HTMLInputElement | null>(null);
const bannerInput = ref<HTMLInputElement | null>(null);

const form = reactive<StoreSettingsForm>({
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

// --- LOGIC: Readiness & Plan ---
const { steps, completion } = useStoreReadiness({
    settings: () => useStore.settings,
    categoriesCount: () => categoriesCount.value,
    productsCount: () => productsCount.value,
});

const activePlan = computed(() => planService.getById(form.activePlanId));
const { productLimitLabel, usagePercent } = usePlanAccess(
    computed(() => form.activePlanId),
    productsCount,
);

// --- ACTIONS ---
function patchForm(payload: Partial<StoreSettings>) {
    Object.assign(form, payload);
    // Sync em tempo real com o Store para o Preview
    useStore.patchSettings(payload);
}

async function loadCounts(ownerId: string) {
    const [categories, products] = await Promise.all([
        categoryService.listCategories(ownerId),
        productService.listByOwner(ownerId),
    ]);

    categoriesCount.value = categories.length;
    productsCount.value = products.length;

    const formdata = {
        ownerId: ownerId,
        slug: useStore.settings.slug,
        storeName: useStore.settings.storeName,
        title: useStore.settings.title,
        subtitle: useStore.settings.subtitle,
        primaryColor: useStore.settings.branding.primaryColor,
        secondaryColor: useStore.settings.branding.secondaryColor,
        logoUrl: useStore.settings.branding.logoUrl,
        bannerUrl: useStore.settings.branding.bannerUrl,
        whatsappNumber: useStore.settings.channels.whatsappNumber,
        activePlanId: useStore.settings.planSnapshot?.name,
    } as StoreSettingsForm
    patchForm(formdata);
}

onMounted(async () => {
    await authStore.init();
    if (!authStore.user?.uid) return;
    await loadCounts(authStore.user.uid);
});

const publicUrl = computed(() => (form.slug ? `${window.location.origin}/s/${form.slug}` : ''));
const suggestedSlug = computed(() => slugify(form.storeName || 'minha-loja'));

async function onFileSelected(event: any, field: 'logoUrl' | 'bannerUrl', folder: 'logos' | 'banners') {
    const file = event.target.files[0];
    if (!file || !authStore.user?.uid) return;

    await run(async () => {
        const [imageUrl] = await uploadMany(authStore.user!.uid, folder, [file]);
        patchForm({ [field]: imageUrl });
        success.value = "Imagem atualizada com sucesso!";
    });
}

async function copyUrl() {
    await navigator.clipboard.writeText(publicUrl.value);
    success.value = "Link copiado!";
    setTimeout(() => success.value = '', 3000);
}

async function handleSave() {
    await run(async () => {
        const payload = {
            ownerId: form.ownerId,
            slug: form.slug || suggestedSlug.value,
            storeName: form.storeName,
            title: form.title,
            subtitle: form.subtitle,
            branding: {
                logoUrl: form.logoUrl,
                bannerUrl: form.bannerUrl,
                primaryColor: form.primaryColor,
                secondaryColor: form.secondaryColor,
            },
            channels: {
                whatsappNumber: form.whatsappNumber
            }
        };
        await storeService.save(payload);
        success.value = 'Configurações salvas!';
    });
}
</script>

<template>
    <v-row>
        <v-col cols="12" lg="7">
            <div class="d-flex flex-column ga-6 pb-16">

                <v-card rounded="xl" border flat class="pa-6">
                    <v-row align="center" dense>
                        <v-col cols="12" md="6">
                            <div class="text-caption font-weight-bold text-uppercase opacity-60">Status de Prontidão
                            </div>
                            <div class="d-flex align-center ga-3 mt-1">
                                <v-progress-linear :model-value="completion" color="primary" height="8" rounded />
                                <span class="text-caption font-weight-black">{{ completion }}%</span>
                            </div>
                        </v-col>
                        <v-divider vertical inset class="mx-4 hidden-sm-and-down"></v-divider>
                        <v-col cols="12" md="5">
                            <div class="text-caption font-weight-bold text-uppercase opacity-60">Plano {{
                                activePlan.name }}</div>
                            <div class="text-body-2 mt-1">
                                {{ productsCount }}/{{ productLimitLabel }} produtos usados
                            </div>
                        </v-col>
                    </v-row>
                </v-card>

                <AppSectionCard title="Sua Marca" subtitle="Como o mundo verá sua loja.">
                    <v-row>
                        <v-col cols="12" class="d-flex justify-center mb-4">
                            <div class="logo-upload-wrapper">
                                <v-avatar size="100" class="elevation-4 border-2" color="grey-lighten-4">
                                    <v-img v-if="form.logoUrl" :src="form.logoUrl" cover />
                                    <v-icon v-else icon="mdi-storefront-outline" size="40" color="medium-emphasis" />
                                    <div class="upload-overlay" @click="logoInput?.click()">
                                        <v-icon icon="mdi-camera" color="white" />
                                    </div>
                                </v-avatar>
                                <input ref="logoInput" type="file" class="d-none" accept="image/*"
                                    @change="onFileSelected($event, 'logoUrl', 'logos')">
                                <div class="text-caption text-center mt-2 font-weight-bold">Logo da Loja</div>
                            </div>
                        </v-col>

                        <v-col cols="12">
                            <v-text-field v-model="form.storeName" label="Nome Comercial" variant="outlined"
                                rounded="lg" />
                        </v-col>

                        <v-col cols="12" md="6">
                            <v-text-field v-model="form.slug" label="Endereço (Link)" prefix="viladigital.com.br/s/"
                                variant="outlined" rounded="lg" :hint="`Sugestão: ${suggestedSlug}`" persistent-hint />
                        </v-col>

                        <v-col cols="12" md="6">
                            <v-text-field v-model="form.whatsappNumber" label="WhatsApp de Vendas" variant="outlined"
                                rounded="lg" prepend-inner-icon="mdi-whatsapp" />
                        </v-col>
                    </v-row>
                </AppSectionCard>

                <AppSectionCard title="Layout & Cores" subtitle="Personalize as cores para combinar com seu produto.">
                    <v-row>
                        <v-col cols="12" md="6">
                            <ColorPickerField v-model="form.primaryColor" label="Cor Principal" />
                        </v-col>
                        <v-col cols="12" md="6">
                            <ColorPickerField v-model="form.secondaryColor" label="Cor Secundária" />
                        </v-col>
                        <v-col cols="12">
                            <v-text-field v-model="form.title" label="Título do Banner" variant="outlined"
                                rounded="lg" />
                        </v-col>
                        <v-col cols="12">
                            <v-textarea v-model="form.subtitle" label="Subtítulo ou Descrição da Loja"
                                variant="outlined" rounded="lg" rows="3" />
                        </v-col>

                        <v-col cols="12">
                            <v-card border flat class="pa-4 rounded-xl d-flex align-center ga-4 bg-grey-lighten-5">
                                <v-icon icon="mdi-image-outline" size="32" color="primary" />
                                <div class="flex-grow-1">
                                    <div class="text-subtitle-2 font-weight-bold">Banner de Fundo</div>
                                    <div class="text-caption hidden-sm-and-down">Imagem panorâmica para o topo da vitrine</div>
                                </div>
                                <v-btn variant="flat" color="primary" rounded="pill" size="small"
                                    @click="bannerInput?.click()">
                                    {{ form.bannerUrl ? 'Trocar' : 'Subir Imagem' }}
                                </v-btn>
                                <input ref="bannerInput" type="file" class="d-none" accept="image/*"
                                    @change="onFileSelected($event, 'bannerUrl', 'banners')">
                            </v-card>
                        </v-col>
                    </v-row>
                </AppSectionCard>

                <div class="d-flex ga-3 mt-4">
                    <v-btn color="primary" size="large" block rounded="pill" elevation="8" :loading="loading"
                        @click="handleSave">
                        Salvar Todas as Alterações
                    </v-btn>
                </div>
            </div>
        </v-col>

        <v-col cols="12" lg="5" class="hidden-md-and-down">
            <div class="sticky-preview">
                <v-card rounded="xl" border flat class="pa-0 overflow-hidden shadow-lg">
                    <div class="pa-4 bg-surface border-b d-flex align-center justify-space-between">
                        <span class="text-caption font-weight-black text-uppercase">Preview em Tempo Real</span>
                        <v-btn icon="mdi-content-copy" size="x-small" variant="tonal" @click="copyUrl"></v-btn>
                    </div>

                    <div class="preview-browser-content bg-grey-lighten-4">
                        <DashboardPreviewPanel :settings="form" />
                    </div>

                    <div class="pa-4">
                        <OnboardingChecklist :completion="completion" :steps="steps" title="Passos para o Sucesso" />
                    </div>
                </v-card>
            </div>
        </v-col>

        <v-snackbar :v-model="!!success" color="success" rounded="pill" elevation="24">
            {{ success }}
        </v-snackbar>
    </v-row>
</template>

<style scoped>
.sticky-preview {
    position: sticky;
    top: 100px;
    z-index: 10;
}

.logo-upload-wrapper {
    position: relative;
    cursor: pointer;
}

.upload-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s;
    border-radius: 50%;
}

.logo-upload-wrapper:hover .upload-overlay {
    opacity: 1;
}

.preview-browser-content {
    max-height: 500px;
    overflow-y: auto;
}

/* Scrollbar fina para o preview */
.preview-browser-content::-webkit-scrollbar {
    width: 4px;
}

.preview-browser-content::-webkit-scrollbar-thumb {
    background: rgba(var(--v-theme-primary), 0.2);
    border-radius: 10px;
}
</style>