<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useRealtime } from '@/composables/useRealtime'
import { supabase } from '@/lib/supabase'

import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue'
import EmptyState from '@/components/base/EmptyState.vue'

import type { TeamMember, Profile, UserRole } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const auth = useAuthStore()
const notify = useNotifications()
const { user, currentStore, currentStoreId, currentRole } = storeToRefs(auth)

const isOwner = computed(() => currentRole.value === 'OWNER')
const isAdmin = computed(() => currentRole.value === 'ADMIN')
const canManage = computed(() => isOwner.value || isAdmin.value)

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface MemberWithProfile extends TeamMember {
    profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'phone'> & {
        email?: string
    } | null
}

interface Invite {
    id: string
    email: string
    role: UserRole
    invited_by: string
    created_at: string
    expires_at: string
    accepted_at: string | null
    invited_by_profile?: Pick<Profile, 'id' | 'full_name'> | null
}

/* -------------------------------------------------------------------------- */
/*  Role metadata                                                             */
/* -------------------------------------------------------------------------- */

interface RoleMeta {
    label: string
    color: string
    icon: string
    description: string
    level: number  // hierarquia — quanto maior, mais poder
}

const roleMeta: Record<UserRole, RoleMeta> = {
    OWNER: { label: 'Proprietário', color: 'error', icon: 'mdi-crown', description: 'Controle total, incluindo assinatura e exclusão', level: 5 },
    ADMIN: { label: 'Administrador', color: 'primary', icon: 'mdi-shield-star-outline', description: 'Gerencia equipe, integrações e configurações', level: 4 },
    MANAGER: { label: 'Gerente', color: 'info', icon: 'mdi-account-tie-outline', description: 'Gerencia produtos, pedidos, cupons e analytics', level: 3 },
    SELLER: { label: 'Vendedor', color: 'success', icon: 'mdi-account-cash-outline', description: 'Atende pedidos, cadastra clientes e cupons básicos', level: 2 },
    EDITOR: { label: 'Editor', color: 'warning', icon: 'mdi-pencil-outline', description: 'Apenas edita catálogo (produtos e categorias)', level: 1 },
}

/* -------------------------------------------------------------------------- */
/*  Permissions por role (para exibir matriz de permissões)                   */
/* -------------------------------------------------------------------------- */

interface Permission {
    code: string
    label: string
    category: string
}

const permissions: Permission[] = [
    { code: 'MANAGE_STORE', label: 'Editar dados da loja', category: 'Configurações' },
    { code: 'MANAGE_USERS', label: 'Gerenciar equipe', category: 'Configurações' },
    { code: 'MANAGE_INTEGRATIONS', label: 'Gerenciar integrações', category: 'Configurações' },
    { code: 'MANAGE_BILLING', label: 'Gerenciar assinatura', category: 'Configurações' },
    { code: 'CREATE_PRODUCT', label: 'Criar produtos', category: 'Catálogo' },
    { code: 'EDIT_PRODUCT', label: 'Editar produtos', category: 'Catálogo' },
    { code: 'DELETE_PRODUCT', label: 'Excluir produtos', category: 'Catálogo' },
    { code: 'MANAGE_CATEGORIES', label: 'Gerenciar categorias', category: 'Catálogo' },
    { code: 'MANAGE_ORDERS', label: 'Gerenciar pedidos', category: 'Vendas' },
    { code: 'MANAGE_CUSTOMERS', label: 'Gerenciar clientes', category: 'Vendas' },
    { code: 'MANAGE_COUPONS', label: 'Gerenciar cupons', category: 'Vendas' },
    { code: 'MANAGE_INVENTORY', label: 'Ajustar estoque', category: 'Vendas' },
    { code: 'VIEW_ANALYTICS', label: 'Ver analytics', category: 'Inteligência' },
    { code: 'VIEW_REPORTS', label: 'Exportar relatórios', category: 'Inteligência' },
]

const rolePermissions: Record<UserRole, string[]> = {
    OWNER: permissions.map(p => p.code), // tudo
    ADMIN: permissions.map(p => p.code).filter(c => c !== 'MANAGE_BILLING'),
    MANAGER: [
        'CREATE_PRODUCT', 'EDIT_PRODUCT', 'DELETE_PRODUCT', 'MANAGE_CATEGORIES',
        'MANAGE_ORDERS', 'MANAGE_CUSTOMERS', 'MANAGE_COUPONS', 'MANAGE_INVENTORY',
        'VIEW_ANALYTICS', 'VIEW_REPORTS',
    ],
    SELLER: [
        'CREATE_PRODUCT', 'EDIT_PRODUCT',
        'MANAGE_ORDERS', 'MANAGE_CUSTOMERS', 'MANAGE_COUPONS',
        'VIEW_ANALYTICS',
    ],
    EDITOR: [
        'CREATE_PRODUCT', 'EDIT_PRODUCT', 'MANAGE_CATEGORIES',
    ],
}

function roleHas(role: UserRole, code: string): boolean {
    return rolePermissions[role]?.includes(code) ?? false
}

const permissionsByCategory = computed(() => {
    const map = new Map<string, Permission[]>()
    for (const p of permissions) {
        if (!map.has(p.category)) map.set(p.category, [])
        map.get(p.category)!.push(p)
    }
    return map
})

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
})

const fmtRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86_400_000)
    if (days === 0) return 'Hoje'
    if (days === 1) return 'Ontem'
    if (days < 30) return `há ${days} dias`
    if (days < 365) return `há ${Math.floor(days / 30)} meses`
    return `há ${Math.floor(days / 365)} ano(s)`
}

function initialsOf(name: string): string {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

/* -------------------------------------------------------------------------- */
/*  Aba ativa                                                                 */
/* -------------------------------------------------------------------------- */

const activeTab = ref<'members' | 'invites' | 'permissions'>('members')

/* -------------------------------------------------------------------------- */
/*  Query — membros da equipe                                                 */
/* -------------------------------------------------------------------------- */

const membersQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return []
    const { data, error } = await supabase
        .from('team_members')
        .select(`
      *,
      profile:profiles(id, full_name, avatar_url, phone)
    `)
        .is('deleted_at', null)
        .order('joined_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as MemberWithProfile[]
}, { watchSource: [currentStoreId] })

const members = computed(() => membersQuery.data.value ?? [])

/* Ordena OWNER primeiro, depois por hierarquia de role, depois por data */
const sortedMembers = computed(() =>
    [...members.value].sort((a, b) => {
        const levelDiff = roleMeta[b.role as UserRole].level - roleMeta[a.role as UserRole].level
        if (levelDiff !== 0) return levelDiff
        return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    }),
)

const myMembership = computed(() =>
    members.value.find(m => m.profile_id === user.value?.id),
)

const activeMembersCount = computed(() =>
    members.value.filter(m => m.is_active).length,
)

const inactiveMembersCount = computed(() =>
    members.value.filter(m => !m.is_active).length,
)

const ownerCount = computed(() =>
    members.value.filter(m => m.role === 'OWNER' && m.is_active).length,
)

/* -------------------------------------------------------------------------- */
/*  Query — convites pendentes                                                */
/* -------------------------------------------------------------------------- */

const invitesQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return []
    const { data } = await supabase
        .from('team_invites')
        .select(`
      *,
      invited_by_profile:profiles!invited_by(id, full_name)
    `)
        .is('accepted_at', null)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
    return (data ?? []) as unknown as Invite[]
}, { watchSource: [currentStoreId] })

const invites = computed(() => invitesQuery.data.value ?? [])

/* -------------------------------------------------------------------------- */
/*  Dialog de convite                                                         */
/* -------------------------------------------------------------------------- */

const inviteDialog = reactive({
    open: false,
    email: '',
    role: 'SELLER' as UserRole,
    message: '',
})

function openInviteDialog() {
    inviteDialog.open = true
    inviteDialog.email = ''
    inviteDialog.role = 'SELLER'
    inviteDialog.message = ''
}

const availableRolesForInvite = computed<UserRole[]>(() => {
    // Só OWNER pode convidar outro OWNER (transferência de propriedade)
    // ADMIN pode convidar MANAGER, SELLER, EDITOR e outros ADMINs
    if (isOwner.value) return ['OWNER', 'ADMIN', 'MANAGER', 'SELLER', 'EDITOR']
    if (isAdmin.value) return ['ADMIN', 'MANAGER', 'SELLER', 'EDITOR']
    return []
})

const isValidInvite = computed(() => {
    const email = inviteDialog.email.trim()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        && availableRolesForInvite.value.includes(inviteDialog.role)
})

const { execute: sendInvite, loading: sendingInvite } = useAsyncAction(
    async () => {
        if (!currentStoreId.value) throw new Error('Sem loja ativa')
        if (!isValidInvite.value) throw new Error('E-mail inválido')

        const email = inviteDialog.email.trim().toLowerCase()

        // 1. Verifica se o e-mail já pertence a um membro ativo
        const existing = members.value.find(
            m => (m.profile as any)?.email?.toLowerCase() === email,
        )
        if (existing) throw new Error('Este e-mail já pertence à equipe')

        // 2. Cria o convite
        const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
        const { data, error } = await supabase
            .from('team_invites')
            .insert({
                store_id: currentStoreId.value,
                email,
                role: inviteDialog.role,
                invited_by: user.value!.id,
                message: inviteDialog.message.trim() || null,
                expires_at: expiresAt,
            })
            .select('id')
            .single()
        if (error) {
            if (error.code === '23505') throw new Error('Já existe um convite pendente para este e-mail')
            throw error
        }

        // 3. Dispara Edge Function para enviar o e-mail
        // (opcional — se não estiver implementado, o convite fica listado
        //  para ser retomado manualmente pelo admin)
        try {
            await supabase.functions.invoke('send-team-invite', {
                body: {
                    invite_id: data.id,
                    store_name: currentStore.value?.name,
                    inviter_name: auth.profile?.full_name,
                    role_label: roleMeta[inviteDialog.role].label,
                },
            })
        } catch (fnErr) {
            console.warn('E-mail de convite não enviado:', fnErr)
        }

        inviteDialog.open = false
        await invitesQuery.refresh()
    },
    { successMsg: 'Convite enviado' },
)

/* -------------------------------------------------------------------------- */
/*  Copiar link de convite                                                    */
/* -------------------------------------------------------------------------- */

async function copyInviteLink(invite: Invite) {
    const url = `${window.location.origin}/invite/${invite.id}`
    await navigator.clipboard.writeText(url)
    notify.success('Link do convite copiado')
}

/* -------------------------------------------------------------------------- */
/*  Revogar convite                                                           */
/* -------------------------------------------------------------------------- */

const { execute: revokeInvite } = useAsyncAction(
    async (inviteId: string) => {
        await supabase.from('team_invites').delete().eq('id', inviteId)
        await invitesQuery.refresh()
    },
    { successMsg: 'Convite revogado' },
)

const { execute: resendInvite } = useAsyncAction(
    async (invite: Invite) => {
        await supabase.functions.invoke('send-team-invite', {
            body: {
                invite_id: invite.id,
                store_name: currentStore.value?.name,
                inviter_name: auth.profile?.full_name,
                role_label: roleMeta[invite.role].label,
            },
        })
    },
    { successMsg: 'Convite reenviado' },
)

/* -------------------------------------------------------------------------- */
/*  Editar role de um membro                                                  */
/* -------------------------------------------------------------------------- */

const roleDialog = reactive({
    open: false,
    member: null as MemberWithProfile | null,
    newRole: 'SELLER' as UserRole,
})

function openRoleDialog(member: MemberWithProfile) {
    roleDialog.member = member
    roleDialog.newRole = member.role as UserRole
    roleDialog.open = true
}

const canChangeToRole = computed(() => (target: UserRole): boolean => {
    if (!roleDialog.member) return false
    // Ninguém pode transformar em OWNER via UI de edição — é transferência
    if (target === 'OWNER') return false
    // Não pode mudar a role de outro OWNER
    if (roleDialog.member.role === 'OWNER') return false
    // ADMIN não pode promover a outro ADMIN se for o único ADMIN dele mesmo
    if (isAdmin.value && !isOwner.value && target === 'ADMIN') return false
    return true
})

const { execute: saveRoleChange, loading: savingRole } = useAsyncAction(
    async () => {
        if (!roleDialog.member) return
        if (roleDialog.newRole === roleDialog.member.role) {
            roleDialog.open = false
            return
        }
        const { error } = await supabase
            .from('team_members')
            .update({ role: roleDialog.newRole })
            .eq('id', roleDialog.member.id)
        if (error) throw error
        roleDialog.open = false
        await membersQuery.refresh()
    },
    { successMsg: 'Função atualizada' },
)

/* -------------------------------------------------------------------------- */
/*  Suspender/Ativar membro                                                   */
/* -------------------------------------------------------------------------- */

const { execute: toggleMemberActive } = useAsyncAction(
    async (member: MemberWithProfile) => {
        if (member.profile_id === user.value?.id) {
            throw new Error('Você não pode alterar seu próprio status')
        }
        if (member.role === 'OWNER' && ownerCount.value === 1) {
            throw new Error('Não é possível desativar o único proprietário')
        }
        await supabase
            .from('team_members')
            .update({ is_active: !member.is_active })
            .eq('id', member.id)
        await membersQuery.refresh()
    },
    { successMsg: 'Status atualizado' },
)

/* -------------------------------------------------------------------------- */
/*  Remover membro                                                            */
/* -------------------------------------------------------------------------- */

const confirmRemove = reactive({
    open: false,
    member: null as MemberWithProfile | null,
})

function askRemove(member: MemberWithProfile) {
    if (member.profile_id === user.value?.id) {
        notify.error('Você não pode remover a si mesmo. Use "Sair da loja".')
        return
    }
    if (member.role === 'OWNER' && ownerCount.value === 1) {
        notify.error('Não é possível remover o único proprietário')
        return
    }
    confirmRemove.member = member
    confirmRemove.open = true
}

const { execute: doRemove, loading: removing } = useAsyncAction(
    async () => {
        if (!confirmRemove.member) return
        await supabase
            .from('team_members')
            .update({ deleted_at: new Date().toISOString(), is_active: false })
            .eq('id', confirmRemove.member.id)
        confirmRemove.open = false
        await membersQuery.refresh()
    },
    { successMsg: 'Membro removido' },
)

/* -------------------------------------------------------------------------- */
/*  Transferir propriedade (só OWNER)                                         */
/* -------------------------------------------------------------------------- */

const transferDialog = reactive({
    open: false,
    targetMemberId: null as string | null,
    typedConfirmation: '',
})

function openTransferDialog() {
    transferDialog.open = true
    transferDialog.targetMemberId = null
    transferDialog.typedConfirmation = ''
}

const transferableMembers = computed(() =>
    members.value.filter(m => m.is_active && m.role !== 'OWNER'),
)

const canConfirmTransfer = computed(() =>
    !!transferDialog.targetMemberId
    && transferDialog.typedConfirmation.trim().toUpperCase() === 'TRANSFERIR',
)

const { execute: doTransfer, loading: transferring } = useAsyncAction(
    async () => {
        if (!canConfirmTransfer.value || !myMembership.value) return

        // Chama RPC transacional que troca as roles atomicamente
        // (se não houver RPC, fazemos manual — mas RPC é mais seguro)
        const { error } = await supabase.rpc('transfer_store_ownership', {
            p_store_id: currentStoreId.value,
            p_new_owner_member_id: transferDialog.targetMemberId,
            p_previous_owner_member_id: myMembership.value.id,
        })

        if (error) {
            // Fallback manual (menos seguro — usar apenas se RPC não existir ainda)
            await supabase.from('team_members').update({ role: 'ADMIN' }).eq('id', myMembership.value.id)
            await supabase.from('team_members').update({ role: 'OWNER' }).eq('id', transferDialog.targetMemberId!)
        }

        transferDialog.open = false
        await membersQuery.refresh()
        await auth.loadStores?.()
    },
    { successMsg: 'Propriedade transferida' },
)

/* -------------------------------------------------------------------------- */
/*  Sair da loja                                                              */
/* -------------------------------------------------------------------------- */

const leaveDialog = reactive({ open: false })

const canLeave = computed(() => {
    if (!myMembership.value) return false
    // OWNER único não pode sair — precisa transferir antes
    if (myMembership.value.role === 'OWNER' && ownerCount.value === 1) return false
    return true
})

const { execute: leaveStore, loading: leaving } = useAsyncAction(
    async () => {
        if (!myMembership.value) return
        await supabase
            .from('team_members')
            .update({ deleted_at: new Date().toISOString(), is_active: false })
            .eq('id', myMembership.value.id)

        await auth.loadStores?.()
        // Redireciona porque o usuário perdeu acesso a essa loja
        window.location.href = '/'
    },
    { successMsg: 'Você saiu da loja' },
)

/* -------------------------------------------------------------------------- */
/*  Realtime                                                                  */
/* -------------------------------------------------------------------------- */

useRealtime<TeamMember>({
    table: 'team_members',
    event: '*',
    scopedToStore: true,
    onChange: () => membersQuery.refresh(),
})

/* -------------------------------------------------------------------------- */
/*  Filtro de busca                                                           */
/* -------------------------------------------------------------------------- */

const search = ref('')
const roleFilter = ref<UserRole | ''>('')

const displayedMembers = computed(() => {
    const term = search.value.trim().toLowerCase()
    return sortedMembers.value.filter(m => {
        if (roleFilter.value && m.role !== roleFilter.value) return false
        if (!term) return true
        return m.profile?.full_name?.toLowerCase().includes(term)
    })
})

onMounted(() => {
    membersQuery.refresh()
    invitesQuery.refresh()
})
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- ==================== HEADER ==================== -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">Equipe</h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Convide colaboradores e defina o que cada um pode fazer na loja.
                </p>
            </div>

            <div class="d-flex ga-2 flex-column flex-sm-row">
                <v-btn v-if="myMembership && canLeave" variant="outlined" color="error" prepend-icon="mdi-logout"
                    rounded="pill" class="text-none" @click="leaveDialog.open = true">
                    Sair da loja
                </v-btn>
                <v-btn v-if="canManage" color="primary" prepend-icon="mdi-account-plus-outline" rounded="pill"
                    elevation="0" class="text-none px-6" @click="openInviteDialog">
                    Convidar
                </v-btn>
            </div>
        </header>

        <!-- ==================== ALERTA DE PERMISSÃO ==================== -->
        <v-alert v-if="!canManage" type="info" variant="tonal" rounded="lg" density="compact"
            icon="mdi-information-outline">
            Apenas <strong>proprietários e administradores</strong> podem gerenciar a equipe.
            Você pode visualizar mas não editar.
        </v-alert>

        <!-- ==================== MÉTRICAS ==================== -->
        <v-row dense>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="membersQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Membros ativos" :value="activeMembersCount"
                    icon="mdi-account-group-outline" description="Com acesso ao painel" color="success" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="membersQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Suspensos" :value="inactiveMembersCount"
                    icon="mdi-account-off-outline" description="Temporariamente sem acesso" color="warning" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="invitesQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Convites pendentes" :value="invites.length"
                    icon="mdi-email-fast-outline" description="Aguardando aceite" color="info"
                    @click="activeTab = 'invites'" />
            </v-col>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="membersQuery.loading.value" type="card" rounded="xl" />
                <DashboardMetricCard v-else label="Proprietários" :value="ownerCount" icon="mdi-crown"
                    description="Com controle total" color="error" />
            </v-col>
        </v-row>

        <!-- ==================== TABS ==================== -->
        <v-card rounded="xl" border flat class="overflow-hidden">
            <v-tabs v-model="activeTab" color="primary" align-tabs="start" class="team-tabs">
                <v-tab value="members" class="text-none">
                    <v-icon start>mdi-account-multiple-outline</v-icon>
                    Membros
                    <v-chip size="x-small" variant="tonal" class="ml-2">
                        {{ members.length }}
                    </v-chip>
                </v-tab>
                <v-tab value="invites" class="text-none">
                    <v-icon start>mdi-email-outline</v-icon>
                    Convites
                    <v-chip v-if="invites.length" size="x-small" variant="tonal" color="info" class="ml-2">
                        {{ invites.length }}
                    </v-chip>
                </v-tab>
                <v-tab value="permissions" class="text-none">
                    <v-icon start>mdi-shield-key-outline</v-icon>
                    Permissões
                </v-tab>
            </v-tabs>

            <v-divider />

            <v-window v-model="activeTab">

                <!-- ============================================================ -->
                <!--  TAB 1 — MEMBROS                                            -->
                <!-- ============================================================ -->
                <v-window-item value="members">
                    <!-- Filtros -->
                    <div class="pa-4 d-flex align-center ga-3 flex-wrap">
                        <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" placeholder="Buscar por nome..."
                            variant="outlined" density="compact" hide-details rounded="pill" style="max-width: 320px" />
                        <v-select v-model="roleFilter" :items="[
                            { title: 'Todas as funções', value: '' },
                            ...Object.entries(roleMeta).map(([k, v]) => ({ title: v.label, value: k })),
                        ]" variant="outlined" density="compact" hide-details rounded="pill" style="max-width: 240px" />
                    </div>

                    <v-divider />

                    <!-- Lista -->
                    <div v-if="membersQuery.loading.value" class="pa-4">
                        <v-skeleton-loader v-for="i in 3" :key="i" type="list-item-avatar-two-line" />
                    </div>

                    <EmptyState v-else-if="!displayedMembers.length" title="Nenhum membro encontrado"
                        description="Convide seu primeiro colaborador para começar."
                        icon="mdi-account-multiple-outline" />

                    <v-list v-else lines="two" class="member-list">
                        <v-list-item v-for="member in displayedMembers" :key="member.id" class="member-row"
                            :class="{ 'is-me': member.profile_id === user?.id, 'is-inactive': !member.is_active }">
                            <template #prepend>
                                <v-avatar :image="member.profile?.avatar_url ?? undefined" color="primary" size="48">
                                    <span v-if="!member.profile?.avatar_url" class="font-weight-bold text-white">
                                        {{ initialsOf(member.profile?.full_name ?? '?') }}
                                    </span>
                                </v-avatar>
                            </template>

                            <v-list-item-title class="d-flex align-center ga-2 flex-wrap">
                                <span class="font-weight-bold">
                                    {{ member.profile?.full_name ?? 'Usuário desconhecido' }}
                                </span>
                                <v-chip v-if="member.profile_id === user?.id" size="x-small" color="primary"
                                    variant="flat">
                                    Você
                                </v-chip>
                                <v-chip v-if="!member.is_active" size="x-small" color="warning" variant="tonal"
                                    prepend-icon="mdi-pause-circle-outline">
                                    Suspenso
                                </v-chip>
                            </v-list-item-title>

                            <v-list-item-subtitle>
                                Entrou {{ fmtRelative(member.joined_at) }}
                                <template v-if="member.profile?.phone">
                                    · {{ member.profile.phone }}
                                </template>
                            </v-list-item-subtitle>

                            <template #append>
                                <div class="d-flex align-center ga-3">
                                    <v-chip :color="roleMeta[member.role as UserRole].color" variant="tonal"
                                        size="small" :prepend-icon="roleMeta[member.role as UserRole].icon"
                                        class="font-weight-medium">
                                        {{ roleMeta[member.role as UserRole].label }}
                                    </v-chip>

                                    <v-menu v-if="canManage && member.profile_id !== user?.id" location="bottom end">
                                        <template #activator="{ props: mp }">
                                            <v-btn v-bind="mp" icon="mdi-dots-vertical" variant="text" size="small" />
                                        </template>
                                        <v-list density="compact" min-width="220">
                                            <v-list-item prepend-icon="mdi-shield-edit-outline" title="Alterar função"
                                                :disabled="member.role === 'OWNER'" @click="openRoleDialog(member)" />
                                            <v-list-item
                                                :prepend-icon="member.is_active ? 'mdi-pause-circle-outline' : 'mdi-play-circle-outline'"
                                                :title="member.is_active ? 'Suspender acesso' : 'Reativar acesso'"
                                                :disabled="member.role === 'OWNER' && ownerCount === 1"
                                                @click="toggleMemberActive(member)" />
                                            <v-divider class="my-1" />
                                            <v-list-item prepend-icon="mdi-account-remove-outline"
                                                title="Remover da equipe" base-color="error"
                                                :disabled="member.role === 'OWNER' && ownerCount === 1"
                                                @click="askRemove(member)" />
                                        </v-list>
                                    </v-menu>
                                </div>
                            </template>
                        </v-list-item>
                    </v-list>

                    <!-- Ação de transferência (só OWNER) -->
                    <v-divider v-if="isOwner && transferableMembers.length" />
                    <div v-if="isOwner && transferableMembers.length" class="pa-4">
                        <v-btn variant="outlined" color="error" prepend-icon="mdi-crown-outline" class="text-none"
                            @click="openTransferDialog">
                            Transferir propriedade
                        </v-btn>
                    </div>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 2 — CONVITES                                            -->
                <!-- ============================================================ -->
                <v-window-item value="invites">
                    <div v-if="invitesQuery.loading.value" class="pa-4">
                        <v-skeleton-loader v-for="i in 3" :key="i" type="list-item-two-line" />
                    </div>

                    <EmptyState v-else-if="!invites.length" title="Nenhum convite pendente"
                        description="Convide um novo colaborador para vê-lo aqui." icon="mdi-email-outline" />

                    <v-list v-else lines="two">
                        <v-list-item v-for="invite in invites" :key="invite.id" class="invite-row">
                            <template #prepend>
                                <v-avatar color="info" variant="tonal" size="44">
                                    <v-icon>mdi-email-fast-outline</v-icon>
                                </v-avatar>
                            </template>

                            <v-list-item-title class="font-weight-medium">
                                {{ invite.email }}
                            </v-list-item-title>

                            <v-list-item-subtitle>
                                Convidado por
                                <strong>{{ invite.invited_by_profile?.full_name ?? 'Você' }}</strong>
                                · {{ fmtRelative(invite.created_at) }}
                                · expira em {{ fmtDate(invite.expires_at) }}
                            </v-list-item-subtitle>

                            <template #append>
                                <div class="d-flex align-center ga-2">
                                    <v-chip :color="roleMeta[invite.role].color" variant="tonal" size="small"
                                        :prepend-icon="roleMeta[invite.role].icon">
                                        {{ roleMeta[invite.role].label }}
                                    </v-chip>

                                    <v-menu v-if="canManage" location="bottom end">
                                        <template #activator="{ props: mp }">
                                            <v-btn v-bind="mp" icon="mdi-dots-vertical" variant="text" size="small" />
                                        </template>
                                        <v-list density="compact" min-width="200">
                                            <v-list-item prepend-icon="mdi-content-copy" title="Copiar link"
                                                @click="copyInviteLink(invite)" />
                                            <v-list-item prepend-icon="mdi-email-sync-outline" title="Reenviar e-mail"
                                                @click="resendInvite(invite)" />
                                            <v-divider class="my-1" />
                                            <v-list-item prepend-icon="mdi-close-circle-outline" title="Revogar convite"
                                                base-color="error" @click="revokeInvite(invite.id)" />
                                        </v-list>
                                    </v-menu>
                                </div>
                            </template>
                        </v-list-item>
                    </v-list>
                </v-window-item>

                <!-- ============================================================ -->
                <!--  TAB 3 — MATRIZ DE PERMISSÕES                                -->
                <!-- ============================================================ -->
                <v-window-item value="permissions">
                    <div class="pa-6">
                        <div class="mb-4">
                            <p class="text-body-2 text-medium-emphasis mb-0">
                                Veja exatamente o que cada função pode fazer no sistema.
                                As permissões são fixas e não podem ser customizadas individualmente.
                            </p>
                        </div>

                        <div class="permissions-matrix">
                            <v-table density="comfortable">
                                <thead>
                                    <tr>
                                        <th class="permission-col">Permissão</th>
                                        <th v-for="(meta, role) in roleMeta" :key="role" class="text-center role-col">
                                            <div class="d-flex flex-column align-center ga-1">
                                                <v-avatar :color="meta.color" variant="tonal" size="32">
                                                    <v-icon size="18">{{ meta.icon }}</v-icon>
                                                </v-avatar>
                                                <span class="text-caption font-weight-bold">
                                                    {{ meta.label }}
                                                </span>
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <template v-for="[category, perms] in permissionsByCategory" :key="category">
                                        <tr class="category-row">
                                            <td :colspan="Object.keys(roleMeta).length + 1" class="category-cell">
                                                {{ category }}
                                            </td>
                                        </tr>
                                        <tr v-for="perm in perms" :key="perm.code">
                                            <td class="permission-name">
                                                {{ perm.label }}
                                                <code class="permission-code">{{ perm.code }}</code>
                                            </td>
                                            <td v-for="(_, role) in roleMeta" :key="role" class="text-center">
                                                <v-icon v-if="roleHas(role as UserRole, perm.code)" color="success"
                                                    size="20">
                                                    mdi-check-circle
                                                </v-icon>
                                                <v-icon v-else color="grey-lighten-2" size="20">
                                                    mdi-close-circle-outline
                                                </v-icon>
                                            </td>
                                        </tr>
                                    </template>
                                </tbody>
                            </v-table>
                        </div>
                    </div>
                </v-window-item>

            </v-window>
        </v-card>

        <!-- ==================== DIALOG: CONVIDAR ==================== -->
        <v-dialog v-model="inviteDialog.open" max-width="640" persistent scrollable>
            <v-card rounded="xl">
                <v-toolbar color="surface" border="b" density="comfortable">
                    <v-btn icon="mdi-close" variant="text" @click="inviteDialog.open = false" />
                    <v-toolbar-title class="font-weight-black">
                        Convidar membro
                    </v-toolbar-title>
                </v-toolbar>

                <v-card-text class="pa-6">
                    <v-text-field v-model="inviteDialog.email" label="E-mail do convidado *" type="email"
                        variant="outlined" density="comfortable" prepend-inner-icon="mdi-email-outline"
                        placeholder="pessoa@exemplo.com" autofocus class="mb-4" />

                    <div class="text-subtitle-2 font-weight-bold mb-2">Função *</div>
                    <div class="role-picker mb-4">
                        <v-card v-for="role in availableRolesForInvite" :key="role" variant="outlined" rounded="lg"
                            class="role-card pa-3 cursor-pointer" :class="{ active: inviteDialog.role === role }"
                            @click="inviteDialog.role = role">
                            <div class="d-flex align-start ga-3">
                                <v-avatar :color="roleMeta[role].color" variant="tonal" size="36">
                                    <v-icon>{{ roleMeta[role].icon }}</v-icon>
                                </v-avatar>
                                <div class="min-width-0 flex-grow-1">
                                    <div class="text-body-2 font-weight-bold">
                                        {{ roleMeta[role].label }}
                                    </div>
                                    <div class="text-caption text-medium-emphasis">
                                        {{ roleMeta[role].description }}
                                    </div>
                                </div>
                                <v-icon v-if="inviteDialog.role === role" color="primary" size="20">
                                    mdi-check-circle
                                </v-icon>
                            </div>
                        </v-card>
                    </div>

                    <v-textarea v-model="inviteDialog.message" label="Mensagem pessoal (opcional)"
                        placeholder="Bem-vindo(a) à nossa equipe!" rows="3" variant="outlined" density="comfortable"
                        counter="200" maxlength="200" />

                    <v-alert type="info" variant="tonal" density="compact" rounded="lg" class="mt-4">
                        <div class="text-caption">
                            Um e-mail com o convite será enviado. O link expira em <strong>7 dias</strong>.
                            Você pode reenviar ou revogar a qualquer momento.
                        </div>
                    </v-alert>
                </v-card-text>

                <v-divider />

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="sendingInvite"
                        @click="inviteDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6"
                        prepend-icon="mdi-send-outline" :loading="sendingInvite" :disabled="!isValidInvite"
                        @click="sendInvite">
                        Enviar convite
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== DIALOG: ALTERAR ROLE ==================== -->
        <v-dialog v-model="roleDialog.open" max-width="560" persistent>
            <v-card v-if="roleDialog.member" rounded="xl">
                <v-toolbar color="surface" border="b" density="comfortable">
                    <v-btn icon="mdi-close" variant="text" @click="roleDialog.open = false" />
                    <v-toolbar-title class="font-weight-black">
                        Alterar função
                    </v-toolbar-title>
                </v-toolbar>

                <v-card-text class="pa-6">
                    <div class="d-flex align-center ga-3 mb-4 pa-3 rounded-lg bg-surface-variant">
                        <v-avatar :image="roleDialog.member.profile?.avatar_url ?? undefined" color="primary" size="44">
                            <span v-if="!roleDialog.member.profile?.avatar_url" class="text-white font-weight-bold">
                                {{ initialsOf(roleDialog.member.profile?.full_name ?? '?') }}
                            </span>
                        </v-avatar>
                        <div>
                            <div class="font-weight-bold">
                                {{ roleDialog.member.profile?.full_name }}
                            </div>
                            <div class="text-caption text-medium-emphasis">
                                Função atual:
                                <v-chip size="x-small" variant="tonal"
                                    :color="roleMeta[roleDialog.member.role as UserRole].color">
                                    {{ roleMeta[roleDialog.member.role as UserRole].label }}
                                </v-chip>
                            </div>
                        </div>
                    </div>

                    <div class="text-subtitle-2 font-weight-bold mb-2">Nova função</div>
                    <div class="role-picker">
                        <v-card v-for="(meta, role) in roleMeta" :key="role" variant="outlined" rounded="lg"
                            class="role-card pa-3 cursor-pointer" :class="{
                                active: roleDialog.newRole === role,
                                disabled: !canChangeToRole(role as UserRole),
                            }" @click="canChangeToRole(role as UserRole) && (roleDialog.newRole = role as UserRole)">
                            <div class="d-flex align-start ga-3">
                                <v-avatar :color="meta.color" variant="tonal" size="36">
                                    <v-icon>{{ meta.icon }}</v-icon>
                                </v-avatar>
                                <div class="min-width-0 flex-grow-1">
                                    <div class="text-body-2 font-weight-bold">
                                        {{ meta.label }}
                                        <v-chip v-if="role === 'OWNER'" size="x-small" variant="tonal" color="warning"
                                            class="ml-1">
                                            via transferência
                                        </v-chip>
                                    </div>
                                    <div class="text-caption text-medium-emphasis">
                                        {{ meta.description }}
                                    </div>
                                </div>
                                <v-icon v-if="roleDialog.newRole === role" color="primary" size="20">
                                    mdi-check-circle
                                </v-icon>
                            </div>
                        </v-card>
                    </div>
                </v-card-text>

                <v-divider />

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="savingRole" @click="roleDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="primary" variant="flat" rounded="pill" class="text-none px-6" :loading="savingRole"
                        :disabled="roleDialog.newRole === roleDialog.member.role" @click="saveRoleChange">
                        Salvar
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== DIALOG: TRANSFERIR PROPRIEDADE ==================== -->
        <v-dialog v-model="transferDialog.open" max-width="600" persistent>
            <v-card rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="warning" variant="tonal" size="44">
                            <v-icon>mdi-crown-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Transferir propriedade
                    </v-card-title>
                </v-card-item>

                <v-card-text>
                    <v-alert type="warning" variant="tonal" density="compact" rounded="lg" class="mb-4"
                        icon="mdi-alert-outline">
                        <div class="text-caption">
                            Após transferir, <strong>você perde o controle total</strong> da loja e passa a ser
                            administrador. Apenas o novo proprietário pode gerenciar assinatura,
                            transferir novamente ou arquivar a loja.
                        </div>
                    </v-alert>

                    <v-select v-model="transferDialog.targetMemberId" :items="transferableMembers.map(m => ({
                        title: `${m.profile?.full_name} (${roleMeta[m.role as UserRole].label})`,
                        value: m.id,
                    }))" label="Escolha o novo proprietário" variant="outlined" density="comfortable"
                        prepend-inner-icon="mdi-account-arrow-right-outline" class="mb-4" />

                    <v-text-field v-model="transferDialog.typedConfirmation" label='Digite "TRANSFERIR" para confirmar'
                        variant="outlined" density="comfortable" />
                </v-card-text>

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="transferring"
                        @click="transferDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="warning" variant="flat" rounded="pill" class="text-none px-6" :loading="transferring"
                        :disabled="!canConfirmTransfer" @click="doTransfer">
                        Transferir propriedade
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== DIALOG: REMOVER MEMBRO ==================== -->
        <v-dialog v-model="confirmRemove.open" max-width="460" persistent>
            <v-card v-if="confirmRemove.member" rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-account-remove-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Remover {{ confirmRemove.member.profile?.full_name }}?
                    </v-card-title>
                </v-card-item>
                <v-card-text>
                    <p class="text-body-2 mb-2">
                        Este membro perderá acesso imediato ao painel. O histórico de ações
                        (produtos criados, pedidos atendidos) permanece atribuído a ele.
                    </p>
                    <p class="text-caption text-medium-emphasis">
                        Você pode convidá-lo novamente a qualquer momento.
                    </p>
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="removing" @click="confirmRemove.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" class="text-none" :loading="removing" @click="doRemove">
                        Remover
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- ==================== DIALOG: SAIR DA LOJA ==================== -->
        <v-dialog v-model="leaveDialog.open" max-width="460" persistent>
            <v-card rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-logout</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Sair de {{ currentStore?.name }}?
                    </v-card-title>
                </v-card-item>
                <v-card-text>
                    <p class="text-body-2">
                        Você perderá acesso a esta loja. Para voltar, alguém da equipe
                        precisará te convidar novamente.
                    </p>
                </v-card-text>
                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" :disabled="leaving" @click="leaveDialog.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" class="text-none" :loading="leaving" @click="leaveStore">
                        Sim, sair
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<style scoped>
.team-tabs {
    background: rgba(var(--v-theme-surface-variant), 0.3);
}

.cursor-pointer {
    cursor: pointer;
}

.min-width-0 {
    min-width: 0;
}

/* ============================================================ */
/*  Member list                                                 */
/* ============================================================ */
.member-list {
    padding: 0;
}

.member-row {
    border-bottom: 1px solid rgba(var(--v-border-color), 0.06);
    padding-top: 12px !important;
    padding-bottom: 12px !important;
    transition: background 0.15s ease;
}

.member-row:last-child {
    border-bottom: none;
}

.member-row:hover {
    background: rgba(var(--v-theme-primary), 0.02);
}

.member-row.is-me {
    background: rgba(var(--v-theme-primary), 0.04);
}

.member-row.is-inactive {
    opacity: 0.6;
}

.invite-row {
    border-bottom: 1px solid rgba(var(--v-border-color), 0.06);
    padding-top: 12px !important;
    padding-bottom: 12px !important;
}

.invite-row:last-child {
    border-bottom: none;
}

/* ============================================================ */
/*  Role picker                                                 */
/* ============================================================ */
.role-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.role-card {
    transition: all 0.15s ease;
    border-color: rgba(var(--v-border-color), 0.15) !important;
}

.role-card:hover:not(.disabled) {
    border-color: rgba(var(--v-theme-primary), 0.4) !important;
    transform: translateX(2px);
}

.role-card.active {
    border-color: rgb(var(--v-theme-primary)) !important;
    background: rgba(var(--v-theme-primary), 0.06);
    box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
}

.role-card.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* ============================================================ */
/*  Permissions matrix                                          */
/* ============================================================ */
.permissions-matrix :deep(table) {
    border-collapse: separate;
    border-spacing: 0;
}

.permission-col {
    width: 40%;
    min-width: 240px;
}

.role-col {
    width: 12%;
    min-width: 90px;
}

.category-row {
    background: rgba(var(--v-theme-primary), 0.05) !important;
}

.category-cell {
    font-size: 0.75rem !important;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 700;
    color: rgb(var(--v-theme-primary));
    padding: 8px 16px !important;
}

.permission-name {
    font-size: 0.875rem;
    font-weight: 500;
}

.permission-code {
    display: block;
    background: rgba(var(--v-theme-on-surface), 0.06);
    padding: 1px 6px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.65rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    font-weight: 600;
    width: fit-content;
    margin-top: 2px;
}

.bg-surface-variant {
    background: rgba(var(--v-theme-surface-variant), 0.3);
}
</style>
