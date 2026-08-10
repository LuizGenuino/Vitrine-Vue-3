<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { useAsyncAction } from '@/composables/useAsyncAction'

import { storageService } from '@/services/storage.service'
import { supabase } from '@/lib/supabase'

import EmptyState from '@/components/base/EmptyState.vue'

import type { Store } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const auth = useAuthStore()
const notify = useNotifications()
const { currentStore, currentStoreId, currentRole } = storeToRefs(auth)

const canEdit = computed(() =>
    currentRole.value && [ 'OWNER', 'ADMIN'].includes(currentRole.value),
)

const isOwner = computed(() => currentRole.value === 'OWNER')

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

function formatCnpj(cnpj: string | null): string {
    if (!cnpj) return ''
    const d = cnpj.replace(/\D/g, '')
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    return cnpj
}

/* -------------------------------------------------------------------------- */
/*  Aba ativa                                                                 */
/* -------------------------------------------------------------------------- */

const activeTab = ref<'general' | 'branding' | 'commercial' | 'integrations' | 'danger'>('general')

/* -------------------------------------------------------------------------- */
/*  Form principal — dados da loja                                            */
/* -------------------------------------------------------------------------- */

interface StoreForm {
    name: string
    slug: string
    cnpj: string
    email: string
    phone: string
    // address (jsonb)
    address: {
        street: string
        number: string
        complement: string
        neighborhood: string
        city: string
        state: string
        postal_code: string
        country: string
    }
    // settings (jsonb)
    settings: {
        theme_color: string
        show_prices: boolean
        checkout_via: 'whatsapp' | 'gateway' | 'both'
        whatsapp_number: string
        order_prefix: string
        allow_guest_checkout: boolean
        require_cpf: boolean
        min_order_value: number
        shipping_free_above: number
        social: {
            instagram: string
            facebook: string
            tiktok: string
        }
    }
}

const form = reactive<StoreForm>({
    name: '',
    slug: '',
    cnpj: '',
    email: '',
    phone: '',
    address: {
        street: '', number: '', complement: '',
        neighborhood: '', city: '', state: '',
        postal_code: '', country: 'BR',
    },
    settings: {
        theme_color: '#6366f1',
        show_prices: true,
        checkout_via: 'both',
        whatsapp_number: '',
        order_prefix: '',
        allow_guest_checkout: true,
        require_cpf: false,
        min_order_value: 0,
        shipping_free_above: 0,
        social: { instagram: '', facebook: '', tiktok: '' },
    },
})

const originalForm = ref<StoreForm | null>(null)

const hasChanges = computed(() => {
    if (!originalForm.value) return false
    return JSON.stringify(form) !== JSON.stringify(originalForm.value)
})

function hydrateFromStore(store: Store) {
    form.name = store.name
    form.slug = store.slug
    form.cnpj = store.cnpj ?? ''
    form.email = store.email
    form.phone = store.phone ?? ''

    const addr = (store.address as any) ?? {}
    form.address = {
        street: addr.street ?? '',
        number: addr.number ?? '',
        complement: addr.complement ?? '',
        neighborhood: addr.neighborhood ?? '',
        city: addr.city ?? '',
        state: addr.state ?? '',
        postal_code: addr.postal_code ?? '',
        country: addr.country ?? 'BR',
    }

    const s = (store.settings as any) ?? {}
    form.settings = {
        theme_color: s.theme_color ?? '#6366f1',
        show_prices: s.show_prices ?? true,
        checkout_via: s.checkout_via ?? 'both',
        whatsapp_number: s.whatsapp_number ?? '',
        order_prefix: s.order_prefix ?? '',
        allow_guest_checkout: s.allow_guest_checkout ?? true,
        require_cpf: s.require_cpf ?? false,
        min_order_value: Number(s.min_order_value ?? 0),
        shipping_free_above: Number(s.shipping_free_above ?? 0),
        social: {
            instagram: s.social?.instagram ?? '',
            facebook: s.social?.facebook ?? '',
            tiktok: s.social?.tiktok ?? '',
        },
    }

    originalForm.value = JSON.parse(JSON.stringify(form))
}

// Hidrata quando a store carrega
watch(currentStore, (s) => {
    if (s) hydrateFromStore(s)
}, { immediate: true })

/* -------------------------------------------------------------------------- */
/*  Validação de slug (unicidade)                                             */
/* -------------------------------------------------------------------------- */

const slugCheck = reactive({
    checking: false,
    available: true,
    message: '',
})

let slugDebounce: number | undefined
watch(() => form.slug, (newSlug) => {
    window.clearTimeout(slugDebounce)
    if (!newSlug || newSlug === currentStore.value?.slug) {
        slugCheck.available = true
        slugCheck.message = ''
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
        slugCheck.message = data ? 'Este slug já está em uso' : 'Disponível'
    }, 500)
})

const isSlugValid = computed(() =>
    /^[a-z0-9-]+$/.test(form.slug) && form.slug.length >= 3 && slugCheck.available,
)

function suggestSlug() {
    form.slug = slugify(form.name)
}

/* -------------------------------------------------------------------------- */
/*  Salvar dados da loja                                                      */
/* -------------------------------------------------------------------------- */

const { execute: saveStore, loading: saving } = useAsyncAction(
    async () => {
        if (!currentStoreId.value) throw new Error('Sem loja ativa')
        if (!form.name.trim()) throw new Error('Nome da loja é obrigatório')
        if (!isSlugValid.value) throw new Error('Slug inválido ou indisponível')

        const { error } = await supabase.from('stores').update({
            name: form.name.trim(),
            slug: form.slug,
            cnpj: form.cnpj.trim() || null,
            email: form.email.trim(),
            phone: form.phone.trim() || null,
            address: form.address,
            settings: form.settings,
        }).eq('id', currentStoreId.value)

        if (error) {
            if (error.code === '23505') throw new Error('Slug ou CNPJ já cadastrado por outra loja')
            throw error
        }

        originalForm.value = JSON.parse(JSON.stringify(form))

        // Recarrega o profile/stores da auth para refletir mudanças no header
        await auth.loadStores?.()
    },
    { successMsg: 'Configurações salvas' },
)

function discardChanges() {
    if (currentStore.value) hydrateFromStore(currentStore.value)
}

/* -------------------------------------------------------------------------- */
/*  Upload de logo e banner                                                   */
/* -------------------------------------------------------------------------- */

const logoUploading = ref(false)
const bannerUploading = ref(false)

async function handleLogoUpload(files: File | File[] | null) {
    const file = Array.isArray(files) ? files[0] : files
    if (!file || !currentStoreId.value) return

    if (file.size > 2 * 1024 * 1024) {
        notify.error('Logo não pode ultrapassar 2MB')
        return
    }

    logoUploading.value = true
    try {
        const ext = file.name.split('.').pop() ?? 'png'
        const path = storageService.storeLogoPath(ext)
        await storageService.upload('store-logos', path, file, true)
        const url = storageService.getPublicUrl('store-logos', path)
            + `?v=${Date.now()}` // cache-bust

        const { error } = await supabase
            .from('stores')
            .update({ logo_url: url })
            .eq('id', currentStoreId.value)
        if (error) throw error

        notify.success('Logo atualizado')
        await auth.loadStores?.()
    } catch (e: any) {
        notify.error(e.message ?? 'Erro ao enviar logo')
    } finally {
        logoUploading.value = false
    }
}

async function handleBannerUpload(files: File | File[] | null) {
    const file = Array.isArray(files) ? files[0] : files
    if (!file || !currentStoreId.value) return

    if (file.size > 5 * 1024 * 1024) {
        notify.error('Banner não pode ultrapassar 5MB')
        return
    }

    bannerUploading.value = true
    try {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${currentStoreId.value}/banner.${ext}`
        await storageService.upload('store-banners', path, file, true)
        const url = storageService.getPublicUrl('store-banners', path)
            + `?v=${Date.now()}`

        const { error } = await supabase
            .from('stores')
            .update({ banner_url: url })
            .eq('id', currentStoreId.value)
        if (error) throw error

        notify.success('Banner atualizado')
        await auth.loadStores?.()
    } catch (e: any) {
        notify.error(e.message ?? 'Erro ao enviar banner')
    } finally {
        bannerUploading.value = false
    }
}

async function removeLogo() {
    if (!currentStoreId.value || !currentStore.value?.logo_url) return
    await supabase.from('stores').update({ logo_url: null }).eq('id', currentStoreId.value)
    notify.success('Logo removido')
    await auth.loadStores?.()
}

async function removeBanner() {
    if (!currentStoreId.value || !currentStore.value?.banner_url) return
    await supabase.from('stores').update({ banner_url: null }).eq('id', currentStoreId.value)
    notify.success('Banner removido')
    await auth.loadStores?.()
}

/* -------------------------------------------------------------------------- */
/*  Integrações                                                               */
/* -------------------------------------------------------------------------- */

interface IntegrationProvider {
    key: string
    name: string
    description: string
    icon: string
    color: string
    category: 'payment' | 'shipping' | 'communication' | 'analytics'
    fields: { key: string; label: string; type: 'text' | 'password' | 'select'; options?: string[]; hint?: string }[]
}

const providers: IntegrationProvider[] = [
    {
        key: 'mercadopago',
        name: 'Mercado Pago',
        description: 'Aceite pagamentos via Pix, cartão e boleto',
        icon: 'mdi-credit-card-outline',
        color: 'info',
        category: 'payment',
        fields: [
            { key: 'access_token', label: 'Access Token', type: 'password', hint: 'Token de produção do painel do MP' },
            { key: 'public_key', label: 'Public Key', type: 'text' },
            { key: 'webhook_secret', label: 'Webhook Secret', type: 'password' },
        ],
    },
    {
        key: 'stripe',
        name: 'Stripe',
        description: 'Gateway internacional com suporte a múltiplas moedas',
        icon: 'mdi-credit-card-multiple-outline',
        color: 'purple',
        category: 'payment',
        fields: [
            { key: 'secret_key', label: 'Secret Key', type: 'password' },
            { key: 'publishable_key', label: 'Publishable Key', type: 'text' },
            { key: 'webhook_secret', label: 'Webhook Secret', type: 'password' },
        ],
    },
    {
        key: 'whatsapp',
        name: 'WhatsApp Business',
        description: 'Receba pedidos e envie confirmações via WhatsApp',
        icon: 'mdi-whatsapp',
        color: 'success',
        category: 'communication',
        fields: [
            { key: 'phone_number', label: 'Número (com DDI)', type: 'text', hint: 'Ex: 5511999999999' },
            { key: 'api_token', label: 'API Token', type: 'password' },
        ],
    },
    {
        key: 'melhorenvio',
        name: 'Melhor Envio',
        description: 'Cotação e etiquetas de frete integradas',
        icon: 'mdi-truck-outline',
        color: 'warning',
        category: 'shipping',
        fields: [
            { key: 'api_token', label: 'API Token', type: 'password' },
            { key: 'sandbox', label: 'Ambiente', type: 'select', options: ['sandbox', 'production'] },
        ],
    },
    {
        key: 'google_analytics',
        name: 'Google Analytics 4',
        description: 'Acompanhe o tráfego da sua vitrine',
        icon: 'mdi-google-analytics',
        color: 'orange',
        category: 'analytics',
        fields: [
            { key: 'measurement_id', label: 'Measurement ID', type: 'text', hint: 'Ex: G-XXXXXXXXXX' },
        ],
    },
    {
        key: 'meta_pixel',
        name: 'Meta Pixel',
        description: 'Rastreie conversões para anúncios do Facebook/Instagram',
        icon: 'mdi-power-plug',
        color: 'primary',
        category: 'analytics',
        fields: [
            { key: 'pixel_id', label: 'Pixel ID', type: 'text' },
        ],
    },
]

const categoryMeta = {
    payment: { label: 'Pagamentos', icon: 'mdi-cash-multiple' },
    shipping: { label: 'Frete', icon: 'mdi-truck-outline' },
    communication: { label: 'Comunicação', icon: 'mdi-chat-outline' },
    analytics: { label: 'Analytics', icon: 'mdi-chart-line' },
}

/* Query — integrações ativas */
const integrationsQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return []
    const { data } = await supabase
        .from('integrations')
        .select('id, provider, config, is_active, created_at, updated_at')
        .is('deleted_at', null)
    return data ?? []
}, { watchSource: [currentStoreId] })

const integrationsByProvider = computed(() => {
    const map = new Map<string, any>()
    for (const i of integrationsQuery.data.value ?? []) map.set(i.provider, i)
    return map
})

/* Dialog de configuração de integração */
const integrationDialog = reactive({
    open: false,
    provider: null as IntegrationProvider | null,
    editing: false,
    config: {} as Record<string, any>,
    credentials: {} as Record<string, any>,
})

function openIntegration(provider: IntegrationProvider) {
    integrationDialog.provider = provider
    const existing = integrationsByProvider.value.get(provider.key)
    integrationDialog.editing = !!existing
    integrationDialog.config = { ...(existing?.config ?? {}) }
    // Credenciais não voltam do banco — usuário precisa reinserir para atualizar
    integrationDialog.credentials = {}
    integrationDialog.open = true
}

const { execute: saveIntegration, loading: savingIntegration } = useAsyncAction(
    async () => {
        if (!integrationDialog.provider || !currentStoreId.value) return

        const provider = integrationDialog.provider
        const payload = {
            store_id: currentStoreId.value,
            provider: provider.key,
            config: integrationDialog.config,
            is_active: true,
        }

        if (integrationDialog.editing) {
            const { error } = await supabase
                .from('integrations')
                .update(payload)
                .eq('store_id', currentStoreId.value)
                .eq('provider', provider.key)
            if (error) throw error
        } else {
            const { error } = await supabase.from('integrations').insert(payload)
            if (error) throw error
        }

        // Nota: credenciais deveriam ser gravadas via Edge Function
        // que criptografa com pgp_sym_encrypt e a chave do Vault.
        // Aqui simulamos apenas o config (não secreto).
        const hasCredentials = Object.values(integrationDialog.credentials).some(v => v)
        if (hasCredentials) {
            notify.info('Credenciais serão criptografadas em processamento server-side.')
        }

        integrationDialog.open = false
        await integrationsQuery.refresh()
    },
    { successMsg: 'Integração configurada' },
)

const { execute: toggleIntegration } = useAsyncAction(
    async (provider: string, active: boolean) => {
        await supabase
            .from('integrations')
            .update({ is_active: active })
            .eq('store_id', currentStoreId.value!)
            .eq('provider', provider)
        await integrationsQuery.refresh()
    },
    { successMsg: 'Status alterado' },
)

const confirmDisconnect = reactive({
    open: false,
    provider: null as IntegrationProvider | null,
})

function askDisconnect(provider: IntegrationProvider) {
    confirmDisconnect.provider = provider
    confirmDisconnect.open = true
}

const { execute: disconnectIntegration, loading: disconnecting } = useAsyncAction(
    async () => {
        if (!confirmDisconnect.provider || !currentStoreId.value) return
        await supabase
            .from('integrations')
            .update({ deleted_at: new Date().toISOString() })
            .eq('store_id', currentStoreId.value)
            .eq('provider', confirmDisconnect.provider.key)
        confirmDisconnect.open = false
        await integrationsQuery.refresh()
    },
    { successMsg: 'Integração desconectada' },
)

/* -------------------------------------------------------------------------- */
/*  Zona de perigo — deletar loja                                             */
/* -------------------------------------------------------------------------- */

const deleteDialog = reactive({
    open: false,
    typedName: '',
})

const canConfirmDelete = computed(() =>
    deleteDialog.typedName === currentStore.value?.name,
)

const { execute: deleteStore, loading: deletingStore } = useAsyncAction(
    async () => {
        if (!currentStoreId.value) return
        const { error } = await supabase
            .from('stores')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', currentStoreId.value)
        if (error) throw error

        deleteDialog.open = false
        await auth.signOut()
        window.location.href = '/'
    },
    { successMsg: 'Loja arquivada' },
)

/* -------------------------------------------------------------------------- */
/*  Copiar URL pública                                                        */
/* -------------------------------------------------------------------------- */

const publicUrl = computed(() =>
    form.slug ? `${window.location.origin}/s/${form.slug}` : '',
)

async function copyPublicUrl() {
    if (!publicUrl.value) return
    await navigator.clipboard.writeText(publicUrl.value)
    notify.success('Link copiado')
}

onMounted(() => {
    integrationsQuery.refresh()
})
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- ==================== HEADER ==================== -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">Configurações</h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Personalize sua loja, gerencie integrações e configure as regras comerciais.
                </p>
            </div>

            <div v-if="hasChanges && activeTab !== 'integrations' && activeTab !== 'danger'" class="d-flex ga-2">
                <v-btn variant="text" class="text-none" :disabled="saving" @click="discardChanges">
                    Descartar
                </v-btn>
                <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6"
                    prepend-icon="mdi-content-save-outline" :loading="saving" :disabled="!canEdit || !isSlugValid"
                    @click="saveStore">
                    Salvar alterações
                </v-btn>
            </div>
        </header>

        <!-- ==================== ALERTA DE PERMISSÃO ==================== -->
        <v-alert v-if="!canEdit" type="warning" variant="tonal" rounded="lg" density="compact" icon="mdi-lock-outline">
            Apenas <strong>proprietários e administradores</strong> podem alterar configurações.
            Você pode visualizar mas não editar.
        </v-alert>

        <!-- ==================== TABS ==================== -->
        <v-card rounded="xl" border flat class="overflow-hidden">
            <v-tabs v-model="activeTab" color="primary" align-tabs="start" show-arrows class="settings-tabs">
                <v-tab value="general" class="text-none">
                    <v-icon start>mdi-information-outline</v-icon>
                    Geral
                </v-tab>
                <v-tab value="branding" class="text-none">
                    <v-icon start>mdi-palette-outline</v-icon>
                    Identidade visual
                </v-tab>
                <v-tab value="commercial" class="text-none">
                    <v-icon start>mdi-cash-register</v-icon>
                    Comercial
                </v-tab>
                <v-tab value="integrations" class="text-none">
                    <v-icon start>mdi-connection</v-icon>
                    Integrações
                    <v-chip v-if="integrationsQuery.data.value?.length" size="x-small" variant="tonal" class="ml-2">
                        {{ integrationsQuery.data.value.length }}
                    </v-chip>
                </v-tab>
                <v-tab v-if="isOwner" value="danger" class="text-none text-error">
                    <v-icon start>mdi-alert-outline</v-icon>
                    Zona de perigo
                </v-tab>
            </v-tabs>

            <v-divider />

            <v-window v-model="activeTab">

                <!-- ============================================================ -->
                <!--  TAB 1 — GERAL                                              -->
                <!-- ============================================================ -->
                <v-window-item value="general" class="pa-6">
                    <v-row>
                        <v-col cols="12" md="8">
                            <div class="text-subtitle-1 font-weight-bold mb-4">
                                Informações básicas
                            </div>

                            <v-row dense>
                                <v-col cols="12">
                                    <v-text-field v-model="form.name" label="Nome da loja *" variant="outlined"
                                        density="comfortable" prepend-inner-icon="mdi-storefront-outline"
                                        :readonly="!canEdit" />
                                </v-col>

                                <v-col cols="12" md="8">
                                    <v-text-field v-model="form.slug" label="Slug (URL) *" variant="outlined"
                                        density="comfortable" prefix="loja.vibestore.app/s/" :readonly="!canEdit"
                                        :error="!!form.slug && !isSlugValid" :messages="slugCheck.message"
                                        :hint="!form.slug ? 'Ex: minha-loja' : ''">
                                        <template #append-inner>
                                            <v-progress-circular v-if="slugCheck.checking" indeterminate size="16"
                                                width="2" />
                                            <v-icon v-else-if="form.slug && isSlugValid" color="success"
                                                size="18">mdi-check-circle</v-icon>
                                        </template>
                                    </v-text-field>
                                </v-col>

                                <v-col cols="12" md="4" class="d-flex align-center">
                                    <v-btn variant="text" size="small" class="text-none" prepend-icon="mdi-magic-staff"
                                        :disabled="!canEdit || !form.name" @click="suggestSlug">
                                        Sugerir
                                    </v-btn>
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="form.email" label="E-mail de contato *" type="email"
                                        variant="outlined" density="comfortable" prepend-inner-icon="mdi-email-outline"
                                        :readonly="!canEdit" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="form.phone" label="Telefone" variant="outlined"
                                        density="comfortable" prepend-inner-icon="mdi-phone-outline"
                                        placeholder="(11) 99999-9999" :readonly="!canEdit" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="form.cnpj" label="CNPJ" variant="outlined"
                                        density="comfortable" prepend-inner-icon="mdi-card-account-details-outline"
                                        :readonly="!canEdit" placeholder="00.000.000/0000-00" />
                                </v-col>
                            </v-row>

                            <v-divider class="my-6" />

                            <div class="text-subtitle-1 font-weight-bold mb-4">
                                Endereço
                            </div>

                            <v-row dense>
                                <v-col cols="12" md="8">
                                    <v-text-field v-model="form.address.street" label="Rua" variant="outlined"
                                        density="comfortable" :readonly="!canEdit" />
                                </v-col>
                                <v-col cols="6" md="2">
                                    <v-text-field v-model="form.address.number" label="Número" variant="outlined"
                                        density="comfortable" :readonly="!canEdit" />
                                </v-col>
                                <v-col cols="6" md="2">
                                    <v-text-field v-model="form.address.postal_code" label="CEP" variant="outlined"
                                        density="comfortable" :readonly="!canEdit" />
                                </v-col>
                                <v-col cols="12" md="4">
                                    <v-text-field v-model="form.address.complement" label="Complemento"
                                        variant="outlined" density="comfortable" :readonly="!canEdit" />
                                </v-col>
                                <v-col cols="12" md="4">
                                    <v-text-field v-model="form.address.neighborhood" label="Bairro" variant="outlined"
                                        density="comfortable" :readonly="!canEdit" />
                                </v-col>
                                <v-col cols="8" md="3">
                                    <v-text-field v-model="form.address.city" label="Cidade" variant="outlined"
                                        density="comfortable" :readonly="!canEdit" />
                                </v-col>
                                <v-col cols="4" md="1">
                                    <v-text-field v-model="form.address.state" label="UF" variant="outlined"
                                        density="comfortable" maxlength="2" :readonly="!canEdit" />
                                </v-col>
                            </v-row>
                        </v-col>

                        <v-col cols="12" md="4">
                            <v-card variant="tonal" color="primary" rounded="lg" class="pa-4">
                                <div class="text-overline mb-2">Vitrine pública</div>
                                <div v-if="publicUrl" class="d-flex flex-column ga-2">
                                    <code class="public-url">{{ publicUrl }}</code>
                                    <div class="d-flex ga-2 justify-space-between">
                                        <v-btn size="small" variant="tonal" class="text-none"
                                            prepend-icon="mdi-content-copy" @click="copyPublicUrl">
                                            Copiar
                                        </v-btn>
                                        <p>- ou -</p>
                                        <v-btn size="small" variant="tonal" class="text-none"
                                            prepend-icon="mdi-open-in-new" :href="publicUrl" target="_blank">
                                            Abrir
                                        </v-btn>
                                    </div>
                                </div>
                                <div v-else class="text-caption text-medium-emphasis">
                                    Defina um slug para gerar o link público.
                                </div>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 2 — IDENTIDADE VISUAL                                  -->
                <!-- ============================================================ -->
                <v-window-item value="branding" class="pa-6">
                    <v-row>
                        <!-- Logo -->
                        <v-col cols="12" md="6">
                            <div class="text-subtitle-1 font-weight-bold mb-2">Logo</div>
                            <p class="text-caption text-medium-emphasis mb-3">
                                Recomendado: PNG quadrado com fundo transparente · máx. 2MB
                            </p>

                            <div class="upload-preview logo-preview">
                                <div v-if="logoUploading" class="upload-loading">
                                    <v-progress-circular indeterminate size="32" />
                                    <span class="text-caption mt-2">Enviando...</span>
                                </div>
                                <v-img v-else-if="currentStore?.logo_url" :src="currentStore.logo_url" aspect-ratio="1"
                                    contain class="preview-img" />
                                <div v-else class="preview-empty">
                                    <v-icon size="48" color="grey-lighten-1">mdi-image-off-outline</v-icon>
                                    <span class="text-caption text-medium-emphasis mt-2">
                                        Nenhum logo enviado
                                    </span>
                                </div>
                            </div>

                            <div class="d-flex ga-2 mt-3">
                                <v-file-input label="Enviar novo logo" accept="image/*" prepend-icon=""
                                    prepend-inner-icon="mdi-cloud-upload-outline" variant="outlined"
                                    density="comfortable" hide-details :disabled="!canEdit || logoUploading"
                                    @update:model-value="handleLogoUpload" />
                                <v-btn v-if="currentStore?.logo_url" icon="mdi-trash-can-outline" variant="text"
                                    color="error" :disabled="!canEdit" @click="removeLogo" />
                            </div>
                        </v-col>

                        <!-- Banner -->
                        <v-col cols="12" md="6">
                            <div class="text-subtitle-1 font-weight-bold mb-2">Banner</div>
                            <p class="text-caption text-medium-emphasis mb-3">
                                Recomendado: 1920×640px · máx. 5MB
                            </p>

                            <div class="upload-preview banner-preview">
                                <div v-if="bannerUploading" class="upload-loading">
                                    <v-progress-circular indeterminate size="32" />
                                    <span class="text-caption mt-2">Enviando...</span>
                                </div>
                                <v-img v-else-if="currentStore?.banner_url" :src="currentStore.banner_url" cover
                                    class="preview-img" />
                                <div v-else class="preview-empty">
                                    <v-icon size="48" color="grey-lighten-1">mdi-panorama-outline</v-icon>
                                    <span class="text-caption text-medium-emphasis mt-2">
                                        Nenhum banner enviado
                                    </span>
                                </div>
                            </div>

                            <div class="d-flex ga-2 mt-3">
                                <v-file-input label="Enviar novo banner" accept="image/*" prepend-icon=""
                                    prepend-inner-icon="mdi-cloud-upload-outline" variant="outlined"
                                    density="comfortable" hide-details :disabled="!canEdit || bannerUploading"
                                    @update:model-value="handleBannerUpload" />
                                <v-btn v-if="currentStore?.banner_url" icon="mdi-trash-can-outline" variant="text"
                                    color="error" :disabled="!canEdit" @click="removeBanner" />
                            </div>
                        </v-col>

                        <v-col cols="12">
                            <v-divider class="my-4" />
                            <div class="text-subtitle-1 font-weight-bold mb-4">Cor de destaque</div>

                            <div class="d-flex align-center ga-4 flex-wrap">
                                <div class="color-preview" :style="{ background: form.settings.theme_color }" />
                                <v-text-field v-model="form.settings.theme_color" label="Cor primária"
                                    variant="outlined" density="comfortable" style="max-width: 200px"
                                    :readonly="!canEdit" prepend-inner-icon="mdi-palette" />
                                <div class="d-flex ga-1">
                                    <button
                                        v-for="c in ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#0ea5e9', '#000000']"
                                        :key="c" class="color-swatch" :style="{ background: c }" :disabled="!canEdit"
                                        @click="canEdit && (form.settings.theme_color = c)" />
                                </div>
                            </div>
                        </v-col>

                        <v-col cols="12">
                            <v-divider class="my-4" />
                            <div class="text-subtitle-1 font-weight-bold mb-4">Redes sociais</div>

                            <v-row dense>
                                <v-col cols="12" md="4">
                                    <v-text-field v-model="form.settings.social.instagram" label="Instagram"
                                        variant="outlined" density="comfortable" prepend-inner-icon="mdi-instagram"
                                        prefix="@" placeholder="minhaloja" :readonly="!canEdit" />
                                </v-col>
                                <v-col cols="12" md="4">
                                    <v-text-field v-model="form.settings.social.facebook" label="Facebook"
                                        variant="outlined" density="comfortable" prepend-inner-icon="mdi-facebook"
                                        placeholder="fb.com/minhaloja" :readonly="!canEdit" />
                                </v-col>
                                <v-col cols="12" md="4">
                                    <v-text-field v-model="form.settings.social.tiktok" label="TikTok"
                                        variant="outlined" density="comfortable" prefix="@" placeholder="minhaloja"
                                        :readonly="!canEdit" prepend-inner-icon="mdi-tik-tok">
                                        <template #prepend-inner>
                                            <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="24"
                                                height="24" viewBox="0 0 24 24">
                                                <path
                                                    d="M 6 3 C 4.3550302 3 3 4.3550302 3 6 L 3 18 C 3 19.64497 4.3550302 21 6 21 L 18 21 C 19.64497 21 21 19.64497 21 18 L 21 6 C 21 4.3550302 19.64497 3 18 3 L 6 3 z M 12 7 L 14 7 C 14 8.005 15.471 9 16 9 L 16 11 C 15.395 11 14.668 10.734156 14 10.285156 L 14 14 C 14 15.654 12.654 17 11 17 C 9.346 17 8 15.654 8 14 C 8 12.346 9.346 11 11 11 L 11 13 C 10.448 13 10 13.449 10 14 C 10 14.551 10.448 15 11 15 C 11.552 15 12 14.551 12 14 L 12 7 z">
                                                </path>
                                            </svg>
                                        </template>
                                    </v-text-field>
                                </v-col>
                            </v-row>
                        </v-col>
                    </v-row>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 3 — COMERCIAL                                          -->
                <!-- ============================================================ -->
                <v-window-item value="commercial" class="pa-6">
                    <v-row>
                        <v-col cols="12" md="8">
                            <div class="text-subtitle-1 font-weight-bold mb-4">
                                Configurações de checkout
                            </div>

                            <v-row dense>
                                <v-col cols="12">
                                    <v-select v-model="form.settings.checkout_via" :items="[
                                        { title: '🌐 Gateway online + WhatsApp', value: 'both' },
                                        { title: '💳 Somente gateway online', value: 'gateway' },
                                        { title: '📱 Somente WhatsApp', value: 'whatsapp' },
                                    ]" label="Formas de finalizar pedido" variant="outlined" density="comfortable"
                                        :readonly="!canEdit" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="form.settings.whatsapp_number"
                                        label="Número WhatsApp para pedidos" variant="outlined" density="comfortable"
                                        prepend-inner-icon="mdi-whatsapp" placeholder="5511999999999"
                                        hint="Com DDI, sem espaços" :readonly="!canEdit" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="form.settings.order_prefix" label="Prefixo do pedido"
                                        variant="outlined" density="comfortable" placeholder="ORD"
                                        hint="Aparece antes do número: ORD-000123" :readonly="!canEdit" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model.number="form.settings.min_order_value" label="Pedido mínimo"
                                        prefix="R$" type="number" step="0.01" variant="outlined" density="comfortable"
                                        hint="0 = sem mínimo" :readonly="!canEdit" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model.number="form.settings.shipping_free_above"
                                        label="Frete grátis acima de" prefix="R$" type="number" step="0.01"
                                        variant="outlined" density="comfortable" hint="0 = frete grátis desativado"
                                        :readonly="!canEdit" />
                                </v-col>
                            </v-row>

                            <v-divider class="my-6" />

                            <div class="text-subtitle-1 font-weight-bold mb-4">
                                Regras da vitrine
                            </div>

                            <div class="d-flex flex-column ga-2">
                                <v-switch v-model="form.settings.show_prices" color="primary" hide-details
                                    density="compact" :disabled="!canEdit">
                                    <template #label>
                                        <div>
                                            <div class="text-body-2 font-weight-medium">Exibir preços na vitrine</div>
                                            <div class="text-caption text-medium-emphasis">
                                                Se desativado, cliente precisa entrar em contato para saber valores
                                            </div>
                                        </div>
                                    </template>
                                </v-switch>

                                <v-switch v-model="form.settings.allow_guest_checkout" color="primary" hide-details
                                    density="compact" :disabled="!canEdit">
                                    <template #label>
                                        <div>
                                            <div class="text-body-2 font-weight-medium">Permitir compra como visitante
                                            </div>
                                            <div class="text-caption text-medium-emphasis">
                                                Sem exigir cadastro no primeiro pedido
                                            </div>
                                        </div>
                                    </template>
                                </v-switch>

                                <v-switch v-model="form.settings.require_cpf" color="primary" hide-details
                                    density="compact" :disabled="!canEdit">
                                    <template #label>
                                        <div>
                                            <div class="text-body-2 font-weight-medium">Exigir CPF no checkout</div>
                                            <div class="text-caption text-medium-emphasis">
                                                Necessário para emissão de nota fiscal
                                            </div>
                                        </div>
                                    </template>
                                </v-switch>
                            </div>
                        </v-col>

                        <v-col cols="12" md="4">
                            <v-card variant="tonal" color="info" rounded="lg" class="pa-4">
                                <v-icon color="info" class="mb-2">mdi-lightbulb-outline</v-icon>
                                <div class="text-subtitle-2 font-weight-bold mb-2">Dica</div>
                                <p class="text-caption mb-0">
                                    Lojas com <strong>frete grátis acima de um valor</strong> têm
                                    ticket médio 22% maior que lojas com frete fixo.
                                    Considere ativar essa regra para aumentar seu ticket.
                                </p>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 4 — INTEGRAÇÕES                                        -->
                <!-- ============================================================ -->
                <v-window-item value="integrations" class="pa-6">
                    <div v-for="(catInfo, catKey) in categoryMeta" :key="catKey" class="mb-6">
                        <div class="d-flex align-center ga-2 mb-3">
                            <v-icon color="primary" size="20">{{ catInfo.icon }}</v-icon>
                            <h3 class="text-subtitle-1 font-weight-bold">{{ catInfo.label }}</h3>
                        </div>

                        <v-row dense>
                            <v-col v-for="provider in providers.filter(p => p.category === catKey)" :key="provider.key"
                                cols="12" md="6">
                                <v-card variant="outlined" rounded="lg" class="pa-4 integration-card h-100" :class="{
                                    'is-active': integrationsByProvider.get(provider.key)?.is_active
                                }">
                                    <div class="d-flex align-start ga-3">
                                        <v-avatar :color="provider.color" variant="tonal" size="44" rounded="lg">
                                            <v-icon>{{ provider.icon }}</v-icon>
                                        </v-avatar>

                                        <div class="flex-grow-1 min-width-0">
                                            <div class="d-flex align-center justify-space-between ga-2">
                                                <div class="min-width-0">
                                                    <div class="text-body-1 font-weight-bold text-truncate">
                                                        {{ provider.name }}
                                                    </div>
                                                    <div class="text-caption text-medium-emphasis">
                                                        {{ provider.description }}
                                                    </div>
                                                </div>

                                                <v-chip v-if="integrationsByProvider.get(provider.key)" size="x-small"
                                                    :color="integrationsByProvider.get(provider.key)?.is_active ? 'success' : 'grey'"
                                                    variant="tonal">
                                                    {{ integrationsByProvider.get(provider.key)?.is_active ? 'Ativa' :
                                                        'Pausada' }}
                                                </v-chip>
                                            </div>

                                            <div class="d-flex ga-1 mt-3">
                                                <template v-if="integrationsByProvider.get(provider.key)">
                                                    <v-btn size="small" variant="tonal" color="primary"
                                                        class="text-none" prepend-icon="mdi-cog-outline"
                                                        :disabled="!canEdit" @click="openIntegration(provider)">
                                                        Configurar
                                                    </v-btn>
                                                    <v-btn size="small" variant="text"
                                                        :color="integrationsByProvider.get(provider.key)?.is_active ? 'warning' : 'success'"
                                                        class="text-none" :disabled="!canEdit"
                                                        @click="toggleIntegration(provider.key, !integrationsByProvider.get(provider.key)?.is_active)">
                                                        {{ integrationsByProvider.get(provider.key)?.is_active ?
                                                            'Pausar' : 'Ativar' }}
                                                    </v-btn>
                                                    <v-spacer />
                                                    <v-btn size="small" variant="text" color="error"
                                                        icon="mdi-link-variant-off" :disabled="!canEdit"
                                                        @click="askDisconnect(provider)" />
                                                </template>
                                                <template v-else>
                                                    <v-btn size="small" variant="flat" color="primary" class="text-none"
                                                        prepend-icon="mdi-plus" :disabled="!canEdit"
                                                        @click="openIntegration(provider)">
                                                        Conectar
                                                    </v-btn>
                                                </template>
                                            </div>
                                        </div>
                                    </div>
                                </v-card>
                            </v-col>
                        </v-row>
                    </div>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 5 — ZONA DE PERIGO                                     -->
                <!-- ============================================================ -->
                <v-window-item v-if="isOwner" value="danger" class="pa-6">
                    <v-card variant="outlined" rounded="lg" class="pa-6 danger-card">
                        <div class="d-flex align-start ga-3 mb-4">
                            <v-avatar color="error" variant="tonal" size="44">
                                <v-icon>mdi-alert-outline</v-icon>
                            </v-avatar>
                            <div>
                                <h3 class="text-h6 font-weight-bold">Arquivar loja</h3>
                                <p class="text-body-2 text-medium-emphasis mb-0">
                                    Sua loja será movida para a lixeira. Você perderá acesso ao painel
                                    e a vitrine pública ficará indisponível.
                                </p>
                            </div>
                        </div>

                        <v-alert type="warning" variant="tonal" density="compact" rounded="lg" class="mb-4">
                            <div class="text-caption">
                                <strong>O que acontece:</strong>
                                <ul class="mt-1 mb-0">
                                    <li>Todos os produtos ficam invisíveis</li>
                                    <li>A URL pública retorna erro 404</li>
                                    <li>Os dados são mantidos por 30 dias para eventual recuperação</li>
                                    <li>Suas integrações são pausadas automaticamente</li>
                                </ul>
                            </div>
                        </v-alert>

                        <v-btn color="error" variant="outlined" prepend-icon="mdi-trash-can-outline" class="text-none"
                            @click="deleteDialog.open = true">
                            Arquivar loja
                        </v-btn>
                    </v-card>
                </v-window-item>

            </v-window>
        </v-card>

        <!-- ==================== DIALOG DE INTEGRAÇÃO ==================== -->
        <v-dialog v-model="integrationDialog.open" max-width="600" persistent scrollable>
            <v-card v-if="integrationDialog.provider" rounded="xl">
                <v-toolbar color="surface" border="b" density="comfortable">
                    <v-btn icon="mdi-close" variant="text" @click="integrationDialog.open = false" />
                    <v-toolbar-title class="d-flex align-center ga-2">
                        <v-avatar :color="integrationDialog.provider.color" variant="tonal" size="32">
                            <v-icon size="18">{{ integrationDialog.provider.icon }}</v-icon>
                        </v-avatar>
                        <span class="font-weight-black">{{ integrationDialog.provider.name }}</span>
                    </v-toolbar-title>
                </v-toolbar>

                <v-card-text class="pa-6">
                    <v-alert type="info" variant="tonal" density="compact" rounded="lg" class="mb-4"
                        icon="mdi-shield-lock-outline">
                        <div class="text-caption">
                            Suas credenciais são criptografadas antes de serem armazenadas.
                            Elas nunca são exibidas novamente após salvas.
                        </div>
                    </v-alert>

                    <p class="text-body-2 text-medium-emphasis mb-4">
                        {{ integrationDialog.provider.description }}
                    </p>

                    <v-form>
                        <div v-for="field in integrationDialog.provider.fields" :key="field.key" class="mb-3">
                            <v-select v-if="field.type === 'select'" v-model="integrationDialog.config[field.key]"
                                :label="field.label" :items="field.options" variant="outlined" density="comfortable"
                                :hint="field.hint" persistent-hint />
                            <v-text-field v-else :model-value="field.type === 'password'
                                ? integrationDialog.credentials[field.key]
                                : integrationDialog.config[field.key]" @update:model-value="(v) => field.type === 'password'
                                    ? integrationDialog.credentials[field.key] = v
                                    : integrationDialog.config[field.key] = v" :label="field.label"
                                :type="field.type === 'password' ? 'password' : 'text'" variant="outlined"
                                density="comfortable" :hint="field.type === 'password' && integrationDialog.editing
                                    ? '••••••• (deixe em branco para manter atual)'
                                    : field.hint" persistent-hint
                                :prepend-inner-icon="field.type === 'password' ? 'mdi-key-outline' : 'mdi-form-textbox'" />
                        </div>
                    </v-form>
                </v-card-text>

                <v-divider />

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="savingIntegration"
                        @click="integrationDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6"
                        :loading="savingIntegration" @click="saveIntegration">
                        {{ integrationDialog.editing ? 'Salvar' : 'Conectar' }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== CONFIRMAÇÃO DE DESCONEXÃO ==================== -->
        <v-dialog v-model="confirmDisconnect.open" max-width="460" persistent>
            <v-card v-if="confirmDisconnect.provider" rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-link-variant-off</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Desconectar {{ confirmDisconnect.provider.name }}?
                    </v-card-title>
                </v-card-item>
                <v-card-text>
                    <p class="text-body-2 mb-0">
                        As credenciais serão apagadas. Você poderá reconectar a qualquer momento,
                        mas precisará informar todos os dados novamente.
                    </p>
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="disconnecting"
                        @click="confirmDisconnect.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" class="text-none" :loading="disconnecting"
                        @click="disconnectIntegration">
                        Desconectar
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== CONFIRMAÇÃO DE DELETE ==================== -->
        <v-dialog v-model="deleteDialog.open" max-width="520" persistent>
            <v-card rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-alert-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Arquivar loja permanentemente
                    </v-card-title>
                </v-card-item>
                <v-card-text>
                    <p class="text-body-2 mb-4">
                        Esta ação irá <strong>arquivar sua loja</strong> e todos os dados relacionados.
                        Após 30 dias, tudo será apagado definitivamente.
                    </p>
                    <v-text-field v-model="deleteDialog.typedName"
                        :label="`Digite '${currentStore?.name}' para confirmar`" variant="outlined"
                        density="comfortable" />
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="deletingStore"
                        @click="deleteDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" rounded="pill" class="text-none px-6" :loading="deletingStore"
                        :disabled="!canConfirmDelete" @click="deleteStore">
                        Arquivar loja
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<style scoped>
.h-100 {
    height: 100%;
}

.min-width-0 {
    min-width: 0;
}

.settings-tabs {
    background: rgba(var(--v-theme-surface-variant), 0.3);
}

/* ============================================================ */
/*  Public URL                                                  */
/* ============================================================ */
.public-url {
    display: block;
    background: rgba(var(--v-theme-on-surface), 0.06);
    padding: 8px 10px;
    border-radius: 6px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.8125rem;
    word-break: break-all;
}

/* ============================================================ */
/*  Upload previews                                             */
/* ============================================================ */
.upload-preview {
    border: 2px dashed rgba(var(--v-border-color), 0.3);
    border-radius: 12px;
    background: rgba(var(--v-theme-surface-variant), 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
}

.logo-preview {
    aspect-ratio: 1;
    max-width: 240px;
    margin: 0 auto;
}

.banner-preview {
    aspect-ratio: 3 / 1;
}

.preview-img {
    width: 100%;
    height: 100%;
}

.preview-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    text-align: center;
}

.upload-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
}

/* ============================================================ */
/*  Color picker                                                */
/* ============================================================ */
.color-preview {
    width: 60px;
    height: 60px;
    border-radius: 12px;
    border: 3px solid white;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
}

.color-swatch {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
    padding: 0;
    outline: none;
}

.color-swatch:hover:not(:disabled) {
    transform: scale(1.1);
    border-color: white;
    box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.5);
}

.color-swatch:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

/* ============================================================ */
/*  Integration cards                                           */
/* ============================================================ */
.integration-card {
    transition: all 0.15s ease;
    border-color: rgba(var(--v-border-color), 0.15) !important;
}

.integration-card:hover {
    border-color: rgba(var(--v-theme-primary), 0.35) !important;
    transform: translateY(-1px);
}

.integration-card.is-active {
    border-color: rgba(var(--v-theme-success), 0.4) !important;
    background: rgba(var(--v-theme-success), 0.02);
}

/* ============================================================ */
/*  Danger zone                                                 */
/* ============================================================ */
.danger-card {
    border-color: rgba(var(--v-theme-error), 0.3) !important;
    background: rgba(var(--v-theme-error), 0.02);
}
</style>
