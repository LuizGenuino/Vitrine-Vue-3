<script setup lang="ts">
import { ref } from 'vue';
import ThemeToggle from '@/components/base/ThemeToggle.vue';

const drawer = ref(false);

const navLinks = [
    { title: 'Como funciona', to: '#como-funciona' },
    { title: 'Preços', to: '#precos' },
    { title: 'Exemplos', to: '#exemplos' },
];
</script>

<template>
    <v-navigation-drawer v-model="drawer" location="right" temporary class="pa-4">
        <div class="d-flex flex-column ga-4">
            <div class="text-overline mb-2">Navegação</div>
            <v-btn v-for="link in navLinks" :key="link.title" variant="text" block class="justify-start">
                {{ link.title }}
            </v-btn>
            <v-divider></v-divider>
            <v-btn variant="outlined" color="primary" block :to="{ name: 'login' }">Entrar</v-btn>
            <v-btn color="primary" block :to="{ name: 'register' }">Criar minha vitrine</v-btn>
        </div>
    </v-navigation-drawer>

    <v-app-bar flat color="transparent" height="100" extension-height="0">
        <v-container class="pa-0">
            <v-card class="navbar-blur px-4 py-2 mx-2 mx-md-0 d-flex align-center justify-space-between" rounded="pill"
                elevation="0" border>
                <router-link :to="{ name: 'landing' }"
                    class="d-flex align-center ga-3 text-decoration-none text-high-emphasis">
                    <v-avatar color="primary" size="40" class="elevation-4">
                        <span class="text-white font-weight-bold">VS</span>
                    </v-avatar>
                    <div class="hidden-xs-only">
                        <div class="font-weight-black text-h6 leading-tight">VibeStore</div>
                        <div class="text-caption text-medium-emphasis mt-n1">Vitrine Digital</div>
                    </div>
                </router-link>

                <div class="hidden-md-and-down d-flex align-center ga-2">
                    <v-btn v-for="link in navLinks" :key="link.title" variant="text" class="text-none">
                        {{ link.title }}
                    </v-btn>
                </div>

                <div class="d-flex align-center ga-1 ga-sm-2">
                    <ThemeToggle />

                    <div class="hidden-sm-and-down d-flex align-center ga-2">
                        <v-btn variant="text" font-weight-bold :to="{ name: 'login' }" class="text-none">Entrar</v-btn>
                        <v-btn color="primary" rounded="pill" elevation="0" :to="{ name: 'register' }"
                            class="text-none px-6">
                            Começar Agora
                        </v-btn>
                    </div>

                    <v-btn icon="mdi-menu" variant="tonal" color="primary" class="hidden-md-and-up ml-2"
                        @click="drawer = !drawer"></v-btn>
                </div>
            </v-card>
        </v-container>
    </v-app-bar>

    <v-main class="bg-background">
        <router-view />
    </v-main>
</template>

<style scoped>
.navbar-blur {
    background: rgba(var(--v-theme-surface), 0.8) !important;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-color: rgba(var(--v-border-color), 0.1) !important;
}

.leading-tight {
    line-height: 1.2;
}

.router-link-active {
    text-decoration: none;
}

.v-card {
    transition: all 0.3s ease-in-out;
}
</style>