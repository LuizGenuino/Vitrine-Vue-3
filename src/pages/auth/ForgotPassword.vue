<!-- src/views/auth/ForgotPassword.vue -->
<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { authRules } from '@/lib/validators'

const auth = useAuthStore()

const formRef = ref()
const sent = ref(false)
const form = reactive({ email: '' })

const { execute: submitReset, loading } = useAsyncAction(
    async () => {
        await auth.resetPassword(form.email)
        sent.value = true
    },
)

async function onSubmit() {
    const { valid } = await formRef.value.validate()
    if (!valid) return
    await submitReset()
}
</script>

<template>


    <v-card v-if="sent" class="pa-8 text-center" elevation="8" rounded="lg">
        <v-icon color="success" size="72">mdi-email-fast-outline</v-icon>
        <h2 class="text-h5 font-weight-bold mt-4 mb-2">E-mail enviado!</h2>
        <p class="text-body-1 text-medium-emphasis mb-6">
            Se existe uma conta com <strong>{{ form.email }}</strong>,
            você receberá em instantes um link para redefinir sua senha.
        </p>
        <v-btn color="primary" :to="{ name: 'login' }">Voltar ao login</v-btn>
    </v-card>

    <v-card v-else class="pa-6" elevation="8" rounded="lg">
        <div class="text-center mb-6">
            <v-icon color="primary" size="56">mdi-lock-reset</v-icon>
            <h1 class="text-h5 font-weight-bold mt-2">Esqueceu a senha?</h1>
            <p class="text-body-2 text-medium-emphasis mt-1">
                Informe seu e-mail e enviaremos um link de recuperação.
            </p>
        </div>

        <v-form ref="formRef" @submit.prevent="onSubmit">
            <v-text-field v-model="form.email" label="E-mail" type="email" autocomplete="email"
                prepend-inner-icon="mdi-email-outline" :rules="[authRules.required, authRules.email]"
                :disabled="loading" variant="outlined" density="comfortable" autofocus />

            <v-btn type="submit" color="primary" size="large" block :loading="loading" class="mt-2">
                Enviar link de recuperação
            </v-btn>

            <div class="text-center mt-6">
                <router-link :to="{ name: 'login' }" class="text-body-2 text-primary text-decoration-none">
                    ← Voltar ao login
                </router-link>
            </div>
        </v-form>
    </v-card>
</template>
