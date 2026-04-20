<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppTextField from '@/components/base/AppTextField.vue';
import { useAuthStore } from '@/stores/auth';
import { useAsyncState } from '@/composables/useAsyncState';
import { isFirebaseConfigured } from '@/services/firebase';

const router = useRouter();
const authStore = useAuthStore();
const { loading, error, run } = useAsyncState();
const success = ref('');

const form = reactive({
  email: '',
  password: '',
});

async function handleSubmit() {
  success.value = '';
  await run(async () => {
    await authStore.login(form.email, form.password);
    success.value = 'Login realizado com sucesso.';
    router.push({ name: 'dashboard-overview' });
  });
}
</script>

<template>
  <v-card class="glass-panel pa-6 pa-md-8">
    <div class="text-overline text-medium-emphasis mb-3">Acesso</div>
    <div class="text-h4 font-weight-bold mb-2">Entre na sua conta</div>
    <div class="text-body-1 text-medium-emphasis mb-6">Gerencie sua vitrine, produtos e identidade visual.</div>

    <v-alert v-if="!isFirebaseConfigured" type="warning" variant="tonal" class="mb-4">
      Configure as variáveis do Firebase antes de autenticar.
    </v-alert>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
    <v-alert v-if="success" type="success" variant="tonal" class="mb-4">{{ success }}</v-alert>

    <v-form @submit.prevent="handleSubmit">
      <div class="d-flex flex-column ga-4">
        <AppTextField v-model="form.email" label="E-mail" type="email" hint="Use o e-mail cadastrado no Firebase Auth" />
        <AppTextField v-model="form.password" label="Senha" type="password" />
        <v-btn :loading="loading" color="primary" size="large" type="submit" block>Entrar</v-btn>
      </div>
    </v-form>

    <div class="text-body-2 text-medium-emphasis mt-6">
      Ainda não tem conta?
      <router-link class="font-weight-bold" :to="{ name: 'register' }">Criar cadastro</router-link>
    </div>
  </v-card>
</template>
