<!-- src/views/auth/ResetPassword.vue -->
<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { authRules } from '@/lib/validators'
import { supabase } from '@/lib/supabase'

const auth = useAuthStore()
const router = useRouter()

const formRef = ref()
const showPass = ref(false)
const sessionReady = ref(false)
const sessionError = ref<string | null>(null)
const success = ref(false)
const form = reactive({ password: '', confirmPassword: '' })

const passwordsMatch = computed(() =>
    authRules.matches(form.password)(form.confirmPassword)
)

// Ao montar, confirmamos que o Supabase criou a sessão de recovery a partir da URL.
onMounted(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
        sessionReady.value = true
    } else {
        sessionError.value =
            'Link inválido ou expirado. Solicite um novo e-mail de recuperação.'
    }
})

const { execute: submitReset, loading } = useAsyncAction(
    async () => {
        await auth.updatePassword(form.password)
        success.value = true
        // opcional: encerrar a sessão temporária e forçar login com a nova senha
        setTimeout(async () => {
            await auth.signOut()
            await router.push({ name: 'login' })
        }, 2500)
    },
    { successMsg: 'Senha redefinida com sucesso!' }
)

async function onSubmit() {
    const { valid } = await formRef.value.validate()
    if (!valid) return
    await submitReset()
}
</script>

<template>


    <!-- Estado 1: erro de link inválido/expirado -->
    <v-card v-if="sessionError" class="pa-8 text-center" elevation="8" rounded="lg">
        <v-icon color="error" size="72">mdi-alert-circle-outline</v-icon>
        <h2 class="text-h5 font-weight-bold mt-4 mb-2">Link inválido</h2>
        <p class="text-body-1 text-medium-emphasis mb-6">{{ sessionError }}</p>
        <v-btn color="primary" :to="{ name: 'forgot-password' }">
            Solicitar novo link
        </v-btn>
    </v-card>

    <!-- Estado 2: sucesso -->
    <v-card v-else-if="success" class="pa-8 text-center" elevation="8" rounded="lg">
        <v-icon color="success" size="72">mdi-check-circle-outline</v-icon>
        <h2 class="text-h5 font-weight-bold mt-4 mb-2">Senha atualizada!</h2>
        <p class="text-body-1 text-medium-emphasis">
            Redirecionando para o login...
        </p>
        <v-progress-linear indeterminate color="primary" class="mt-4" />
    </v-card>

    <!-- Estado 3: formulário -->
    <v-card v-else-if="sessionReady" class="pa-6" elevation="8" rounded="lg">
        <div class="text-center mb-6">
            <v-icon color="primary" size="56">mdi-shield-lock-outline</v-icon>
            <h1 class="text-h5 font-weight-bold mt-2">Nova senha</h1>
            <p class="text-body-2 text-medium-emphasis mt-1">
                Defina uma senha forte para proteger sua conta.
            </p>
        </div>

        <v-form ref="formRef" @submit.prevent="onSubmit">
            <v-text-field v-model="form.password" label="Nova senha" :type="showPass ? 'text' : 'password'"
                autocomplete="new-password" prepend-inner-icon="mdi-lock-outline"
                :append-inner-icon="showPass ? 'mdi-eye-off' : 'mdi-eye'" @click:append-inner="showPass = !showPass"
                :rules="[authRules.required, authRules.strongPassword]" hint="Mínimo 8 caracteres, letras e números"
                persistent-hint :disabled="loading" variant="outlined" density="comfortable" autofocus />

            <v-text-field v-model="form.confirmPassword" label="Confirme a nova senha"
                :type="showPass ? 'text' : 'password'" autocomplete="new-password"
                prepend-inner-icon="mdi-lock-check-outline" :rules="[authRules.required, passwordsMatch]"
                :disabled="loading" variant="outlined" density="comfortable" class="mt-2" />

            <v-btn type="submit" color="primary" size="large" block :loading="loading" class="mt-2">
                Redefinir senha
            </v-btn>
        </v-form>
    </v-card>

    <!-- Estado 4: aguardando validação da URL -->
    <v-card v-else class="pa-8 text-center" elevation="8" rounded="lg">
        <v-progress-circular indeterminate color="primary" size="64" />
        <p class="text-body-1 text-medium-emphasis mt-4">Validando link...</p>
    </v-card>

</template>
