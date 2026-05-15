<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useDisplay } from 'vuetify'; // Hook para breakpoints dinâmicos
import { useCartStore } from '@/stores/cart';
import { useStorefrontStore } from '@/stores/storefront';
import { useUiStore } from '@/stores/ui';
import { useWhatsApp } from '@/composables/useWhatsApp';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{
    storeSlug?: string;
}>();

const router = useRouter();
const { xs, smAndDown } = useDisplay(); // Detecta mobile e tablet
const cartStore = useCartStore();
const storefrontStore = useStorefrontStore();
const uiStore = useUiStore();
const { buildCartLink } = useWhatsApp();

// --- LARGURA DINÂMICA ---
const drawerWidth = computed(() => {
    if (xs.value) return 1000; // Mobile full screen
    if (smAndDown.value) return 400; // Tablet
    return 450; // Desktop
});

// --- LOGICA DE DADOS ---
const modal = computed(() => uiStore.cartDrawerOpen)

const visibleItems = computed(() =>
    props.storeSlug ? cartStore.itemsByStore(props.storeSlug) : cartStore.items
);

const total = computed(() =>
    visibleItems.value.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

const checkoutLink = computed(() => {
    const phone = storefrontStore.settings.channels?.whatsappNumber;
    return phone && visibleItems.value.length
        ? buildCartLink(phone, visibleItems.value)
        : '#';
});

function updateQuantity(productId: string, delta: number) {
    const item = visibleItems.value.find(i => i.productId === productId);
    if (!item) return;
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
        cartStore.removeItem(productId, props.storeSlug!);
    } else {
        cartStore.updateQuantity(productId, newQty, props.storeSlug!);
    }
}

function goToCart() {
    if (!props.storeSlug) return;
    uiStore.closeCartDrawer();
    router.push({ name: 'cart', params: { storeSlug: props.storeSlug } });
}
</script>

<template>
    <v-navigation-drawer v-if="modal" v-model="modal" location="right" temporary capture-focus disable-resize-watcher
        :width="drawerWidth" elevation="10">
        <div class="d-flex flex-column h-100 w-100 bg-white z-100">
            <div class="pa-4 pa-md-5 border-b d-flex align-center justify-space-between bg-surface sticky-header w-100">
                <div>
                    <div class="text-h6 font-weight-black d-flex align-center w-100">
                        Meu Carrinho
                        <v-chip size="x-small" color="primary" class="ml-2 font-weight-bold">
                            {{ visibleItems.length }}
                        </v-chip>
                    </div>
                    <div class="text-caption text-medium-emphasis">Resumo dos seus itens</div>
                </div>
                <v-btn icon="mdi-close" variant="tonal" density="comfortable" @click="uiStore.closeCartDrawer" />
            </div>

            <div class="flex-grow-1 overflow-y-auto pa-3 pa-md-4 bg-grey-lighten-5 w-100">
                <v-fade-transition group v-if="visibleItems.length" class="w-100">
                    <div class="w-100">
                        <v-card v-for="item in visibleItems" :key="`${item.storeSlug}-${item.productId}`" flat border
                            rounded="xl" class="mb-3 pa-3 item-card">
                            <div class="d-flex ga-3 ga-md-4">
                                <v-avatar :size="xs ? 60 : 80" rounded="lg" border class="flex-shrink-0">
                                    <v-img :src="item.imageUrl || 'https://placehold.co/300'" cover />
                                </v-avatar>

                                <div class="flex-grow-1 d-flex flex-column justify-space-between min-w-0">
                                    <div class="d-flex justify-space-between align-start ga-2">
                                        <span class="text-body-2 font-weight-bold text-clamp-2 leading-tight">
                                            {{ item.name }}
                                        </span>
                                        <v-btn icon="mdi-trash-can-outline" variant="text" color="error" size="small"
                                            density="comfortable"
                                            @click="cartStore.removeItem(item.productId, item.storeSlug)" />
                                    </div>

                                    <div class="text-primary font-weight-black text-body-2 mb-2">
                                        {{ formatCurrency(item.price) }}
                                    </div>

                                    <div class="d-flex flex-wrap align-center justify-space-between ga-2">
                                        <div class="qty-selector d-flex align-center border rounded-pill">
                                            <v-btn icon="mdi-minus" variant="text" size="x-small"
                                                @click="updateQuantity(item.productId, -1)" />
                                            <span class="px-2 text-caption font-weight-bold">{{ item.quantity }}</span>
                                            <v-btn icon="mdi-plus" variant="text" size="x-small"
                                                @click="updateQuantity(item.productId, 1)" />
                                        </div>

                                        <div class="text-caption font-weight-black text-right">
                                            Sub: <span class="text-body-2">{{ formatCurrency(item.price * item.quantity)
                                            }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </v-card>
                    </div>
                </v-fade-transition>

                <div v-else class="empty-state d-flex flex-column align-center justify-center text-center">
                    <v-icon icon="mdi-cart-off-outline" size="80" color="grey-lighten-2" class="mb-4" />
                    <div class="text-h6 font-weight-bold text-grey-darken-1">Seu carrinho está vazio</div>
                    <p class="text-body-2 text-medium-emphasis mb-6 px-10">Adicione produtos para gerar seu pedido via
                        WhatsApp.</p>
                    <v-btn color="primary" variant="flat" rounded="pill" class="px-8" @click="uiStore.closeCartDrawer">
                        Ver produtos
                    </v-btn>
                </div>
            </div>

            <div v-if="visibleItems.length" class="pa-4 pa-md-5 border-t bg-surface footer-shadow">
                <div class="d-flex justify-space-between align-center mb-5">
                    <div class="d-flex flex-column">
                        <span class="text-caption text-medium-emphasis uppercase font-weight-bold">Total do
                            Pedido</span>
                        <span class="text-h5 font-weight-black text-primary leading-none">{{ formatCurrency(total)
                            }}</span>
                    </div>
                </div>

                <div class="d-flex flex-column ga-3">
                    <v-btn color="success" height="56" rounded="pill" block
                        class="text-none font-weight-bold checkout-btn" prepend-icon="mdi-whatsapp" elevation="4"
                        :href="checkoutLink" target="_blank">
                        Finalizar pelo WhatsApp
                    </v-btn>

                    <v-btn variant="text" block rounded="pill" class="text-none text-medium-emphasis" @click="goToCart">
                        Ajustar carrinho completo
                    </v-btn>
                </div>
            </div>
        </div>
    </v-navigation-drawer>
</template>

<style scoped>
.sticky-header {
    position: sticky;
    top: 0;
    z-index: 2;
}

.footer-shadow {
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
}

.item-card {
    background: white;
    transition: all 0.2s ease;
    width: 100%;
}

.text-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.qty-selector {
    height: 36px;
    /* Aumentado para facilitar o toque no mobile */
    background: #f1f5f9;
}

.qty-selector :deep(.v-btn) {
    width: 32px;
    height: 32px;
}

.empty-state {
    height: 100%;
    min-height: 300px;
}

.leading-none {
    line-height: 1 !important;
}

.leading-tight {
    line-height: 1.25 !important;
}

.uppercase {
    text-transform: uppercase;
    letter-spacing: 1px;
}

/* Custom scrollbar mais fina e moderna */
.overflow-y-auto::-webkit-scrollbar {
    width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;
}
</style>