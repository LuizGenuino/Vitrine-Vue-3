import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Store, TeamMember } from '@/types/models'

type StoresWithRelations = TeamMember & { store: Store }

export const useAuthStore = defineStore('auth', () => {
    const session = ref<Session | null>(null)
    const user = ref<User | null>(null)
    const profile = ref<Profile | null>(null)
    const stores = shallowRef<StoresWithRelations[]>([])
    const currentStoreId = ref<string | null>(null)
    const loading = ref(true)

    const isAuthenticated = computed(() => !!session.value)
    const currentStore = computed(() => {
        const relation = stores.value.find(
            (s: StoresWithRelations) => s.store_id === currentStoreId.value
        );

        return relation?.store ?? null;
    });
    const currentRole = computed(() =>
        stores.value.find(s => s.store_id === currentStoreId.value)?.role ?? null
    )

    async function init() {
        loading.value = true
        const { data } = await supabase.auth.getSession()
        await setSession(data.session)

        supabase.auth.onAuthStateChange(async (_event, newSession) => {
            await setSession(newSession)
        })
        loading.value = false
    }

    async function setSession(s: Session | null) {
        session.value = s
        user.value = s?.user ?? null
        if (s?.user) {
            await loadProfile()
            await loadStores()
        } else {
            profile.value = null
            stores.value = []
            currentStoreId.value = null
        }
    }

    async function loadProfile() {
        const { data } = await supabase
            .from('profiles').select('*').eq('id', user.value!.id).single()
        profile.value = data
    }

    async function loadStores() {
        const { data } = await supabase
            .from('team_members')
            .select('*, store:stores(*)')
            .eq('profile_id', user.value!.id)
            .eq('is_active', true)

        stores.value = (data ?? []) as any
        const saved = localStorage.getItem('vibestore-current-store')
        currentStoreId.value = saved && stores.value.some(s => s.store_id === saved)
            ? saved
            : stores.value[0]?.store_id ?? null
    }

    function switchStore(storeId: string) {
        currentStoreId.value = storeId
        localStorage.setItem('vibestore-current-store', storeId)
    }

    async function signIn(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        return data
    }

    async function signUp(email: string, password: string, fullName: string) {
        const { data, error } = await supabase.auth.signUp({
            email, password,
            options: { data: { full_name: fullName } },
        })
        if (error) throw error
        return data
    }

    async function signOut() {
        await supabase.auth.signOut()
    }

    async function resetPassword(email: string) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
    }

    async function updatePassword(newPassword: string) {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw error
    }

    return {
        session, user, profile, stores, currentStoreId,
        isAuthenticated, currentStore, currentRole, loading,
        init, signIn, signUp, signOut, resetPassword, switchStore, updatePassword, loadStores
    }
})