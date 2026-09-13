<!-- src/layouts/StoreLayout.vue -->
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useStorefrontStore } from '@/stores/storefront.store'
import { useCartStore } from '@/stores/cart.store'

const route = useRoute()
const router = useRouter()
const sf = useStorefrontStore()
const cart = useCartStore()

const { store, loading, notFound, themeColor } = storeToRefs(sf)

const storeSlug = computed(() => route.params.storeSlug as string)

// Carrega a loja quando o slug muda
watch(storeSlug, async (slug) => {
    if (!slug) return
    await sf.loadBySlug(slug)
    // Aplica cor do tema dinamicamente
    document.documentElement.style.setProperty('--store-theme', themeColor.value)
    // Atualiza título da aba
    if (store.value) {
        document.title = store.value.name
    }
}, { immediate: true })

const cartItemCount = computed(() => cart.itemCount)
</script>

<template>
    <!--  Loading global  -->
    <div v-if="loading" class="storefront-loading">
        <v-progress-circular indeterminate color="primary" size="48" />
    </div>

    <!--  Store não encontrada → 404  -->
    <div v-else-if="notFound" class="storefront-notfound">
        <v-icon size="80" color="grey-lighten-1">mdi-store-off-outline</v-icon>
        <h1 class="text-h4 font-weight-black mt-4">Loja não encontrada</h1>
        <p class="text-body-1 text-medium-emphasis mt-2">
            O endereço <code>/s/{{ storeSlug }}</code> não existe ou foi desativado.
        </p>
        <v-btn color="primary" class="mt-6" @click="router.push('/')">
            Ir para a home
        </v-btn>
    </div>

    <!--  Store carregada  -->
    <div v-else class="storefront-layout" :style="{ '--store-theme': themeColor }">
        
        <!-- Header -->
        <header class="storefront-header">
            <router-link :to="{ name: 'storefront', params: { storeSlug } }" class="header-brand">
                <v-avatar v-if="store?.logo_url" :image="store.logo_url" size="50" rounded="lg" />
                <span class="brand-name">{{ store?.name }}</span>
            </router-link>

            <div class="header-actions">
                <v-btn icon="mdi-magnify" variant="text" size="small"
                    @click="router.push({ name: 'storefront-search', params: { storeSlug } })" />
                <v-btn variant="text" class="cart-btn"
                    @click="router.push({ name: 'storefront-cart', params: { storeSlug } })">
                    <v-icon>mdi-cart-outline</v-icon>
                    <v-badge v-if="cartItemCount > 0" :content="cartItemCount" color="error" floating />
                </v-btn>
            </div>
        </header>
        <!-- Banner (opcional) -->
        <div v-if="store?.banner_url" class="storefront-banner"
            :style="{ backgroundImage: `url(${store.banner_url})` }" />

        <!-- Conteúdo -->
        <main class="storefront-main">
            <router-view v-slot="{ Component }">
                <v-fade-transition mode="out-in">
                    <component :is="Component" />
                </v-fade-transition>
            </router-view>
        </main>

        <!-- Footer -->
        <footer class="storefront-footer">
            <p class="text-caption text-medium-emphasis">
                © {{ new Date().getFullYear() }} {{ store?.name }} · Powered by
                <a href="https://vibestore.app" target="_blank" class="text-primary">VibeStore</a>
            </p>
        </footer>
    </div>
</template>

<style scoped>
.storefront-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: rgb(var(--v-theme-background));
}

.storefront-banner {
    height: 640px;
    max-height: 75vh;
    background-size: cover;
    background-position: center;
}

.storefront-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: rgb(var(--v-theme-surface));
    border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
    position: sticky;
    top: 0;
    z-index: 10;
}

.header-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: inherit;
}

.brand-name {
    font-size: 1.125rem;
    font-weight: 800;
    color: rgb(var(--v-theme-on-surface));
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.storefront-main {
    flex: 1;
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
}

.storefront-footer {
    padding: 24px;
    text-align: center;
    border-top: 1px solid rgba(var(--v-border-color), 0.08);
}

.storefront-loading,
.storefront-notfound {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px;
}
</style>
