<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { storesService } from '@/services/stores.service'
import { storageService } from '@/services/storage.service'
import { supabase } from '@/lib/supabase'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const notify = useNotifications()

const { user, profile, stores } = storeToRefs(auth)

const STORAGE_KEY = 'vibestore-onboarding-draft'

/* -------------------------------------------------------------------------- */
/*  Utils                                                                     */
/* -------------------------------------------------------------------------- */

function slugify(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
}

/* -------------------------------------------------------------------------- */
/*  Segmentos de negócio (pré-configurações inteligentes)                     */
/* -------------------------------------------------------------------------- */

interface BusinessSegment {
    key: string
    label: string
    icon: string
    color: string
    emoji: string
    suggestedCategories: string[]
    suggestedTheme: string
}

const segments: BusinessSegment[] = [
    {
        key: 'fashion',
        label: 'Moda e vestuário',
        icon: 'mdi-tshirt-crew-outline',
        color: 'pink',
        emoji: '👗',
        suggestedCategories: ['Camisetas', 'Calças', 'Calçados', 'Acessórios', 'Promoções'],
        suggestedTheme: '#ec4899',
    },
    {
        key: 'food',
        label: 'Alimentação',
        icon: 'mdi-food-outline',
        color: 'orange',
        emoji: '🍔',
        suggestedCategories: ['Lanches', 'Bebidas', 'Sobremesas', 'Combos', 'Promoções'],
        suggestedTheme: '#f59e0b',
    },
    {
        key: 'beauty',
        label: 'Beleza e cosméticos',
        icon: 'mdi-lipstick',
        color: 'purple',
        emoji: '💄',
        suggestedCategories: ['Maquiagem', 'Skincare', 'Cabelos', 'Perfumaria', 'Kits'],
        suggestedTheme: '#a855f7',
    },
    {
        key: 'electronics',
        label: 'Eletrônicos',
        icon: 'mdi-laptop',
        color: 'info',
        emoji: '📱',
        suggestedCategories: ['Celulares', 'Notebooks', 'Áudio', 'Acessórios', 'Games'],
        suggestedTheme: '#0ea5e9',
    },
    {
        key: 'home',
        label: 'Casa e decoração',
        icon: 'mdi-sofa-outline',
        color: 'success',
        emoji: '🏠',
        suggestedCategories: ['Móveis', 'Decoração', 'Cozinha', 'Iluminação', 'Jardim'],
        suggestedTheme: '#10b981',
    },
    {
        key: 'health',
        label: 'Saúde e bem-estar',
        icon: 'mdi-heart-pulse',
        color: 'error',
        emoji: '💊',
        suggestedCategories: ['Suplementos', 'Vitaminas', 'Fitness', 'Cuidados', 'Kits'],
        suggestedTheme: '#ef4444',
    },
    {
        key: 'services',
        label: 'Serviços',
        icon: 'mdi-briefcase-outline',
        color: 'primary',
        emoji: '💼',
        suggestedCategories: ['Consultoria', 'Cursos', 'Assinaturas', 'Atendimento'],
        suggestedTheme: '#6366f1',
    },
    {
        key: 'other',
        label: 'Outro',
        icon: 'mdi-shape-outline',
        color: 'grey',
        emoji: '✨',
        suggestedCategories: ['Novidades', 'Mais vendidos', 'Promoções'],
        suggestedTheme: '#6366f1',
    },
]

/* -------------------------------------------------------------------------- */
/*  Steps                                                                     */
/* -------------------------------------------------------------------------- */

interface Step {
    key: string
    label: string
    icon: string
}

const steps: Step[] = [
    { key: 'welcome', label: 'Boas-vindas', icon: 'mdi-hand-wave-outline' },
    { key: 'segment', label: 'Segmento', icon: 'mdi-shape-outline' },
    { key: 'identity', label: 'Identidade', icon: 'mdi-storefront-outline' },
    { key: 'brand', label: 'Marca', icon: 'mdi-palette-outline' },
    { key: 'contact', label: 'Contato', icon: 'mdi-phone-outline' },
    { key: 'ready', label: 'Pronto!', icon: 'mdi-rocket-launch-outline' },
]

const currentStepIndex = ref(0)
const currentStep = computed(() => steps[currentStepIndex.value])
const isFirstStep = computed(() => currentStepIndex.value === 0)
const isLastStep = computed(() => currentStepIndex.value === steps.length - 1)

const progress = computed(() =>
    ((currentStepIndex.value + 1) / steps.length) * 100,
)

/* -------------------------------------------------------------------------- */
/*  Form data (persistido no localStorage)                                    */
/* -------------------------------------------------------------------------- */

interface OnboardingForm {
    segment: string | null
    storeName: string
    slug: string
    cnpj: string
    themeColor: string
    logoFile: File | null
    logoPreview: string | null
    whatsapp: string
    email: string
    city: string
    state: string
    createCategories: boolean
}

const form = reactive<OnboardingForm>({
    segment: null,
    storeName: '',
    slug: '',
    cnpj: '',
    themeColor: '#6366f1',
    logoFile: null,
    logoPreview: null,
    whatsapp: '',
    email: '',
    city: '',
    state: '',
    createCategories: true,
})

/* Persistência */
function saveDraft() {
    const { logoFile, logoPreview, ...serializable } = form
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...serializable,
        stepIndex: currentStepIndex.value,
    }))
}

function loadDraft() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
        const draft = JSON.parse(raw)
        Object.assign(form, draft)
        if (typeof draft.stepIndex === 'number') {
            currentStepIndex.value = Math.min(draft.stepIndex, steps.length - 1)
        }
    } catch {
        // ignora draft inválido
    }
}

function clearDraft() {
    localStorage.removeItem(STORAGE_KEY)
}

watch([form, currentStepIndex], saveDraft, { deep: true })

/* -------------------------------------------------------------------------- */
/*  Slug — geração automática + validação de disponibilidade                  */
/* -------------------------------------------------------------------------- */

const slugAutoSync = ref(true)

watch(() => form.storeName, (name) => {
    if (slugAutoSync.value && name) {
        form.slug = slugify(name)
    }
})

function onSlugManualEdit() {
    slugAutoSync.value = false
}

const slugCheck = reactive({
    checking: false,
    available: true,
    message: '',
})

let slugDebounce: number | undefined
watch(() => form.slug, (newSlug) => {
    window.clearTimeout(slugDebounce)
    slugCheck.checking = false
    slugCheck.available = false
    slugCheck.message = ''

    if (!newSlug) return
    if (!/^[a-z0-9-]+$/.test(newSlug)) {
        slugCheck.message = 'Use apenas letras minúsculas, números e hífens'
        return
    }
    if (newSlug.length < 3) {
        slugCheck.message = 'Mínimo 3 caracteres'
        return
    }

    slugDebounce = window.setTimeout(async () => {
        slugCheck.checking = true
        const { data } = await supabase
            .from('stores')
            .select('id')
            .eq('slug', newSlug)
            .maybeSingle()
        slugCheck.checking = false
        slugCheck.available = !data
        slugCheck.message = data ? 'Este slug já está em uso' : '✓ Disponível'
    }, 500)
})

const isSlugValid = computed(() =>
    form.slug.length >= 3
    && /^[a-z0-9-]+$/.test(form.slug)
    && slugCheck.available
    && !slugCheck.checking,
)

const publicUrlPreview = computed(() =>
    form.slug ? `vibestore.app/s/${form.slug}` : 'vibestore.app/s/sua-loja',
)

/* -------------------------------------------------------------------------- */
/*  Segmento — aplicar sugestões ao selecionar                                */
/* -------------------------------------------------------------------------- */

const selectedSegment = computed(() =>
    segments.find(s => s.key === form.segment),
)

function selectSegment(segment: BusinessSegment) {
    form.segment = segment.key
    // Sugere cor do tema se o usuário ainda não personalizou
    if (form.themeColor === '#6366f1' || !form.themeColor) {
        form.themeColor = segment.suggestedTheme
    }
}

/* -------------------------------------------------------------------------- */
/*  Upload de logo                                                            */
/* -------------------------------------------------------------------------- */

const logoInputRef = ref<HTMLInputElement>()

function triggerLogoSelect() {
    logoInputRef.value?.click()
}

function handleLogoChange(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
        notify.error('Logo não pode ultrapassar 2MB')
        return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        notify.error('Use JPG, PNG ou WebP')
        return
    }

    // Libera preview anterior
    if (form.logoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(form.logoPreview)
    }

    form.logoFile = file
    form.logoPreview = URL.createObjectURL(file)
    target.value = ''
}

function removeLogo() {
    if (form.logoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(form.logoPreview)
    }
    form.logoFile = null
    form.logoPreview = null
}

/* -------------------------------------------------------------------------- */
/*  Validação por step                                                        */
/* -------------------------------------------------------------------------- */

const canAdvance = computed(() => {
    switch (currentStep.value.key) {
        case 'welcome': return true
        case 'segment': return !!form.segment
        case 'identity': return !!form.storeName.trim() && isSlugValid.value
        case 'brand': return true // logo e cor são opcionais
        case 'contact': return !!form.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
        case 'ready': return true
        default: return false
    }
})

/* -------------------------------------------------------------------------- */
/*  Navegação entre steps                                                     */
/* -------------------------------------------------------------------------- */

function nextStep() {
    if (!canAdvance.value) return
    if (isLastStep.value) return
    currentStepIndex.value++
}

function prevStep() {
    if (isFirstStep.value) return
    currentStepIndex.value--
}

function skipOnboarding() {
    clearDraft()
    router.push({ name: 'dashboard-overview' })
}

/* -------------------------------------------------------------------------- */
/*  Criação da loja — orquestra tudo em sequência                             */
/* -------------------------------------------------------------------------- */

const creationStep = ref<'idle' | 'creating_store' | 'uploading_logo' | 'seeding' | 'done'>('idle')

const { execute: createStore, loading: creating } = useAsyncAction(
    async () => {
        if (!user.value) throw new Error('Sem sessão ativa')
        if (!form.storeName.trim() || !form.slug) throw new Error('Complete os dados obrigatórios')

        /* --------- 1. Cria loja + subscription + membership --------- */
        creationStep.value = 'creating_store'

        const store = await storesService.createWithOnboarding({
            name: form.storeName.trim(),
            slug: form.slug,
            email: form.email.trim(),
            phone: form.whatsapp.trim() || undefined,
            cnpj: form.cnpj.trim() || undefined,
            planTier: 'FREE',
        })

        /* --------- 2. Aplica settings iniciais (tema, WhatsApp, cidade) --------- */
        await supabase.from('stores').update({
            settings: {
                theme_color: form.themeColor,
                show_prices: true,
                checkout_via: 'both',
                whatsapp_number: form.whatsapp.replace(/\D/g, '') || null,
                allow_guest_checkout: true,
                require_cpf: false,
                segment: form.segment,
            },
            address: form.city || form.state ? {
                city: form.city,
                state: form.state,
                country: 'BR',
            } : {},
        }).eq('id', store.id)

        /* --------- 3. Upload de logo (se houver) --------- */
        if (form.logoFile) {
            creationStep.value = 'uploading_logo'
            const ext = form.logoFile.name.split('.').pop() ?? 'png'
            const path = `${store.id}/logo.${ext}`
            await storageService.upload('store-logos', path, form.logoFile, true)
            const logoUrl = storageService.getPublicUrl('store-logos', path)
            await supabase.from('stores')
                .update({ logo_url: logoUrl })
                .eq('id', store.id)
        }

        /* --------- 4. Cria categorias sugeridas --------- */
        if (form.createCategories && selectedSegment.value) {
            creationStep.value = 'seeding'
            const categories = selectedSegment.value.suggestedCategories.map((name, i) => ({
                store_id: store.id,
                name,
                slug: slugify(name),
                sort_order: i,
                is_active: true,
            }))
            await supabase.from('categories').insert(categories)
        }

        /* --------- 5. Recarrega dados do auth + troca para a nova loja --------- */
        await auth.loadStores?.()
        auth.switchStore?.(store.id)

        creationStep.value = 'done'
        clearDraft()

        return store
    },
    { successMsg: 'Sua loja está pronta! 🎉' },
)

async function finalizeAndGo() {
    const store = await createStore()
    if (store) {
        // Pequeno delay para o usuário ver a animação de sucesso
        setTimeout(() => {
            router.push({ name: 'dashboard-overview' })
        }, 1500)
    }
}

/* -------------------------------------------------------------------------- */
/*  Init                                                                      */
/* -------------------------------------------------------------------------- */

const hasExistingStore = computed(() =>
    stores.value.length > 0 && route.query.new !== 'true',
)

onMounted(() => {
    // Se já tem loja e não veio com ?new=true, redireciona
    if (hasExistingStore.value) {
        router.replace({ name: 'dashboard-overview' })
        return
    }

    // Pré-preenche e-mail com o do usuário
    if (user.value?.email && !form.email) {
        form.email = user.value.email
    }

    loadDraft()
})

/* Cleanup de blob URL */
watch(() => form.logoPreview, (newVal, oldVal) => {
    if (oldVal?.startsWith('blob:') && oldVal !== newVal) {
        URL.revokeObjectURL(oldVal)
    }
})

const firstName = computed(() =>
    profile.value?.full_name?.split(' ')[0] ?? 'por aí',
)
</script>

<template>
    <div class="onboarding-page">

        <!-- ==================== HEADER ==================== -->
        <header class="onboarding-header">
            <div class="onboarding-brand">
                <div class="brand-text">VibeStore</div>
            </div>

            <div class="progress-container">
                <div class="text-caption text-medium-emphasis mb-2">
                    Etapa {{ currentStepIndex + 1 }} de {{ steps.length }}
                </div>
                <v-progress-linear :model-value="progress" color="primary" height="4" rounded />
            </div>

            <v-btn v-if="!isLastStep && stores.length > 0" variant="text" size="small" class="text-none"
                @click="skipOnboarding">
                Pular
            </v-btn>
            <v-btn v-else-if="!isLastStep" variant="text" size="small" color="medium-emphasis" class="text-none"
                prepend-icon="mdi-logout" @click="auth.signOut()">
                Sair
            </v-btn>
        </header>

        <!-- ==================== CONTENT ==================== -->
        <main class="onboarding-content">
            <v-container class="content-container">
                <v-window v-model="currentStepIndex" :touch="false">

                    <!-- ========================================================== -->
                    <!--  STEP 1 — BOAS-VINDAS                                     -->
                    <!-- ========================================================== -->
                    <v-window-item :value="0">
                        <div class="step-panel text-center">
                            <div class="welcome-hero mb-6">
                                <div class="hero-emoji">👋</div>
                            </div>

                            <h1 class="text-h3 font-weight-black mb-3">
                                Olá, {{ firstName }}!
                            </h1>
                            <p class="text-h6 font-weight-regular text-medium-emphasis mb-8">
                                Que bom te ver aqui. Vamos criar sua loja online<br class="hidden-sm-and-down">
                                em menos de 2 minutos?
                            </p>

                            <div class="features-grid mb-8">
                                <div class="feature-item">
                                    <v-avatar color="primary" variant="tonal" size="48">
                                        <v-icon size="24">mdi-storefront-outline</v-icon>
                                    </v-avatar>
                                    <div class="text-body-2 font-weight-medium mt-2">Vitrine online</div>
                                    <div class="text-caption text-medium-emphasis">
                                        Seu catálogo com link único
                                    </div>
                                </div>
                                <div class="feature-item">
                                    <v-avatar color="success" variant="tonal" size="48">
                                        <v-icon size="24">mdi-cart-check</v-icon>
                                    </v-avatar>
                                    <div class="text-body-2 font-weight-medium mt-2">Vendas integradas</div>
                                    <div class="text-caption text-medium-emphasis">
                                        Receba pedidos e pagamentos
                                    </div>
                                </div>
                                <div class="feature-item">
                                    <v-avatar color="warning" variant="tonal" size="48">
                                        <v-icon size="24">mdi-chart-line</v-icon>
                                    </v-avatar>
                                    <div class="text-body-2 font-weight-medium mt-2">Analytics inteligente</div>
                                    <div class="text-caption text-medium-emphasis">
                                        Entenda seus clientes
                                    </div>
                                </div>
                            </div>

                            <v-alert type="success" variant="tonal" rounded="lg" density="compact"
                                icon="mdi-gift-outline" class="mb-0 d-inline-flex text-start">
                                <div class="text-body-2">
                                    <strong>14 dias grátis</strong> para testar tudo — sem cartão de crédito
                                </div>
                            </v-alert>
                        </div>
                    </v-window-item>

                    <!-- ========================================================== -->
                    <!--  STEP 2 — SEGMENTO                                        -->
                    <!-- ========================================================== -->
                    <v-window-item :value="1">
                        <div class="step-panel">
                            <div class="text-center mb-6">
                                <h1 class="text-h4 font-weight-black mb-2">
                                    O que você vende?
                                </h1>
                                <p class="text-body-1 text-medium-emphasis">
                                    Vamos personalizar sua loja com sugestões inteligentes
                                </p>
                            </div>

                            <div class="segments-grid">
                                <button v-for="segment in segments" :key="segment.key" class="segment-card"
                                    :class="{ selected: form.segment === segment.key }" type="button"
                                    @click="selectSegment(segment)">
                                    <div class="segment-emoji">{{ segment.emoji }}</div>
                                    <div class="segment-label">{{ segment.label }}</div>
                                    <v-icon v-if="form.segment === segment.key" class="segment-check" color="primary"
                                        size="18">
                                        mdi-check-circle
                                    </v-icon>
                                </button>
                            </div>

                            <v-expand-transition>
                                <v-alert v-if="selectedSegment" type="info" variant="tonal" rounded="lg"
                                    density="compact" class="mt-6" icon="mdi-lightbulb-outline">
                                    <div class="text-body-2">
                                        Vamos criar automaticamente as categorias:
                                        <strong>{{ selectedSegment.suggestedCategories.join(', ') }}</strong>.
                                        Você pode editar depois.
                                    </div>
                                </v-alert>
                            </v-expand-transition>
                        </div>
                    </v-window-item>

                    <!-- ========================================================== -->
                    <!--  STEP 3 — IDENTIDADE                                      -->
                    <!-- ========================================================== -->
                    <v-window-item :value="2">
                        <div class="step-panel">
                            <div class="text-center mb-6">
                                <h1 class="text-h4 font-weight-black mb-2">
                                    Como sua loja vai se chamar?
                                </h1>
                                <p class="text-body-1 text-medium-emphasis">
                                    Escolha um nome que seus clientes vão amar
                                </p>
                            </div>

                            <div class="form-container">
                                <v-text-field v-model="form.storeName" label="Nome da loja *"
                                    placeholder="Ex: Doceria da Ana" variant="outlined" density="comfortable"
                                    prepend-inner-icon="mdi-storefront-outline" autofocus />

                                <div class="mt-4">
                                    <v-text-field v-model="form.slug" label="Endereço da sua vitrine *"
                                        variant="outlined" density="comfortable" prefix="vibestore.app/s/"
                                        :error="!!form.slug && !isSlugValid && !slugCheck.checking"
                                        :messages="slugCheck.message" @input="onSlugManualEdit">
                                        <template #append-inner>
                                            <v-progress-circular v-if="slugCheck.checking" indeterminate size="16"
                                                width="2" />
                                            <v-icon v-else-if="form.slug && isSlugValid" color="success"
                                                size="20">mdi-check-circle</v-icon>
                                            <v-icon v-else-if="form.slug && !slugCheck.available" color="error"
                                                size="20">mdi-close-circle</v-icon>
                                        </template>
                                    </v-text-field>

                                    <v-card variant="tonal" color="primary" rounded="lg" class="pa-3 mt-3">
                                        <div class="text-caption text-medium-emphasis mb-1">
                                            Prévia do seu link público
                                        </div>
                                        <code class="preview-url">🔗 {{ publicUrlPreview }}</code>
                                    </v-card>
                                </div>

                                <v-text-field v-model="form.cnpj" label="CNPJ (opcional)" variant="outlined"
                                    density="comfortable" prepend-inner-icon="mdi-card-account-details-outline"
                                    placeholder="00.000.000/0000-00" hint="Você pode adicionar depois se preferir"
                                    persistent-hint class="mt-4" />
                            </div>
                        </div>
                    </v-window-item>

                    <!-- ========================================================== -->
                    <!--  STEP 4 — MARCA                                           -->
                    <!-- ========================================================== -->
                    <v-window-item :value="3">
                        <div class="step-panel">
                            <div class="text-center mb-6">
                                <h1 class="text-h4 font-weight-black mb-2">
                                    Vamos personalizar
                                </h1>
                                <p class="text-body-1 text-medium-emphasis">
                                    Adicione a cara da sua loja (opcional — pode fazer depois)
                                </p>
                            </div>

                            <div class="form-container">
                                <!-- Logo -->
                                <div class="text-subtitle-2 font-weight-bold mb-2">
                                    Logo da loja
                                </div>

                                <div class="logo-upload" :class="{ 'has-image': form.logoPreview }"
                                    @click="triggerLogoSelect">
                                    <img v-if="form.logoPreview" :src="form.logoPreview" class="logo-image" alt="Logo">
                                    <div v-else class="logo-placeholder">
                                        <v-icon size="40" color="grey-lighten-1">mdi-image-plus-outline</v-icon>
                                        <div class="text-body-2 mt-2 font-weight-medium">
                                            Clique para enviar
                                        </div>
                                        <div class="text-caption text-medium-emphasis">
                                            PNG, JPG ou WebP · até 2MB
                                        </div>
                                    </div>

                                    <v-btn v-if="form.logoPreview" icon="mdi-close" color="error" variant="flat"
                                        size="small" class="logo-remove" @click.stop="removeLogo" />
                                </div>

                                <input ref="logoInputRef" type="file" accept="image/jpeg,image/png,image/webp" hidden
                                    @change="handleLogoChange">

                                <!-- Cor de destaque -->
                                <div class="text-subtitle-2 font-weight-bold mb-2 mt-6">
                                    Cor de destaque
                                </div>
                                <div class="d-flex align-center ga-3 flex-wrap">
                                    <div class="color-preview" :style="{ background: form.themeColor }" />
                                    <v-text-field v-model="form.themeColor" variant="outlined" density="comfortable"
                                        hide-details style="max-width: 160px" prepend-inner-icon="mdi-palette" />
                                    <div class="d-flex ga-1 flex-wrap">
                                        <button
                                            v-for="c in ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#a855f7', '#000000']"
                                            :key="c" type="button" class="color-swatch"
                                            :class="{ active: form.themeColor === c }" :style="{ background: c }"
                                            @click="form.themeColor = c" />
                                    </div>
                                </div>

                                <v-alert type="info" variant="tonal" rounded="lg" density="compact" class="mt-6"
                                    icon="mdi-information-outline">
                                    <div class="text-caption">
                                        Sem logo ainda? Sem problema. Sua loja funciona normalmente e você pode
                                        adicionar tudo depois em Configurações → Identidade visual.
                                    </div>
                                </v-alert>
                            </div>
                        </div>
                    </v-window-item>

                    <!-- ========================================================== -->
                    <!--  STEP 5 — CONTATO                                         -->
                    <!-- ========================================================== -->
                    <v-window-item :value="4">
                        <div class="step-panel">
                            <div class="text-center mb-6">
                                <h1 class="text-h4 font-weight-black mb-2">
                                    Como seus clientes chegam até você?
                                </h1>
                                <p class="text-body-1 text-medium-emphasis">
                                    Esses dados aparecem na sua vitrine pública
                                </p>
                            </div>

                            <div class="form-container">
                                <v-text-field v-model="form.email" label="E-mail de contato *" type="email"
                                    variant="outlined" density="comfortable" prepend-inner-icon="mdi-email-outline"
                                    hint="Para receber notificações de pedidos" persistent-hint />

                                <v-text-field v-model="form.whatsapp" label="WhatsApp (recomendado)" variant="outlined"
                                    density="comfortable" prepend-inner-icon="mdi-whatsapp"
                                    placeholder="(11) 99999-9999" hint="Aparece como opção de checkout na vitrine"
                                    persistent-hint class="mt-4" />

                                <v-row dense class="mt-3">
                                    <v-col cols="8">
                                        <v-text-field v-model="form.city" label="Cidade" variant="outlined"
                                            density="comfortable" prepend-inner-icon="mdi-map-marker-outline" />
                                    </v-col>
                                    <v-col cols="4">
                                        <v-text-field v-model="form.state" label="UF" variant="outlined"
                                            density="comfortable" maxlength="2" />
                                    </v-col>
                                </v-row>

                                <v-alert v-if="selectedSegment" type="success" variant="tonal" rounded="lg"
                                    density="compact" class="mt-6" icon="mdi-check-decagram">
                                    <div class="text-body-2 font-weight-medium">
                                        Quase lá! Vamos revisar tudo na próxima tela.
                                    </div>
                                </v-alert>
                            </div>
                        </div>
                    </v-window-item>

                    <!-- ========================================================== -->
                    <!--  STEP 6 — READY                                           -->
                    <!-- ========================================================== -->
                    <v-window-item :value="5">
                        <div class="step-panel">
                            <div v-if="creationStep === 'idle'" class="text-center">
                                <div class="ready-emoji mb-4">🚀</div>
                                <h1 class="text-h4 font-weight-black mb-3">
                                    Tudo pronto para decolar!
                                </h1>
                                <p class="text-body-1 text-medium-emphasis mb-6">
                                    Revise os dados e confirme para criar sua loja
                                </p>

                                <!-- Card de revisão -->
                                <v-card variant="outlined" rounded="xl" class="pa-6 text-start review-card mb-6">
                                    <div class="d-flex align-center ga-4 mb-4">
                                        <v-avatar :image="form.logoPreview ?? undefined" :color="form.themeColor"
                                            size="64" rounded="lg">
                                            <v-icon v-if="!form.logoPreview" color="white" size="32">
                                                mdi-storefront
                                            </v-icon>
                                        </v-avatar>
                                        <div class="min-width-0 flex-grow-1">
                                            <div class="text-h6 font-weight-black text-truncate">
                                                {{ form.storeName }}
                                            </div>
                                            <code class="preview-url text-caption">
                            vibestore.app/s/{{ form.slug }}
                        </code>
                                        </div>
                                        <v-chip v-if="selectedSegment" size="small" variant="tonal">
                                            {{ selectedSegment.emoji }} {{ selectedSegment.label }}
                                        </v-chip>
                                    </div>

                                    <v-divider class="my-3" />

                                    <div class="review-list">
                                        <div v-if="form.email" class="review-row">
                                            <v-icon size="18" color="medium-emphasis">mdi-email-outline</v-icon>
                                            <span>{{ form.email }}</span>
                                        </div>
                                        <div v-if="form.whatsapp" class="review-row">
                                            <v-icon size="18" color="medium-emphasis">mdi-whatsapp</v-icon>
                                            <span>{{ form.whatsapp }}</span>
                                        </div>
                                        <div v-if="form.city" class="review-row">
                                            <v-icon size="18" color="medium-emphasis">mdi-map-marker-outline</v-icon>
                                            <span>{{ form.city }}{{ form.state ? `/${form.state}` : '' }}</span>
                                        </div>
                                        <div v-if="form.cnpj" class="review-row">
                                            <v-icon size="18"
                                                color="medium-emphasis">mdi-card-account-details-outline</v-icon>
                                            <span>{{ form.cnpj }}</span>
                                        </div>
                                    </div>

                                    <v-divider v-if="selectedSegment" class="my-3" />

                                    <v-switch v-if="selectedSegment" v-model="form.createCategories" color="primary"
                                        density="compact" hide-details>
                                        <template #label>
                                            <div>
                                                <div class="text-body-2 font-weight-medium">
                                                    Criar categorias sugeridas
                                                </div>
                                                <div class="text-caption text-medium-emphasis">
                                                    {{ selectedSegment.suggestedCategories.join(', ') }}
                                                </div>
                                            </div>
                                        </template>
                                    </v-switch>
                                </v-card>

                                <v-alert type="success" variant="tonal" rounded="lg" density="compact"
                                    icon="mdi-shield-check-outline" class="d-inline-flex text-start">
                                    <div class="text-body-2">
                                        <strong>14 dias grátis</strong> no plano completo · Sem taxa de setup
                                    </div>
                                </v-alert>
                            </div>

                            <!-- Estado de criação -->
                            <div v-else class="text-center creation-state">
                                <div class="creation-animation mb-6">
                                    <v-progress-circular v-if="creationStep !== 'done'" indeterminate :size="80"
                                        :width="6" color="primary" />
                                    <div v-else class="success-check">
                                        <v-icon size="80" color="success">mdi-check-decagram</v-icon>
                                    </div>
                                </div>

                                <h1 class="text-h4 font-weight-black mb-3">
                                    {{
                                        creationStep === 'creating_store' ? 'Criando sua loja...' :
                                            creationStep === 'uploading_logo' ? 'Enviando o logo...' :
                                                creationStep === 'seeding' ? 'Configurando categorias...' :
                                                    '🎉 Bem-vindo(a) ao VibeStore!'
                                    }}
                                </h1>
                                <p class="text-body-1 text-medium-emphasis">
                                    {{
                                        creationStep === 'done'
                                            ? 'Sua loja está pronta. Redirecionando para o painel...'
                                            : 'Isso leva apenas alguns segundos'
                                    }}
                                </p>
                            </div>
                        </div>
                    </v-window-item>

                </v-window>
            </v-container>
        </main>

        <!-- ==================== FOOTER (navegação) ==================== -->
        <footer class="onboarding-footer">
            <div class="footer-content">
                <v-btn v-if="!isFirstStep && creationStep === 'idle'" variant="text" prepend-icon="mdi-arrow-left"
                    class="text-none" :disabled="creating" @click="prevStep">
                    Voltar
                </v-btn>
                <div v-else />

                <div class="step-dots">
                    <div v-for="(step, i) in steps" :key="step.key" class="step-dot" :class="{
                        active: i === currentStepIndex,
                        completed: i < currentStepIndex,
                    }" @click="i < currentStepIndex && (currentStepIndex = i)" />
                </div>

                <v-btn v-if="!isLastStep" color="primary" variant="flat" rounded="pill" class="text-none px-6"
                    append-icon="mdi-arrow-right" :disabled="!canAdvance" @click="nextStep">
                    {{ currentStepIndex === 0 ? 'Vamos começar' : 'Continuar' }}
                </v-btn>
                <v-btn v-else-if="creationStep === 'idle'" color="primary" variant="flat" rounded="pill" size="large"
                    class="text-none px-8 create-btn" prepend-icon="mdi-rocket-launch" :loading="creating"
                    @click="finalizeAndGo">
                    Criar minha loja
                </v-btn>
                <div v-else />
            </div>
        </footer>

    </div>
</template>

<style scoped>
.onboarding-page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg,
            rgba(var(--v-theme-primary), 0.04) 0%,
            rgba(var(--v-theme-primary), 0.02) 100%);
}

/* ============================================================ */
/*  Header                                                      */
/* ============================================================ */
.onboarding-header {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 20px 32px;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
    background: rgb(var(--v-theme-surface));
}

.brand-text {
    font-size: 20px;
    font-weight: 800;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    letter-spacing: -0.02em;
}

.progress-container {
    flex: 1;
    max-width: 400px;
}

@media (max-width: 599px) {
    .onboarding-header {
        padding: 16px;
        gap: 12px;
    }

    .brand-text {
        font-size: 16px;
    }
}

/* ============================================================ */
/*  Content                                                     */
/* ============================================================ */
.onboarding-content {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 40px 20px;
}

.content-container {
    max-width: 680px !important;
}

.step-panel {
    animation: fade-slide-in 0.4s ease;
}

@keyframes fade-slide-in {
    from {
        opacity: 0;
        transform: translateY(12px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.form-container {
    max-width: 520px;
    margin: 0 auto;
}

.min-width-0 {
    min-width: 0;
}

/* ============================================================ */
/*  Welcome                                                     */
/* ============================================================ */
.welcome-hero {
    display: flex;
    justify-content: center;
}

.hero-emoji {
    font-size: 88px;
    animation: wave 2s ease-in-out infinite;
    transform-origin: 70% 70%;
}

@keyframes wave {

    0%,
    60%,
    100% {
        transform: rotate(0deg);
    }

    10%,
    30% {
        transform: rotate(14deg);
    }

    20% {
        transform: rotate(-8deg);
    }

    40%,
    50% {
        transform: rotate(-4deg);
    }
}

.features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    max-width: 560px;
    margin: 0 auto;
}

@media (max-width: 599px) {
    .features-grid {
        grid-template-columns: 1fr;
    }
}

.feature-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
    background: rgb(var(--v-theme-surface));
    border-radius: 12px;
    border: 1px solid rgba(var(--v-border-color), 0.08);
}

/* ============================================================ */
/*  Segments                                                    */
/* ============================================================ */
.segments-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
}

.segment-card {
    background: rgb(var(--v-theme-surface));
    border: 2px solid rgba(var(--v-border-color), 0.15);
    border-radius: 14px;
    padding: 20px 12px;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s ease;
    position: relative;
    font-family: inherit;
}

.segment-card:hover {
    border-color: rgba(var(--v-theme-primary), 0.4);
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.06);
}

.segment-card.selected {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.05);
    box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

.segment-emoji {
    font-size: 40px;
    margin-bottom: 8px;
    display: block;
}

.segment-label {
    font-size: 0.875rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.segment-check {
    position: absolute;
    top: 8px;
    right: 8px;
}

/* ============================================================ */
/*  Logo upload                                                 */
/* ============================================================ */
.logo-upload {
    position: relative;
    aspect-ratio: 1;
    max-width: 240px;
    margin: 0 auto;
    border: 2px dashed rgba(var(--v-border-color), 0.3);
    border-radius: 16px;
    background: rgba(var(--v-theme-surface-variant), 0.2);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition: all 0.2s ease;
}

.logo-upload:hover {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.03);
}

.logo-upload.has-image {
    border-style: solid;
    border-color: rgba(var(--v-border-color), 0.15);
    background: rgb(var(--v-theme-surface));
}

.logo-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.logo-placeholder {
    text-align: center;
    padding: 20px;
}

.logo-remove {
    position: absolute;
    top: 8px;
    right: 8px;
}

/* ============================================================ */
/*  Color picker                                                */
/* ============================================================ */
.color-preview {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    border: 3px solid white;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
    flex-shrink: 0;
}

.color-swatch {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease;
}

.color-swatch:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
}

.color-swatch.active {
    border-color: white;
    box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
}

/* ============================================================ */
/*  Preview URL                                                 */
/* ============================================================ */
.preview-url {
    background: rgba(var(--v-theme-on-surface), 0.06);
    padding: 4px 10px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.875rem;
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
    display: inline-block;
}

/* ============================================================ */
/*  Review card                                                 */
/* ============================================================ */
.review-card {
    background: rgb(var(--v-theme-surface)) !important;
}

.review-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.review-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.875rem;
    color: rgb(var(--v-theme-on-surface));
}

/* ============================================================ */
/*  Ready + creation animation                                  */
/* ============================================================ */
.ready-emoji {
    font-size: 88px;
    animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55);
}

.creation-state {
    padding: 40px 20px;
}

.creation-animation {
    display: flex;
    justify-content: center;
}

.success-check {
    animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55);
}

@keyframes bounce-in {
    0% {
        transform: scale(0);
        opacity: 0;
    }

    50% {
        transform: scale(1.15);
        opacity: 1;
    }

    100% {
        transform: scale(1);
        opacity: 1;
    }
}

/* ============================================================ */
/*  Footer                                                      */
/* ============================================================ */
.onboarding-footer {
    padding: 20px 32px;
    border-top: 1px solid rgba(var(--v-border-color), 0.08);
    background: rgb(var(--v-theme-surface));
}

.footer-content {
    max-width: 680px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.step-dots {
    display: flex;
    gap: 6px;
}

.step-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(var(--v-theme-on-surface), 0.15);
    transition: all 0.2s ease;
}

.step-dot.completed {
    background: rgb(var(--v-theme-primary));
    cursor: pointer;
}

.step-dot.completed:hover {
    transform: scale(1.4);
}

.step-dot.active {
    background: rgb(var(--v-theme-primary));
    width: 24px;
    border-radius: 4px;
}

.create-btn {
    animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {

    0%,
    100% {
        box-shadow: 0 0 0 0 rgba(var(--v-theme-primary), 0.4);
    }

    50% {
        box-shadow: 0 0 0 8px rgba(var(--v-theme-primary), 0);
    }
}

@media (max-width: 599px) {
    .onboarding-footer {
        padding: 16px;
    }

    .footer-content {
        gap: 8px;
    }
}
</style>
