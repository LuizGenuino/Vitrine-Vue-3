import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { authService } from '@/services/authService';
import type { User } from 'firebase/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(true);
  let initialized = false;

  const isAuthenticated = computed(() => Boolean(user.value));

  function init() {
    if (initialized) return;
    initialized = true;
    authService.subscribe((currentUser) => {
      user.value = currentUser;
      loading.value = false;
    });
  }

  async function login(email: string, password: string) {
    return authService.login(email, password);
  }

  async function register(email: string, password: string) {
    return authService.register(email, password);
  }

  async function logout() {
    return authService.logout();
  }

  return { user, loading, isAuthenticated, init, login, register, logout };
});
