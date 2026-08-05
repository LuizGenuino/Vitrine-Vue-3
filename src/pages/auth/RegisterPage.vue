<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppTextField from '@/components/base/AppTextField.vue';
import { useAuthStore } from '@/stores/auth';
import { useAsyncState } from '@/composables/useAsyncState';
import { toast } from '@/utils/swal/toast';

const router = useRouter();
const authStore = useAuthStore();
const { loading, error, run } = useAsyncState();
const success = ref('');

const form = reactive({
    email: '',
    password: '',
    confirmPassword: '',
});

async function handleSubmit() {
    success.value = '';
    if (form.password !== form.confirmPassword) {
        return (success.value = 'As senhas precisam ser idênticas.');
    }

    await run(async () => {
        await authStore.register(form.email, form.password);
        success.value = 'Conta criada com sucesso.';
        toast('Conta criada com sucesso.', 'success');
        router.push({ name: 'dashboard-overview' });
    }).catch((err) => {
        error.value = 'Erro ao criar conta.';
        toast('Erro ao criar conta.', 'error');
    });
}
</script>

<template>
    <v-card class="glass-panel pa-6 pa-md-8">
        <div class="text-overline text-medium-emphasis mb-3">Cadastro</div>
        <div class="text-h4 font-weight-bold mb-2">Comece sua operação digital</div>
        <div class="text-body-1 text-medium-emphasis mb-6">Crie sua conta e configure sua vitrine em poucos minutos.
        </div>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
        <v-alert v-if="success" :type="form.password === form.confirmPassword ? 'success' : 'warning'" variant="tonal"
            class="mb-4">
            {{ success }}
        </v-alert>

        <v-form @submit.prevent="handleSubmit">
            <div class="d-flex flex-column ga-4">
                <AppTextField v-model="form.email" label="E-mail" type="email" />
                <AppTextField v-model="form.password" label="Senha" type="password"
                    hint="Use uma senha forte para sua conta" />
                <AppTextField v-model="form.confirmPassword" label="Confirmar senha" type="password" />
                <v-btn :loading="loading" color="primary" size="large" type="submit" block>Criar conta</v-btn>
            </div>
        </v-form>

        <div class="text-body-2 text-medium-emphasis mt-6">
            Já possui acesso?
            <router-link class="font-weight-bold" :to="{ name: 'login' }">Fazer login</router-link>
        </div>
    </v-card>
</template>
