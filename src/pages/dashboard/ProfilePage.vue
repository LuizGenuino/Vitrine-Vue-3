<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { storageService } from '@/services/storage.service'
import { supabase } from '@/lib/supabase'

import type { Profile, UserRole } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const router = useRouter()
const auth = useAuthStore()
const notify = useNotifications()

const { user, profile, stores } = storeToRefs(auth)

/* -------------------------------------------------------------------------- */
/*  Utils                                                                     */
/* -------------------------------------------------------------------------- */

function initialsOf(name: string): string {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function formatPhone(phone: string): string {
    const d = phone.replace(/\D/g, '')
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
    return phone
}

const fmtDate = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

/* -------------------------------------------------------------------------- */
/*  Role metadata                                                             */
/* -------------------------------------------------------------------------- */

const roleMeta: Record<UserRole, { label: string; color: string; icon: string }> = {
    OWNER: { label: 'Proprietário', color: 'error', icon: 'mdi-crown' },
    ADMIN: { label: 'Administrador', color: 'primary', icon: 'mdi-shield-star-outline' },
    MANAGER: { label: 'Gerente', color: 'info', icon: 'mdi-account-tie-outline' },
    SELLER: { label: 'Vendedor', color: 'success', icon: 'mdi-account-cash-outline' },
    EDITOR: { label: 'Editor', color: 'warning', icon: 'mdi-pencil-outline' },
}

/* -------------------------------------------------------------------------- */
/*  Aba ativa                                                                 */
/* -------------------------------------------------------------------------- */

const activeTab = ref<'personal' | 'security' | 'preferences' | 'sessions' | 'danger'>('personal')

/* -------------------------------------------------------------------------- */
/*  Form principal — dados pessoais                                           */
/* -------------------------------------------------------------------------- */

interface ProfileForm {
    full_name: string
    phone: string
    birth_date: string
    bio: string
}

const form = reactive<ProfileForm>({
    full_name: '',
    phone: '',
    birth_date: '',
    bio: '',
})

const originalForm = ref<ProfileForm | null>(null)

const hasChanges = computed(() =>
    originalForm.value && JSON.stringify(form) !== JSON.stringify(originalForm.value),
)

function hydrateForm() {
    if (!profile.value) return
    const prefs: any = (profile.value as any).preferences ?? {} as any
    form.full_name = profile.value.full_name ?? ''
    form.phone = profile.value.phone ?? ''
    form.birth_date = prefs.birth_date ?? ''
    form.bio = prefs.bio ?? ''
    originalForm.value = JSON.parse(JSON.stringify(form))
}

watch(profile, hydrateForm, { immediate: true })

/* -------------------------------------------------------------------------- */
/*  Salvar dados pessoais                                                     */
/* -------------------------------------------------------------------------- */

const { execute: saveProfile, loading: saving } = useAsyncAction(
    async () => {
        if (!user.value) throw new Error('Sem sessão ativa')
        if (!form.full_name.trim()) throw new Error('Nome é obrigatório')
        if (form.full_name.trim().length < 3) throw new Error('Nome muito curto')

        // Preserva outras preferências que possam existir
        const existingPrefs: any = (profile.value as any)?.preferences ?? {}

        const { error } = await supabase.from('profiles').update({
            full_name: form.full_name.trim(),
            phone: form.phone.trim() || null,
            preferences: {
                ...existingPrefs,
                birth_date: form.birth_date || null,
                bio: form.bio.trim() || null,
            },
        }).eq('id', user.value.id)

        if (error) throw error

        await auth.loadProfile?.()
        originalForm.value = JSON.parse(JSON.stringify(form))
    },
    { successMsg: 'Perfil atualizado' },
)

function discardChanges() {
    hydrateForm()
}

/* -------------------------------------------------------------------------- */
/*  Upload de avatar                                                          */
/* -------------------------------------------------------------------------- */

const avatarUploading = ref(false)
const avatarInputRef = ref<HTMLInputElement>()

function triggerAvatarSelect() {
    avatarInputRef.value?.click()
}

async function handleAvatarChange(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file || !user.value) return

    if (file.size > 2 * 1024 * 1024) {
        notify.error('Avatar não pode ultrapassar 2MB')
        return
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
        notify.error('Formato inválido. Use JPG, PNG ou WebP.')
        return
    }

    avatarUploading.value = true
    try {
        const ext = file.name.split('.').pop() ?? 'png'
        const path = storageService.avatarPath(user.value.id, ext)
        await storageService.upload('avatars', path, file, true)

        // Cache-bust para forçar refresh do avatar em toda UI
        const url = storageService.getPublicUrl('avatars', path) + `?v=${Date.now()}`

        const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: url })
            .eq('id', user.value.id)
        if (error) throw error

        await auth.loadProfile?.()
        notify.success('Avatar atualizado')
    } catch (err: any) {
        notify.error(err.message ?? 'Erro ao enviar imagem')
    } finally {
        avatarUploading.value = false
        // limpa o input pra permitir re-selecionar o mesmo arquivo
        if (target) target.value = ''
    }
}

const confirmRemoveAvatar = reactive({ open: false })

const { execute: removeAvatar, loading: removingAvatar } = useAsyncAction(
    async () => {
        if (!user.value) return

        // Tenta apagar do storage (ignora se não existir)
        try {
            const path = `${user.value.id}/avatar.png`
            await storageService.remove('avatars', [path])
        } catch { /* ignora */ }

        await supabase
            .from('profiles')
            .update({ avatar_url: null })
            .eq('id', user.value.id)

        await auth.loadProfile?.()
        confirmRemoveAvatar.open = false
    },
    { successMsg: 'Avatar removido' },
)

/* -------------------------------------------------------------------------- */
/*  Segurança — trocar e-mail                                                 */
/* -------------------------------------------------------------------------- */

const emailForm = reactive({
    newEmail: '',
    pendingConfirmation: false,
})

const isValidEmail = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.newEmail.trim())
    && emailForm.newEmail.trim().toLowerCase() !== user.value?.email?.toLowerCase(),
)

const { execute: changeEmail, loading: changingEmail } = useAsyncAction(
    async () => {
        if (!isValidEmail.value) throw new Error('E-mail inválido')

        const { error } = await supabase.auth.updateUser({
            email: emailForm.newEmail.trim(),
        })
        if (error) throw error

        emailForm.pendingConfirmation = true
    },
    { successMsg: 'Verifique seu novo e-mail para confirmar a mudança' },
)

/* -------------------------------------------------------------------------- */
/*  Segurança — trocar senha                                                  */
/* -------------------------------------------------------------------------- */

const passwordForm = reactive({
    current: '',
    new: '',
    confirm: '',
    showCurrent: false,
    showNew: false,
})

const passwordStrength = computed(() => {
    const p = passwordForm.new
    if (!p) return { score: 0, label: '', color: 'grey' }

    let score = 0
    if (p.length >= 8) score++
    if (p.length >= 12) score++
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++
    if (/\d/.test(p)) score++
    if (/[^A-Za-z0-9]/.test(p)) score++

    if (score <= 1) return { score: 20, label: 'Fraca', color: 'error' }
    if (score === 2) return { score: 40, label: 'Regular', color: 'warning' }
    if (score === 3) return { score: 60, label: 'Boa', color: 'info' }
    if (score === 4) return { score: 80, label: 'Forte', color: 'success' }
    return { score: 100, label: 'Excelente', color: 'success' }
})

const passwordErrors = computed(() => {
    const errs: Record<string, string> = {}
    if (passwordForm.new && passwordForm.new.length < 8) {
        errs.new = 'Mínimo 8 caracteres'
    }
    if (passwordForm.confirm && passwordForm.confirm !== passwordForm.new) {
        errs.confirm = 'As senhas não coincidem'
    }
    return errs
})

const canChangePassword = computed(() =>
    passwordForm.current.length > 0
    && passwordForm.new.length >= 8
    && passwordForm.confirm === passwordForm.new
    && passwordForm.new !== passwordForm.current,
)

const { execute: changePassword, loading: changingPassword } = useAsyncAction(
    async () => {
        if (!user.value?.email) throw new Error('Sem sessão ativa')
        if (!canChangePassword.value) throw new Error('Preencha os campos corretamente')

        // 1. Reautentica com a senha atual (equivale a verificar)
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: user.value.email,
            password: passwordForm.current,
        })
        if (signInError) {
            throw new Error('Senha atual incorreta')
        }

        // 2. Atualiza para a nova senha
        const { error: updateError } = await supabase.auth.updateUser({
            password: passwordForm.new,
        })
        if (updateError) throw updateError

        // 3. Limpa o form
        passwordForm.current = ''
        passwordForm.new = ''
        passwordForm.confirm = ''
    },
    { successMsg: 'Senha alterada com sucesso' },
)

/* -------------------------------------------------------------------------- */
/*  Preferências                                                              */
/* -------------------------------------------------------------------------- */

interface PreferencesForm {
    language: 'pt-BR' | 'en-US' | 'es-ES'
    theme: 'auto' | 'light' | 'dark'
    timezone: string
    notify_new_order: boolean
    notify_low_stock: boolean
    notify_weekly_report: boolean
    notify_marketing: boolean
}

const preferences = reactive<PreferencesForm>({
    language: 'pt-BR',
    theme: 'auto',
    timezone: 'America/Sao_Paulo',
    notify_new_order: true,
    notify_low_stock: true,
    notify_weekly_report: true,
    notify_marketing: false,
})

const originalPreferences = ref<PreferencesForm | null>(null)

const preferencesHasChanges = computed(() =>
    originalPreferences.value
    && JSON.stringify(preferences) !== JSON.stringify(originalPreferences.value),
)

function hydratePreferences() {
    if (!profile.value) return
    const prefs: any = (profile.value as any)?.preferences ?? {}
    preferences.language = prefs.language ?? 'pt-BR'
    preferences.theme = prefs.theme ?? 'auto'
    preferences.timezone = prefs.timezone ?? 'America/Sao_Paulo'
    preferences.notify_new_order = prefs.notify_new_order ?? true
    preferences.notify_low_stock = prefs.notify_low_stock ?? true
    preferences.notify_weekly_report = prefs.notify_weekly_report ?? true
    preferences.notify_marketing = prefs.notify_marketing ?? false
    originalPreferences.value = JSON.parse(JSON.stringify(preferences))
}

watch(profile, hydratePreferences, { immediate: true })

const { execute: savePreferences, loading: savingPreferences } = useAsyncAction(
    async () => {
        if (!user.value) return
        const existingPrefs = (profile.value  as any)?.preferences ?? {}

        const { error } = await supabase.from('profiles').update({
            preferences: {
                ...existingPrefs,
                ...preferences,
            },
        }).eq('id', user.value.id)

        if (error) throw error
        await auth.loadProfile?.()
        originalPreferences.value = JSON.parse(JSON.stringify(preferences))
    },
    { successMsg: 'Preferências salvas' },
)

/* -------------------------------------------------------------------------- */
/*  Sessão — logout global (revoga todos os refresh tokens)                   */
/* -------------------------------------------------------------------------- */

const confirmSignOutAll = reactive({ open: false })

const { execute: signOutEverywhere, loading: signingOutAll } = useAsyncAction(
    async () => {
        await supabase.auth.signOut({ scope: 'global' })
        router.push({ name: 'login' })
    },
    { successMsg: 'Você foi deslogado de todos os dispositivos' },
)

/* -------------------------------------------------------------------------- */
/*  Zona de perigo — deletar conta                                            */
/* -------------------------------------------------------------------------- */

const deleteAccountDialog = reactive({
    open: false,
    typedConfirmation: '',
})

const isOwnerOfAnyStore = computed(() =>
    stores.value.some(s => s.role === 'OWNER' && s.is_active),
)

const canConfirmDeleteAccount = computed(() =>
    deleteAccountDialog.typedConfirmation.trim().toUpperCase() === 'EXCLUIR'
    && !isOwnerOfAnyStore.value,
)

const { execute: deleteAccount, loading: deletingAccount } = useAsyncAction(
    async () => {
        if (!user.value) return

        // Chama uma Edge Function que apaga o auth.users
        // (delete direto pelo cliente não funciona por segurança)
        const { error } = await supabase.functions.invoke('delete-account', {
            body: { user_id: user.value.id },
        })
        if (error) throw error

        await supabase.auth.signOut()
        window.location.href = '/'
    },
    { successMsg: 'Conta excluída' },
)

/* -------------------------------------------------------------------------- */
/*  Info de conta                                                             */
/* -------------------------------------------------------------------------- */

const memberSince = computed(() =>
    user.value?.created_at ? fmtDate(user.value.created_at) : '—',
)

const lastSignIn = computed(() =>
    user.value?.last_sign_in_at ? fmtDate(user.value.last_sign_in_at) : '—',
)

const activeStoresCount = computed(() =>
    stores.value.filter(s => s.is_active).length,
)

onMounted(() => {
    if (!profile.value) auth.loadProfile?.()
})
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- ==================== HEADER ==================== -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">Meu perfil</h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Gerencie seus dados pessoais, senha e preferências da conta.
                </p>
            </div>

            <div v-if="hasChanges && activeTab === 'personal'" class="d-flex ga-2">
                <v-btn variant="text" class="text-none" :disabled="saving" @click="discardChanges">
                    Descartar
                </v-btn>
                <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6"
                    prepend-icon="mdi-content-save-outline" :loading="saving" @click="saveProfile">
                    Salvar alterações
                </v-btn>
            </div>

            <div v-if="preferencesHasChanges && activeTab === 'preferences'" class="d-flex ga-2">
                <v-btn variant="text" class="text-none" :disabled="savingPreferences" @click="hydratePreferences">
                    Descartar
                </v-btn>
                <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6"
                    prepend-icon="mdi-content-save-outline" :loading="savingPreferences" @click="savePreferences">
                    Salvar preferências
                </v-btn>
            </div>
        </header>

        <!-- ==================== CARD DE IDENTIDADE ==================== -->
        <v-card rounded="xl" border flat class="pa-6 identity-card">
            <div class="d-flex align-center ga-4 flex-wrap">
                <!-- Avatar clicável -->
                <div class="avatar-wrapper" @click="triggerAvatarSelect">
                    <v-avatar :image="profile?.avatar_url ?? undefined" color="primary" size="88">
                        <span v-if="!profile?.avatar_url" class="text-h5 font-weight-black text-white">
                            {{ initialsOf(profile?.full_name ?? user?.email ?? '?') }}
                        </span>
                    </v-avatar>
                    <div class="avatar-overlay" :class="{ uploading: avatarUploading }">
                        <v-progress-circular v-if="avatarUploading" indeterminate size="24" color="white" />
                        <v-icon v-else color="white" size="28">mdi-camera-outline</v-icon>
                    </div>
                </div>

                <input ref="avatarInputRef" type="file" accept="image/jpeg,image/png,image/webp" hidden
                    @change="handleAvatarChange">

                <div class="min-width-0 flex-grow-1">
                    <h2 class="text-h5 font-weight-black">
                        {{ profile?.full_name ?? 'Sem nome' }}
                    </h2>
                    <div class="text-body-2 text-medium-emphasis text-truncate">
                        {{ user?.email }}
                    </div>
                    <div class="d-flex ga-2 mt-2 flex-wrap">
                        <v-chip size="small" variant="tonal" prepend-icon="mdi-storefront-outline">
                            {{ activeStoresCount }} {{ activeStoresCount === 1 ? 'loja' : 'lojas' }}
                        </v-chip>
                        <v-chip size="small" variant="tonal" prepend-icon="mdi-calendar-outline">
                            Membro desde {{ memberSince }}
                        </v-chip>
                    </div>
                </div>

                <div class="d-flex ga-2">
                    <v-btn variant="tonal" prepend-icon="mdi-image-edit-outline" class="text-none"
                        :loading="avatarUploading" @click="triggerAvatarSelect">
                        Trocar avatar
                    </v-btn>
                    <v-btn v-if="profile?.avatar_url" icon="mdi-trash-can-outline" variant="text" color="error"
                        @click="confirmRemoveAvatar.open = true" />
                </div>
            </div>
        </v-card>

        <!-- ==================== TABS ==================== -->
        <v-card rounded="xl" border flat class="overflow-hidden">
            <v-tabs v-model="activeTab" color="primary" align-tabs="start" show-arrows class="profile-tabs">
                <v-tab value="personal" class="text-none">
                    <v-icon start>mdi-account-outline</v-icon>
                    Dados pessoais
                </v-tab>
                <v-tab value="security" class="text-none">
                    <v-icon start>mdi-shield-lock-outline</v-icon>
                    Segurança
                </v-tab>
                <v-tab value="preferences" class="text-none">
                    <v-icon start>mdi-cog-outline</v-icon>
                    Preferências
                </v-tab>
                <v-tab value="sessions" class="text-none">
                    <v-icon start>mdi-monitor-cellphone</v-icon>
                    Sessões
                </v-tab>
                <v-tab value="danger" class="text-none text-error">
                    <v-icon start>mdi-alert-outline</v-icon>
                    Zona de perigo
                </v-tab>
            </v-tabs>

            <v-divider />

            <v-window v-model="activeTab">

                <!-- ============================================================ -->
                <!--  TAB 1 — DADOS PESSOAIS                                     -->
                <!-- ============================================================ -->
                <v-window-item value="personal" class="pa-6">
                    <v-row>
                        <v-col cols="12" md="8">
                            <div class="text-subtitle-1 font-weight-bold mb-4">
                                Informações básicas
                            </div>

                            <v-row dense>
                                <v-col cols="12">
                                    <v-text-field v-model="form.full_name" label="Nome completo *" variant="outlined"
                                        density="comfortable" prepend-inner-icon="mdi-account-outline" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="form.phone" label="Telefone" variant="outlined"
                                        density="comfortable" prepend-inner-icon="mdi-phone-outline"
                                        placeholder="(11) 99999-9999" :hint="form.phone ? formatPhone(form.phone) : ''"
                                        persistent-hint />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="form.birth_date" type="date" label="Data de nascimento"
                                        variant="outlined" density="comfortable"
                                        prepend-inner-icon="mdi-cake-variant-outline" />
                                </v-col>

                                <v-col cols="12">
                                    <v-textarea v-model="form.bio" label="Bio"
                                        placeholder="Uma breve descrição sobre você..." rows="3" variant="outlined"
                                        density="comfortable" counter="240" maxlength="240"
                                        prepend-inner-icon="mdi-text-account" />
                                </v-col>
                            </v-row>
                        </v-col>

                        <v-col cols="12" md="4">
                            <v-card variant="tonal" color="info" rounded="lg" class="pa-4">
                                <v-icon color="info" class="mb-2">mdi-information-outline</v-icon>
                                <div class="text-subtitle-2 font-weight-bold mb-2">
                                    Suas informações
                                </div>
                                <p class="text-caption mb-0">
                                    O nome e avatar aparecem para outros membros das suas equipes.
                                    O telefone e data de nascimento são privados e usados apenas para
                                    segurança e comunicações internas.
                                </p>
                            </v-card>

                            <v-card variant="outlined" rounded="lg" class="pa-4 mt-3">
                                <div class="text-subtitle-2 font-weight-bold mb-3">
                                    Minhas lojas
                                </div>
                                <div v-if="!stores.length" class="text-caption text-medium-emphasis">
                                    Você ainda não faz parte de nenhuma loja.
                                </div>
                                <div v-else class="d-flex flex-column ga-2">
                                    <div v-for="s in stores" :key="s.store_id" class="d-flex align-center ga-2">
                                        <v-avatar :image="s.store.logo_url ?? undefined" size="28"
                                            color="grey-lighten-3">
                                            <v-icon size="14" v-if="!s.store.logo_url">mdi-storefront</v-icon>
                                        </v-avatar>
                                        <div class="min-width-0 flex-grow-1">
                                            <div class="text-body-2 font-weight-medium text-truncate">
                                                {{ s.store.name }}
                                            </div>
                                        </div>
                                        <v-chip size="x-small" :color="roleMeta[s.role as UserRole].color"
                                            variant="tonal">
                                            {{ roleMeta[s.role as UserRole].label }}
                                        </v-chip>
                                    </div>
                                </div>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 2 — SEGURANÇA                                          -->
                <!-- ============================================================ -->
                <v-window-item value="security" class="pa-6">
                    <v-row>
                        <!-- E-mail -->
                        <v-col cols="12" md="6">
                            <v-card variant="outlined" rounded="lg" class="pa-5 h-100">
                                <div class="d-flex align-center ga-3 mb-3">
                                    <v-avatar color="primary" variant="tonal" size="40">
                                        <v-icon>mdi-email-outline</v-icon>
                                    </v-avatar>
                                    <div>
                                        <div class="text-subtitle-1 font-weight-bold">
                                            E-mail
                                        </div>
                                        <div class="text-caption text-medium-emphasis">
                                            Usado para login e comunicações
                                        </div>
                                    </div>
                                </div>

                                <v-card variant="tonal" rounded="lg" class="pa-3 mb-3">
                                    <div class="text-caption text-medium-emphasis">E-mail atual</div>
                                    <div class="text-body-2 font-weight-bold">{{ user?.email }}</div>
                                </v-card>

                                <v-alert v-if="emailForm.pendingConfirmation" type="info" variant="tonal"
                                    density="compact" rounded="lg" class="mb-3" icon="mdi-email-fast-outline">
                                    <div class="text-caption">
                                        Enviamos um link de confirmação para
                                        <strong>{{ emailForm.newEmail }}</strong>.
                                        A mudança só vale depois que você clicar no link.
                                    </div>
                                </v-alert>

                                <v-text-field v-model="emailForm.newEmail" label="Novo e-mail" type="email"
                                    variant="outlined" density="comfortable" prepend-inner-icon="mdi-email-plus-outline"
                                    :error="!!emailForm.newEmail && !isValidEmail" :messages="emailForm.newEmail && !isValidEmail
                                        ? 'Digite um e-mail válido e diferente do atual'
                                        : ''" />

                                <v-btn color="primary" variant="flat" rounded="pill" class="text-none mt-3" block
                                    :loading="changingEmail" :disabled="!isValidEmail" @click="changeEmail">
                                    Alterar e-mail
                                </v-btn>
                            </v-card>
                        </v-col>

                        <!-- Senha -->
                        <v-col cols="12" md="6">
                            <v-card variant="outlined" rounded="lg" class="pa-5 h-100">
                                <div class="d-flex align-center ga-3 mb-3">
                                    <v-avatar color="warning" variant="tonal" size="40">
                                        <v-icon>mdi-key-variant</v-icon>
                                    </v-avatar>
                                    <div>
                                        <div class="text-subtitle-1 font-weight-bold">
                                            Senha
                                        </div>
                                        <div class="text-caption text-medium-emphasis">
                                            Atualize regularmente para maior segurança
                                        </div>
                                    </div>
                                </div>

                                <v-text-field v-model="passwordForm.current" label="Senha atual"
                                    :type="passwordForm.showCurrent ? 'text' : 'password'" variant="outlined"
                                    density="comfortable" prepend-inner-icon="mdi-lock-outline"
                                    :append-inner-icon="passwordForm.showCurrent ? 'mdi-eye-off' : 'mdi-eye'"
                                    @click:append-inner="passwordForm.showCurrent = !passwordForm.showCurrent"
                                    autocomplete="current-password" />

                                <v-text-field v-model="passwordForm.new" label="Nova senha"
                                    :type="passwordForm.showNew ? 'text' : 'password'" variant="outlined"
                                    density="comfortable" prepend-inner-icon="mdi-lock-plus-outline"
                                    :append-inner-icon="passwordForm.showNew ? 'mdi-eye-off' : 'mdi-eye'"
                                    @click:append-inner="passwordForm.showNew = !passwordForm.showNew"
                                    :error="!!passwordErrors.new" :messages="passwordErrors.new"
                                    autocomplete="new-password" class="mt-2" />

                                <div v-if="passwordForm.new" class="mb-3">
                                    <div class="d-flex align-center justify-space-between mb-1">
                                        <span class="text-caption text-medium-emphasis">
                                            Força da senha
                                        </span>
                                        <span class="text-caption font-weight-bold"
                                            :class="`text-${passwordStrength.color}`">
                                            {{ passwordStrength.label }}
                                        </span>
                                    </div>
                                    <v-progress-linear :model-value="passwordStrength.score"
                                        :color="passwordStrength.color" height="4" rounded />
                                </div>

                                <v-text-field v-model="passwordForm.confirm" label="Confirme a nova senha"
                                    :type="passwordForm.showNew ? 'text' : 'password'" variant="outlined"
                                    density="comfortable" prepend-inner-icon="mdi-lock-check-outline"
                                    :error="!!passwordErrors.confirm" :messages="passwordErrors.confirm"
                                    autocomplete="new-password" />

                                <v-btn color="warning" variant="flat" rounded="pill" class="text-none mt-3" block
                                    :loading="changingPassword" :disabled="!canChangePassword" @click="changePassword">
                                    Alterar senha
                                </v-btn>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 3 — PREFERÊNCIAS                                       -->
                <!-- ============================================================ -->
                <v-window-item value="preferences" class="pa-6">
                    <v-row>
                        <v-col cols="12" md="6">
                            <div class="text-subtitle-1 font-weight-bold mb-4">
                                Interface
                            </div>

                            <v-select v-model="preferences.language" :items="[
                                { title: '🇧🇷 Português (Brasil)', value: 'pt-BR' },
                                { title: '🇺🇸 English (US)', value: 'en-US' },
                                { title: '🇪🇸 Español', value: 'es-ES' },
                            ]" label="Idioma" variant="outlined" density="comfortable"
                                prepend-inner-icon="mdi-translate" class="mb-3" />

                            <div class="text-subtitle-2 font-weight-bold mb-2">Tema</div>
                            <v-btn-toggle v-model="preferences.theme" mandatory variant="outlined" divided
                                density="comfortable" class="mb-4 w-100">
                                <v-btn value="light" class="text-none flex-grow-1">
                                    <v-icon start>mdi-weather-sunny</v-icon>
                                    Claro
                                </v-btn>
                                <v-btn value="dark" class="text-none flex-grow-1">
                                    <v-icon start>mdi-weather-night</v-icon>
                                    Escuro
                                </v-btn>
                                <v-btn value="auto" class="text-none flex-grow-1">
                                    <v-icon start>mdi-theme-light-dark</v-icon>
                                    Auto
                                </v-btn>
                            </v-btn-toggle>

                            <v-select v-model="preferences.timezone" :items="[
                                { title: '🇧🇷 São Paulo (UTC−3)', value: 'America/Sao_Paulo' },
                                { title: '🇧🇷 Manaus (UTC−4)', value: 'America/Manaus' },
                                { title: '🇧🇷 Rio Branco (UTC−5)', value: 'America/Rio_Branco' },
                                { title: '🇺🇸 New York (UTC−5)', value: 'America/New_York' },
                                { title: '🇵🇹 Lisboa (UTC+0)', value: 'Europe/Lisbon' },
                            ]" label="Fuso horário" variant="outlined" density="comfortable"
                                prepend-inner-icon="mdi-earth" />
                        </v-col>

                        <v-col cols="12" md="6">
                            <div class="text-subtitle-1 font-weight-bold mb-4">
                                Notificações
                            </div>

                            <div class="d-flex flex-column ga-1">
                                <v-switch v-model="preferences.notify_new_order" color="primary" hide-details
                                    density="compact">
                                    <template #label>
                                        <div>
                                            <div class="text-body-2 font-weight-medium">Novos pedidos</div>
                                            <div class="text-caption text-medium-emphasis">
                                                Receba notificação em tempo real quando um pedido chegar
                                            </div>
                                        </div>
                                    </template>
                                </v-switch>

                                <v-switch v-model="preferences.notify_low_stock" color="primary" hide-details
                                    density="compact">
                                    <template #label>
                                        <div>
                                            <div class="text-body-2 font-weight-medium">Estoque baixo</div>
                                            <div class="text-caption text-medium-emphasis">
                                                Alerta quando algum produto ficar com 5 unidades ou menos
                                            </div>
                                        </div>
                                    </template>
                                </v-switch>

                                <v-switch v-model="preferences.notify_weekly_report" color="primary" hide-details
                                    density="compact">
                                    <template #label>
                                        <div>
                                            <div class="text-body-2 font-weight-medium">Relatório semanal</div>
                                            <div class="text-caption text-medium-emphasis">
                                                Resumo por e-mail toda segunda-feira de manhã
                                            </div>
                                        </div>
                                    </template>
                                </v-switch>

                                <v-switch v-model="preferences.notify_marketing" color="primary" hide-details
                                    density="compact">
                                    <template #label>
                                        <div>
                                            <div class="text-body-2 font-weight-medium">Dicas e novidades</div>
                                            <div class="text-caption text-medium-emphasis">
                                                Novidades do produto, cases de sucesso e ofertas
                                            </div>
                                        </div>
                                    </template>
                                </v-switch>
                            </div>
                        </v-col>
                    </v-row>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 4 — SESSÕES                                             -->
                <!-- ============================================================ -->
                <v-window-item value="sessions" class="pa-6">
                    <div class="text-subtitle-1 font-weight-bold mb-4">
                        Sessões ativas
                    </div>

                    <v-card variant="outlined" rounded="lg" class="pa-4 mb-4">
                        <div class="d-flex align-center ga-3">
                            <v-avatar color="success" variant="tonal" size="44">
                                <v-icon>mdi-check-circle-outline</v-icon>
                            </v-avatar>
                            <div class="flex-grow-1 min-width-0">
                                <div class="text-body-1 font-weight-bold">
                                    Sessão atual
                                    <v-chip size="x-small" color="success" variant="flat" class="ml-2">
                                        Este dispositivo
                                    </v-chip>
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                    Último login: {{ lastSignIn }}
                                </div>
                            </div>
                        </div>
                    </v-card>

                    <v-alert type="info" variant="tonal" rounded="lg" density="compact" icon="mdi-information-outline"
                        class="mb-4">
                        <div class="text-caption">
                            Se você suspeita que alguém acessou sua conta, use o botão abaixo
                            para desconectar todos os dispositivos e depois altere sua senha.
                        </div>
                    </v-alert>

                    <v-btn color="warning" variant="tonal" rounded="pill" class="text-none"
                        prepend-icon="mdi-logout-variant" @click="confirmSignOutAll.open = true">
                        Sair de todos os dispositivos
                    </v-btn>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 5 — ZONA DE PERIGO                                     -->
                <!-- ============================================================ -->
                <v-window-item value="danger" class="pa-6">
                    <v-card variant="outlined" rounded="lg" class="pa-6 danger-card">
                        <div class="d-flex align-start ga-3 mb-4">
                            <v-avatar color="error" variant="tonal" size="44">
                                <v-icon>mdi-account-remove-outline</v-icon>
                            </v-avatar>
                            <div>
                                <h3 class="text-h6 font-weight-bold">Excluir minha conta</h3>
                                <p class="text-body-2 text-medium-emphasis mb-0">
                                    Sua conta será apagada permanentemente e você perderá acesso a todas as lojas.
                                </p>
                            </div>
                        </div>

                        <v-alert v-if="isOwnerOfAnyStore" type="warning" variant="tonal" density="compact" rounded="lg"
                            icon="mdi-alert-outline" class="mb-4">
                            <div class="text-caption">
                                Você é <strong>proprietário</strong> de pelo menos uma loja.
                                Antes de excluir sua conta, você precisa
                                <strong>transferir a propriedade</strong> ou <strong>arquivar as lojas</strong>.
                            </div>
                        </v-alert>

                        <v-alert v-else type="warning" variant="tonal" density="compact" rounded="lg" class="mb-4">
                            <div class="text-caption">
                                <strong>O que acontece:</strong>
                                <ul class="mt-1 mb-0">
                                    <li>Você será removido de todas as equipes</li>
                                    <li>Seus dados pessoais (nome, avatar, telefone) serão apagados</li>
                                    <li>Pedidos e produtos criados por você continuam nas lojas, mas anonimizados</li>
                                    <li>Esta ação não pode ser desfeita</li>
                                </ul>
                            </div>
                        </v-alert>

                        <v-btn color="error" variant="outlined" prepend-icon="mdi-trash-can-outline" class="text-none"
                            :disabled="isOwnerOfAnyStore" @click="deleteAccountDialog.open = true">
                            Excluir minha conta
                        </v-btn>
                    </v-card>
                </v-window-item>

            </v-window>
        </v-card>

        <!-- ==================== DIALOG: REMOVER AVATAR ==================== -->
        <v-dialog v-model="confirmRemoveAvatar.open" max-width="420" persistent>
            <v-card rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="warning" variant="tonal" size="44">
                            <v-icon>mdi-image-remove-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Remover avatar?
                    </v-card-title>
                </v-card-item>
                <v-card-text>
                    <p class="text-body-2 mb-0">
                        Sua foto de perfil será apagada. Você pode enviar outra a qualquer momento.
                    </p>
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="removingAvatar"
                        @click="confirmRemoveAvatar.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" class="text-none" :loading="removingAvatar"
                        @click="removeAvatar">
                        Remover
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== DIALOG: LOGOUT GLOBAL ==================== -->
        <v-dialog v-model="confirmSignOutAll.open" max-width="480" persistent>
            <v-card rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="warning" variant="tonal" size="44">
                            <v-icon>mdi-logout-variant</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Sair de todos os dispositivos?
                    </v-card-title>
                </v-card-item>
                <v-card-text>
                    <p class="text-body-2 mb-0">
                        Você será desconectado de todos os navegadores e dispositivos onde
                        fez login, incluindo este. Precisará fazer login novamente.
                    </p>
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="signingOutAll"
                        @click="confirmSignOutAll.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="warning" variant="flat" class="text-none" :loading="signingOutAll"
                        @click="signOutEverywhere">
                        Sim, sair de tudo
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== DIALOG: EXCLUIR CONTA ==================== -->
        <v-dialog v-model="deleteAccountDialog.open" max-width="520" persistent>
            <v-card rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-account-remove-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Excluir conta permanentemente
                    </v-card-title>
                </v-card-item>
                <v-card-text>
                    <p class="text-body-2 mb-4">
                        Esta ação é <strong>irreversível</strong>. Todos os seus dados pessoais
                        serão apagados e você será removido de todas as equipes.
                    </p>
                    <v-text-field v-model="deleteAccountDialog.typedConfirmation"
                        label='Digite "EXCLUIR" para confirmar' variant="outlined" density="comfortable" />
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="deletingAccount"
                        @click="deleteAccountDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" rounded="pill" class="text-none px-6" :loading="deletingAccount"
                        :disabled="!canConfirmDeleteAccount" @click="deleteAccount">
                        Excluir conta
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

.w-100 {
    width: 100%;
}

.min-width-0 {
    min-width: 0;
}

.profile-tabs {
    background: rgba(var(--v-theme-surface-variant), 0.3);
}

/* ============================================================ */
/*  Identity card                                               */
/* ============================================================ */
.identity-card {
    background: linear-gradient(135deg,
            rgba(var(--v-theme-primary), 0.04) 0%,
            rgba(var(--v-theme-primary), 0.08) 100%);
}

/* ============================================================ */
/*  Avatar overlay                                              */
/* ============================================================ */
.avatar-wrapper {
    position: relative;
    cursor: pointer;
    border-radius: 50%;
    overflow: hidden;
}

.avatar-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease;
    border-radius: 50%;
}

.avatar-wrapper:hover .avatar-overlay,
.avatar-overlay.uploading {
    opacity: 1;
}

/* ============================================================ */
/*  Danger card                                                 */
/* ============================================================ */
.danger-card {
    border-color: rgba(var(--v-theme-error), 0.3) !important;
    background: rgba(var(--v-theme-error), 0.02);
}
</style>
