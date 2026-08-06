<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppTextField from '@/components/base/AppTextField.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useAsyncAction } from '@/composables/useAsyncAction';
import { useRoute } from 'vuetify/lib/composables/router.mjs';
import { authRules } from '@/lib/validators';

const router = useRouter();
const route: any = useRoute()
const auth = useAuthStore();
const { execute: submitLogin, loading } = useAsyncAction(
    async () => {
        await auth.signIn(form.email, form.password)
        // após signIn, o onAuthStateChange já populou profile + stores
        const redirect = (route.query.redirect as string) || '/dashboard'
        await router.push(redirect)
    },
    { successMsg: 'Bem-vindo(a) de volta! 🎉' }
)

const showPass = ref(false)
const formRef = ref()

const form = reactive({
    email: '',
    password: '',
});

async function onSubmit() {
    const { valid } = await formRef.value.validate()
    if (!valid) return
    await submitLogin()
}

</script>


<template>
    <v-card class="glass-panel pa-6 pa-md-8">
        <div class="text-overline text-medium-emphasis mb-3">Acesso</div>
        <div class="text-h4 font-weight-bold mb-2">Entre na sua conta</div>
        <div class="text-body-1 text-medium-emphasis mb-6">Gerencie sua vitrine, produtos e identidade visual.</div>


        <v-form ref="formRef" @submit.prevent="onSubmit">
            <div class="d-flex flex-column ga-4">
                <AppTextField v-model="form.email" label="E-mail" type="email" autocomplete="email"
                    prepend-inner-icon="mdi-email-outline" :rules="[authRules.required, authRules.email]"
                    :disabled="loading" />
                <AppTextField v-model="form.password" label="Senha" :type="showPass ? 'text' : 'password'"
                    autocomplete="current-password" prepend-inner-icon="mdi-lock-outline"
                    :append-inner-icon="showPass ? 'mdi-eye-off' : 'mdi-eye'" @click:append-inner="showPass = !showPass"
                    :rules="[authRules.required]" :disabled="loading" />
                <div class="d-flex justify-end mb-4">
                    <router-link :to="{ name: 'forgot-password' }"
                        class="text-body-2 text-primary text-decoration-none">
                        Esqueci minha senha
                    </router-link>
                </div>
                <v-btn :loading="loading" color="primary" size="large" type="submit" block>Entrar</v-btn>
            </div>
        </v-form>

        <v-divider class="my-6">ou</v-divider>

        <div class="text-center">
            <span class="text-body-2 text-medium-emphasis">
                Ainda não tem conta?
            </span>
            <router-link :to="{ name: 'register' }"
                class="text-body-2 text-primary text-decoration-none font-weight-medium ml-1">
                Cadastre-se grátis
            </router-link>
        </div>
    </v-card>
</template>
