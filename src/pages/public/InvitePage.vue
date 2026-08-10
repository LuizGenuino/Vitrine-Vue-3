<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { supabase } from '@/lib/supabase'

import type { UserRole } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const notify = useNotifications()

const inviteId = computed(() => route.params.id as string)

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface InviteDetails {
    id: string
    store_id: string
    email: string
    role: UserRole
    message: string | null
    created_at: string
    expires_at: string
    accepted_at: string | null
    store: {
        id: string
        name: string
        slug: string
        logo_url: string | null
        banner_url: string | null
    } | null
    invited_by_profile: {
        id: string
        full_name: string
        avatar_url: string | null
    } | null
}

/* -------------------------------------------------------------------------- */
/*  Role metadata (espelho da TeamPage)                                       */
/* -------------------------------------------------------------------------- */

const roleMeta: Record<UserRole, { label: string; color: string; icon: string; description: string }> = {
    OWNER: { label: 'Proprietário', color: 'error', icon: 'mdi-crown', description: 'Controle total da loja' },
    ADMIN: { label: 'Administrador', color: 'primary', icon: 'mdi-shield-star-outline', description: 'Gerencia equipe e configurações' },
    MANAGER: { label: 'Gerente', color: 'info', icon: 'mdi-account-tie-outline', description: 'Gerencia produtos, pedidos e clientes' },
    SELLER: { label: 'Vendedor', color: 'success', icon: 'mdi-account-cash-outline', description: 'Atende pedidos e cadastra clientes' },
    EDITOR: { label: 'Editor', color: 'warning', icon: 'mdi-pencil-outline', description: 'Edita catálogo (produtos e categorias)' },
}

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
})

const daysUntil = (iso: string): number => {
    const diff = new Date(iso).getTime() - Date.now()
    return Math.ceil(diff / 86_400_000)
}

function initialsOf(name: string): string {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

/* -------------------------------------------------------------------------- */
/*  Estado da página                                                          */
/* -------------------------------------------------------------------------- */

type PageState =
    | 'loading'          // carregando dados do convite
    | 'invalid'          // convite não existe
    | 'expired'          // passou da data
    | 'already_accepted' // já aceito antes
    | 'wrong_account'    // logado com e-mail diferente
    | 'needs_auth'       // deslogado — precisa criar conta ou logar
    | 'ready'            // tudo ok, pode aceitar
    | 'accepted'         // sucesso! acabou de aceitar

const pageState = ref<PageState>('loading')
const invite = ref<InviteDetails | null>(null)
const errorMessage = ref('')

/* -------------------------------------------------------------------------- */
/*  Fetch do convite                                                          */
/* -------------------------------------------------------------------------- */

async function loadInvite() {
    pageState.value = 'loading'

    try {
        // Query pública — precisa de policy que permita SELECT anônimo por id do convite
        const { data, error } = await supabase
            .from('team_invites')
            .select(`
        *,
        store:stores(id, name, slug, logo_url, banner_url),
        invited_by_profile:profiles!invited_by(id, full_name, avatar_url)
      `)
            .eq('id', inviteId.value)
            .maybeSingle()

        if (error) throw error

        if (!data) {
            pageState.value = 'invalid'
            errorMessage.value = 'Este link de convite não existe ou foi revogado.'
            return
        }

        invite.value = data as unknown as InviteDetails

        // Já aceito?
        if (invite.value.accepted_at) {
            pageState.value = 'already_accepted'
            return
        }

        // Expirado?
        if (new Date(invite.value.expires_at) < new Date()) {
            pageState.value = 'expired'
            return
        }

        // Determina próximo passo baseado no estado de autenticação
        await evaluateAuthState()
    } catch (err: any) {
        pageState.value = 'invalid'
        errorMessage.value = err.message ?? 'Não foi possível carregar o convite.'
    }
}

async function evaluateAuthState() {
    if (!invite.value) return

    // Aguarda auth inicializar
    if (auth.loading) await auth.init()

    if (!auth.isAuthenticated) {
        pageState.value = 'needs_auth'
        return
    }

    // Comparar e-mail do usuário logado com o do convite
    const userEmail = auth.user?.email?.toLowerCase() ?? ''
    const inviteEmail = invite.value.email.toLowerCase()

    if (userEmail !== inviteEmail) {
        pageState.value = 'wrong_account'
        return
    }

    pageState.value = 'ready'
}

/* -------------------------------------------------------------------------- */
/*  Aceite do convite (RPC atômica)                                           */
/* -------------------------------------------------------------------------- */

const { execute: acceptInvite, loading: accepting } = useAsyncAction(
    async () => {
        if (!invite.value) return

        /**
         * RPC no banco:
         *   - valida que o auth.uid() tem o mesmo e-mail do convite
         *   - valida que não está expirado nem aceito
         *   - insere row em team_members
         *   - marca team_invites.accepted_at = now()
         */
        const { error } = await supabase.rpc('accept_team_invite', {
            p_invite_id: inviteId.value,
        })

        if (error) throw error

        // Recarrega lojas do usuário para incluir a nova
        await auth.loadStores?.()

        // Troca automática para a loja recém-aceita
        if (invite.value.store) {
            auth.switchStore(invite.value.store.id)
        }

        pageState.value = 'accepted'
    },
    { successMsg: 'Bem-vindo(a) à equipe!' },
)

function goToDashboard() {
    router.push({ name: 'dashboard-overview' })
}

/* -------------------------------------------------------------------------- */
/*  Fluxo "Trocar de conta"                                                   */
/* -------------------------------------------------------------------------- */

const { execute: switchAccount } = useAsyncAction(
    async () => {
        await auth.signOut()
        // Após logout, mantém a URL do convite — o guard vai pedir login e voltar
        window.location.href = `/login?redirect=/invite/${inviteId.value}`
    },
)

/* -------------------------------------------------------------------------- */
/*  Fluxos deslogado                                                          */
/* -------------------------------------------------------------------------- */

function goToLogin() {
    router.push({
        name: 'login',
        query: { redirect: `/invite/${inviteId.value}` },
    })
}

function goToSignup() {
    router.push({
        name: 'signup',
        query: {
            redirect: `/invite/${inviteId.value}`,
            email: invite.value?.email, // pré-preenche o e-mail do convite
        },
    })
}

onMounted(() => {
    loadInvite()
})
</script>

<template>
    <div class="invite-page">

        <!-- Banner da loja (se houver) -->
        <div v-if="invite?.store?.banner_url" class="invite-banner"
            :style="{ backgroundImage: `url(${invite.store.banner_url})` }" />

        <v-container class="invite-container">

            <!-- ================================================================ -->
            <!--  LOADING                                                        -->
            <!-- ================================================================ -->
            <v-card v-if="pageState === 'loading'" class="invite-card pa-8 text-center" rounded="xl" elevation="4">
                <v-progress-circular indeterminate color="primary" size="48" />
                <p class="text-body-1 text-medium-emphasis mt-4">
                    Verificando seu convite...
                </p>
            </v-card>

            <!-- ================================================================ -->
            <!--  INVITE INVÁLIDO                                                 -->
            <!-- ================================================================ -->
            <v-card v-else-if="pageState === 'invalid'" class="invite-card pa-8 text-center" rounded="xl" elevation="4">
                <v-avatar color="error" variant="tonal" size="72">
                    <v-icon size="36">mdi-link-variant-off</v-icon>
                </v-avatar>
                <h1 class="text-h5 font-weight-black mt-4 mb-2">
                    Convite inválido
                </h1>
                <p class="text-body-1 text-medium-emphasis mb-6">
                    {{ errorMessage }}
                </p>
                <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6"
                    @click="router.push({ name: 'login' })">
                    Voltar ao login
                </v-btn>
            </v-card>

            <!-- ================================================================ -->
            <!--  EXPIRADO                                                        -->
            <!-- ================================================================ -->
            <v-card v-else-if="pageState === 'expired' && invite" class="invite-card pa-8 text-center" rounded="xl"
                elevation="4">
                <v-avatar color="warning" variant="tonal" size="72">
                    <v-icon size="36">mdi-calendar-remove-outline</v-icon>
                </v-avatar>
                <h1 class="text-h5 font-weight-black mt-4 mb-2">
                    Convite expirado
                </h1>
                <p class="text-body-1 text-medium-emphasis mb-2">
                    Este convite para <strong>{{ invite.store?.name }}</strong> expirou em
                    {{ fmtDate(invite.expires_at) }}.
                </p>
                <p class="text-body-2 text-medium-emphasis mb-6">
                    Peça a <strong>{{ invite.invited_by_profile?.full_name ?? 'quem te convidou' }}</strong>
                    para enviar um novo convite.
                </p>
                <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6"
                    @click="router.push({ name: 'login' })">
                    Voltar ao login
                </v-btn>
            </v-card>

            <!-- ================================================================ -->
            <!--  JÁ ACEITO                                                       -->
            <!-- ================================================================ -->
            <v-card v-else-if="pageState === 'already_accepted' && invite" class="invite-card pa-8 text-center"
                rounded="xl" elevation="4">
                <v-avatar color="info" variant="tonal" size="72">
                    <v-icon size="36">mdi-check-decagram</v-icon>
                </v-avatar>
                <h1 class="text-h5 font-weight-black mt-4 mb-2">
                    Convite já aceito
                </h1>
                <p class="text-body-1 text-medium-emphasis mb-6">
                    Este convite para <strong>{{ invite.store?.name }}</strong> já foi utilizado.
                    Basta fazer login para acessar a loja.
                </p>
                <v-btn v-if="auth.isAuthenticated" color="primary" variant="flat" rounded="pill" class="text-none px-6"
                    @click="goToDashboard">
                    Ir para o painel
                </v-btn>
                <v-btn v-else color="primary" variant="flat" rounded="pill" class="text-none px-6" @click="goToLogin">
                    Fazer login
                </v-btn>
            </v-card>

            <!-- ================================================================ -->
            <!--  CONTA ERRADA                                                    -->
            <!-- ================================================================ -->
            <v-card v-else-if="pageState === 'wrong_account' && invite" class="invite-card pa-8" rounded="xl"
                elevation="4">
                <div class="text-center mb-6">
                    <v-avatar color="warning" variant="tonal" size="72">
                        <v-icon size="36">mdi-account-alert-outline</v-icon>
                    </v-avatar>
                    <h1 class="text-h5 font-weight-black mt-4 mb-2">
                        Conta diferente detectada
                    </h1>
                    <p class="text-body-1 text-medium-emphasis mb-2">
                        Este convite foi enviado para
                        <strong class="text-primary">{{ invite.email }}</strong>,
                        mas você está logado como
                        <strong>{{ auth.user?.email }}</strong>.
                    </p>
                </div>

                <v-alert type="info" variant="tonal" density="compact" rounded="lg" class="mb-6"
                    icon="mdi-information-outline">
                    <div class="text-caption">
                        Faça logout e entre com a conta correta, ou peça a
                        <strong>{{ invite.invited_by_profile?.full_name ?? 'quem te convidou' }}</strong>
                        para reenviar o convite para
                        <strong>{{ auth.user?.email }}</strong>.
                    </div>
                </v-alert>

                <div class="d-flex ga-2 flex-column">
                    <v-btn color="primary" variant="flat" rounded="pill" class="text-none" size="large"
                        prepend-icon="mdi-swap-horizontal" @click="switchAccount">
                        Sair e entrar com outra conta
                    </v-btn>
                    <v-btn variant="text" class="text-none" @click="goToDashboard">
                        Continuar como {{ auth.user?.email }}
                    </v-btn>
                </div>
            </v-card>

            <!-- ================================================================ -->
            <!--  DESLOGADO — PRECISA AUTENTICAR                                 -->
            <!-- ================================================================ -->
            <v-card v-else-if="pageState === 'needs_auth' && invite" class="invite-card" rounded="xl" elevation="4">
                <!-- Cabeçalho com logo da loja -->
                <div class="invite-header text-center pa-6 pb-4">
                    <v-avatar :image="invite.store?.logo_url ?? undefined" color="primary" size="80" rounded="lg"
                        class="mb-3">
                        <v-icon v-if="!invite.store?.logo_url" size="40" color="white">
                            mdi-storefront
                        </v-icon>
                    </v-avatar>

                    <div class="text-overline text-medium-emphasis">
                        Você foi convidado para
                    </div>
                    <h1 class="text-h4 font-weight-black mt-1">
                        {{ invite.store?.name }}
                    </h1>
                </div>

                <v-divider />

                <!-- Detalhes do convite -->
                <div class="pa-6">
                    <div class="invite-detail-grid mb-4">
                        <div class="detail-item">
                            <div class="text-caption text-medium-emphasis">Sua função</div>
                            <v-chip :color="roleMeta[invite.role].color" variant="tonal"
                                :prepend-icon="roleMeta[invite.role].icon" class="mt-1 font-weight-bold">
                                {{ roleMeta[invite.role].label }}
                            </v-chip>
                            <div class="text-caption text-medium-emphasis mt-1">
                                {{ roleMeta[invite.role].description }}
                            </div>
                        </div>

                        <div class="detail-item">
                            <div class="text-caption text-medium-emphasis">Convidado por</div>
                            <div class="d-flex align-center ga-2 mt-1">
                                <v-avatar :image="invite.invited_by_profile?.avatar_url ?? undefined" color="primary"
                                    size="28">
                                    <span v-if="!invite.invited_by_profile?.avatar_url"
                                        class="text-caption font-weight-bold text-white">
                                        {{ initialsOf(invite.invited_by_profile?.full_name ?? '?') }}
                                    </span>
                                </v-avatar>
                                <span class="text-body-2 font-weight-medium">
                                    {{ invite.invited_by_profile?.full_name ?? 'Alguém da equipe' }}
                                </span>
                            </div>
                        </div>

                        <div class="detail-item">
                            <div class="text-caption text-medium-emphasis">Prazo</div>
                            <div class="text-body-2 font-weight-medium mt-1">
                                <v-icon size="14" color="warning">mdi-clock-outline</v-icon>
                                Expira em {{ daysUntil(invite.expires_at) }} dia(s)
                            </div>
                        </div>
                    </div>

                    <!-- Mensagem pessoal -->
                    <v-card v-if="invite.message" variant="tonal" color="primary" rounded="lg"
                        class="pa-4 mb-6 message-card">
                        <v-icon color="primary" size="18" class="message-quote">
                            mdi-format-quote-open
                        </v-icon>
                        <p class="text-body-2 mb-0 pl-6">
                            {{ invite.message }}
                        </p>
                    </v-card>

                    <!-- CTAs -->
                    <div class="text-center mb-4">
                        <div class="text-body-2 text-medium-emphasis mb-3">
                            Para aceitar, entre ou crie uma conta com o e-mail:
                        </div>
                        <v-chip size="large" variant="tonal" color="primary" prepend-icon="mdi-email-outline"
                            class="mb-4 font-weight-bold">
                            {{ invite.email }}
                        </v-chip>
                    </div>

                    <div class="d-flex ga-2 flex-column">
                        <v-btn color="primary" variant="flat" rounded="pill" size="large" class="text-none"
                            prepend-icon="mdi-account-plus-outline" @click="goToSignup">
                            Criar minha conta grátis
                        </v-btn>
                        <v-btn variant="tonal" color="primary" rounded="pill" size="large" class="text-none"
                            prepend-icon="mdi-login" @click="goToLogin">
                            Já tenho conta · entrar
                        </v-btn>
                    </div>

                    <p class="text-caption text-medium-emphasis text-center mt-6 mb-0">
                        Ao aceitar, você concorda com os
                        <a href="/terms" target="_blank" class="text-primary">termos de uso</a>
                        do VibeStore.
                    </p>
                </div>
            </v-card>

            <!-- ================================================================ -->
            <!--  READY — LOGADO E PODE ACEITAR                                   -->
            <!-- ================================================================ -->
            <v-card v-else-if="pageState === 'ready' && invite" class="invite-card" rounded="xl" elevation="4">
                <!-- Cabeçalho com logo -->
                <div class="invite-header text-center pa-6 pb-4">
                    <v-avatar :image="invite.store?.logo_url ?? undefined" color="primary" size="80" rounded="lg"
                        class="mb-3">
                        <v-icon v-if="!invite.store?.logo_url" size="40" color="white">
                            mdi-storefront
                        </v-icon>
                    </v-avatar>

                    <div class="text-overline text-medium-emphasis">
                        Você foi convidado para
                    </div>
                    <h1 class="text-h4 font-weight-black mt-1">
                        {{ invite.store?.name }}
                    </h1>
                    <p class="text-body-2 text-medium-emphasis mt-2">
                        Você entrará como
                        <v-chip :color="roleMeta[invite.role].color" variant="tonal" size="small"
                            :prepend-icon="roleMeta[invite.role].icon" class="ml-1 font-weight-bold">
                            {{ roleMeta[invite.role].label }}
                        </v-chip>
                    </p>
                </div>

                <v-divider />

                <div class="pa-6">
                    <!-- Descrição da função -->
                    <v-card variant="tonal" :color="roleMeta[invite.role].color" rounded="lg" class="pa-4 mb-4">
                        <div class="d-flex ga-3">
                            <v-avatar :color="roleMeta[invite.role].color" variant="flat" size="36">
                                <v-icon color="white" size="20">{{ roleMeta[invite.role].icon }}</v-icon>
                            </v-avatar>
                            <div>
                                <div class="text-body-2 font-weight-bold mb-1">
                                    Como {{ roleMeta[invite.role].label.toLowerCase() }}, você poderá:
                                </div>
                                <div class="text-caption">
                                    {{ roleMeta[invite.role].description }}
                                </div>
                            </div>
                        </div>
                    </v-card>

                    <!-- Quem convidou -->
                    <div class="d-flex align-center ga-3 mb-4 pa-3 rounded-lg bg-surface-variant">
                        <v-avatar :image="invite.invited_by_profile?.avatar_url ?? undefined" color="primary" size="40">
                            <span v-if="!invite.invited_by_profile?.avatar_url" class="text-white font-weight-bold">
                                {{ initialsOf(invite.invited_by_profile?.full_name ?? '?') }}
                            </span>
                        </v-avatar>
                        <div>
                            <div class="text-caption text-medium-emphasis">Convidado por</div>
                            <div class="text-body-2 font-weight-bold">
                                {{ invite.invited_by_profile?.full_name ?? 'Membro da equipe' }}
                            </div>
                        </div>
                    </div>

                    <!-- Mensagem pessoal -->
                    <v-card v-if="invite.message" variant="tonal" color="primary" rounded="lg"
                        class="pa-4 mb-4 message-card">
                        <v-icon color="primary" size="18" class="message-quote">
                            mdi-format-quote-open
                        </v-icon>
                        <p class="text-body-2 mb-0 pl-6">
                            {{ invite.message }}
                        </p>
                    </v-card>

                    <!-- Info do usuário logado -->
                    <v-alert type="success" variant="tonal" density="compact" rounded="lg" class="mb-6"
                        icon="mdi-check-circle-outline">
                        <div class="text-caption">
                            Você está logado como
                            <strong>{{ auth.profile?.full_name ?? auth.user?.email }}</strong>
                            ({{ auth.user?.email }})
                        </div>
                    </v-alert>

                    <!-- CTAs -->
                    <div class="d-flex ga-2 flex-column">
                        <v-btn color="primary" variant="flat" rounded="pill" size="large" class="text-none"
                            prepend-icon="mdi-check-decagram" :loading="accepting" @click="acceptInvite">
                            Aceitar convite e entrar
                        </v-btn>
                        <v-btn variant="text" class="text-none" :disabled="accepting"
                            @click="router.push({ name: 'dashboard-overview' })">
                            Decidir mais tarde
                        </v-btn>
                    </div>
                </div>
            </v-card>

            <!-- ================================================================ -->
            <!--  ACCEPTED — SUCESSO!                                             -->
            <!-- ================================================================ -->
            <v-card v-else-if="pageState === 'accepted' && invite" class="invite-card pa-8 text-center" rounded="xl"
                elevation="4">
                <div class="success-animation mb-4">
                    <v-avatar color="success" variant="tonal" size="88">
                        <v-icon size="48" color="success">mdi-check-decagram</v-icon>
                    </v-avatar>
                </div>

                <h1 class="text-h4 font-weight-black mb-2">
                    🎉 Bem-vindo(a)!
                </h1>
                <p class="text-body-1 text-medium-emphasis mb-6">
                    Você agora faz parte da equipe de
                    <strong>{{ invite.store?.name }}</strong>
                    como <strong>{{ roleMeta[invite.role].label }}</strong>.
                </p>

                <v-btn color="primary" variant="flat" rounded="pill" size="large" class="text-none px-8"
                    prepend-icon="mdi-view-dashboard-outline" append-icon="mdi-arrow-right" @click="goToDashboard">
                    Ir para o painel
                </v-btn>
            </v-card>

        </v-container>
    </div>
</template>

<style scoped>
.invite-page {
    min-height: 100vh;
    background: linear-gradient(135deg,
            rgba(var(--v-theme-primary), 0.04) 0%,
            rgba(var(--v-theme-primary), 0.08) 100%);
    position: relative;
    padding-bottom: 40px;
}

.invite-banner {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 200px;
    background-size: cover;
    background-position: center;
    opacity: 0.4;
    filter: blur(2px);
}

.invite-container {
    position: relative;
    padding-top: 80px;
    max-width: 560px !important;
}

.invite-card {
    background: rgb(var(--v-theme-surface));
    overflow: hidden;
    transition: all 0.3s ease;
}

/* ============================================================ */
/*  Header                                                      */
/* ============================================================ */
.invite-header {
    background: linear-gradient(135deg,
            rgba(var(--v-theme-primary), 0.06) 0%,
            rgba(var(--v-theme-primary), 0.02) 100%);
}

/* ============================================================ */
/*  Details grid                                                */
/* ============================================================ */
.invite-detail-grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.detail-item {
    padding: 12px 16px;
    border-radius: 12px;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border: 1px solid rgba(var(--v-border-color), 0.08);
}

/* ============================================================ */
/*  Message card com aspas decorativas                          */
/* ============================================================ */
.message-card {
    position: relative;
}

.message-quote {
    position: absolute;
    top: 12px;
    left: 12px;
    opacity: 0.5;
}

/* ============================================================ */
/*  Surface variant helper                                      */
/* ============================================================ */
.bg-surface-variant {
    background: rgba(var(--v-theme-surface-variant), 0.4);
}

/* ============================================================ */
/*  Success animation                                           */
/* ============================================================ */
.success-animation {
    display: inline-block;
    animation: bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55);
}

@keyframes bounce-in {
    0% {
        transform: scale(0);
        opacity: 0;
    }

    50% {
        transform: scale(1.1);
        opacity: 1;
    }

    100% {
        transform: scale(1);
        opacity: 1;
    }
}

/* ============================================================ */
/*  Responsivo                                                  */
/* ============================================================ */
@media (max-width: 599px) {
    .invite-container {
        padding-top: 40px;
        padding-left: 12px;
        padding-right: 12px;
    }

    .invite-banner {
        height: 120px;
    }
}
</style>
