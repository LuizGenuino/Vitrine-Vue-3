<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppTextField from '@/components/base/AppTextField.vue';
import { useAuthStore } from '@/stores/auth.store';
import { authRules } from '@/lib/validators';
import { useAsyncAction } from '@/composables/useAsyncAction';


const auth = useAuthStore()
const router = useRouter()

const formRef = ref()
const showPass = ref(false)
const emailSent = ref(false)
const form = reactive({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
})

const passwordsMatch = computed(() =>
    authRules.matches(form.password)(form.confirmPassword)
)

const { execute: submitSignUp, loading } = useAsyncAction(
    async () => {
        const { session } = await auth.signUp(
            form.email,
            form.password,
            form.fullName,
        )

        if (!session) {
            emailSent.value = true
        } else {
            await router.push({ name: 'onboarding' })
        }
    },
    { successMsg: 'Conta criada com sucesso!' }
)

async function onSubmit() {
    const { valid } = await formRef.value.validate()
    if (!valid) return
    await submitSignUp()
}
</script>

<template>
    <div>
        <v-card v-if="emailSent" class="pa-8 text-center" elevation="8" rounded="lg">
            <v-icon color="success" size="72">mdi-email-check-outline</v-icon>
            <h2 class="text-h5 font-weight-bold mt-4 mb-2">Verifique seu e-mail</h2>
            <p class="text-body-1 text-medium-emphasis mb-6">
                Enviamos um link de confirmação para <strong>{{ form.email }}</strong>.
                Clique nele para ativar sua conta.
            </p>
            <v-btn color="primary" :to="{ name: 'login' }">Ir para o login</v-btn>
        </v-card>
        <v-card v-else class="glass-panel pa-6 pa-md-8">
            <div class="text-overline text-medium-emphasis mb-3">Cadastro</div>
            <div class="text-h4 font-weight-bold mb-2">Comece sua operação digital</div>
            <div class="text-body-1 text-medium-emphasis mb-6">Crie sua conta e configure sua vitrine em poucos minutos.
            </div>

            <v-form ref="formRef" @submit.prevent="onSubmit">
                <v-text-field v-model="form.fullName" label="Nome completo" autocomplete="name"
                    prepend-inner-icon="mdi-account-outline" :rules="[authRules.required, authRules.minLength(3)]"
                    :disabled="loading" variant="outlined" density="comfortable" />

                <v-text-field v-model="form.email" label="E-mail" type="email" autocomplete="email"
                    prepend-inner-icon="mdi-email-outline" :rules="[authRules.required, authRules.email]"
                    :disabled="loading" variant="outlined" density="comfortable" class="mt-2" />

                <v-text-field v-model="form.password" label="Senha" :type="showPass ? 'text' : 'password'"
                    autocomplete="new-password" prepend-inner-icon="mdi-lock-outline"
                    :append-inner-icon="showPass ? 'mdi-eye-off' : 'mdi-eye'" @click:append-inner="showPass = !showPass"
                    :rules="[authRules.required, authRules.strongPassword]" hint="Mínimo 8 caracteres, letras e números"
                    persistent-hint :disabled="loading" variant="outlined" density="comfortable" class="mt-2" />

                <v-text-field v-model="form.confirmPassword" label="Confirme a senha"
                    :type="showPass ? 'text' : 'password'" autocomplete="new-password"
                    prepend-inner-icon="mdi-lock-check-outline" :rules="[authRules.required, passwordsMatch]"
                    :disabled="loading" variant="outlined" density="comfortable" class="mt-2" />

                <v-checkbox v-model="form.acceptTerms" :rules="[v => !!v || 'Você precisa aceitar os termos']"
                    :disabled="loading" density="compact" class="mt-2">
                    <template #label>
                        <span class="text-body-2">
                            Aceito os
                            <a href="/terms" target="_blank" class="text-primary">termos de uso</a>
                            e a
                            <a href="/privacy" target="_blank" class="text-primary">política de privacidade</a>
                        </span>
                    </template>
                </v-checkbox>

                <v-btn type="submit" color="primary" size="large" block :loading="loading" class="mt-2">
                    Criar conta
                </v-btn>

                <div class="text-center mt-6">
                    <span class="text-body-2 text-medium-emphasis">
                        Já tem conta?
                    </span>
                    <router-link :to="{ name: 'login' }"
                        class="text-body-2 text-primary text-decoration-none font-weight-medium ml-1">
                        Faça login
                    </router-link>
                </div>
            </v-form>
        </v-card>
    </div>
</template>
