<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCartStore } from '@/stores/cart';
import { useStorefrontStore } from '@/stores/storefront';
import { useUiStore } from '@/stores/ui';
import { useWhatsApp } from '@/composables/useWhatsApp';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{
    storeSlug?: string;
}>();

const router = useRouter();
const cartStore = useCartStore();
const storefrontStore = useStorefrontStore();
const uiStore = useUiStore();
const { buildCartLink } = useWhatsApp();

// --- LOGICA DE DADOS ---
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

// --- AÇÕES ---
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
    <v-navigation-drawer v-model="uiStore.cartDrawerOpen" location="right" temporary
        :width="$vuetify.display.xs ? '100%' : 420" class="cart-drawer">
        <div class="d-flex flex-column h-100">
            <div class="pa-5 border-b d-flex align-center justify-space-between bg-surface">
                <div>
                    <div class="text-h6 font-weight-black">Meu Carrinho</div>
                    <div class="text-caption text-medium-emphasis">
                        {{ visibleItems.length }} {{ visibleItems.length === 1 ?
                            'item selecionado' : 'itens selecionados' }}
                    </div>
                </div>
                <v-btn icon="mdi-close" variant="tonal" size="small" @click="uiStore.closeCartDrawer" />
            </div>

            <div class="flex-grow-1 overflow-y-auto pa-4 bg-grey-lighten-5">
                <v-fade-transition group v-if="visibleItems.length">
                    <v-card v-for="item in visibleItems" :key="`${item.storeSlug}-${item.productId}`" flat border
                        rounded="lg" class="mb-3 pa-3 item-card">
                        <div class="d-flex ga-3">
                            <v-avatar size="70" rounded="lg" border>
                                <v-img :src="item.imageUrl || 'https://placehold.co/300'" cover />
                            </v-avatar>

                            <div class="flex-grow-1 d-flex flex-column">
                                <div class="d-flex justify-space-between align-start">
                                    <span class="text-body-2 font-weight-bold text-truncate" style="max-width: 180px">
                                        {{ item.name }}
                                    </span>
                                    <v-btn icon="mdi-delete-outline" variant="text" color="error" size="x-small"
                                        @click="cartStore.removeItem(item.productId, item.storeSlug)" />
                                </div>

                                <div class="text-primary font-weight-black text-body-1 mt-1">
                                    {{ formatCurrency(item.price) }}
                                </div>

                                <div class="d-flex align-center justify-space-between mt-auto">
                                    <div class="qty-selector d-flex align-center border rounded-pill">
                                        <v-btn icon="mdi-minus" variant="text" size="x-small"
                                            @click="updateQuantity(item.productId, -1)" />
                                        <span class="px-3 text-caption font-weight-bold">{{ item.quantity }}</span>
                                        <v-btn icon="mdi-plus" variant="text" size="x-small"
                                            @click="updateQuantity(item.productId, 1)" />
                                    </div>
                                    <div class="text-caption text-medium-emphasis font-weight-bold">
                                        Sub: {{ formatCurrency(item.price * item.quantity) }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </v-card>
                </v-fade-transition>

                <div v-else class="h-100 d-flex flex-column align-center justify-center text-center pa-10">
                    <v-icon icon="mdi-cart-outline" size="64" color="grey-lighten-1" class="mb-4" />
                    <div class="text-h6 font-weight-bold text-grey-darken-1">Seu carrinho está vazio</div>
                    <p class="text-body-2 text-medium-emphasis mb-6">Parece que você ainda não adicionou produtos à sua
                        lista.</p>
                    <v-btn color="primary" variant="flat" rounded="pill" block @click="uiStore.closeCartDrawer">
                        Continuar Comprando
                    </v-btn>
                </div>
            </div>

            <div v-if="visibleItems.length" class="pa-5 border-t bg-surface">
                <div class="d-flex justify-space-between align-center mb-6">
                    <span class="text-subtitle-1 font-weight-medium">Total do Pedido</span>
                    <span class="text-h5 font-weight-black text-primary">{{ formatCurrency(total) }}</span>
                </div>

                <div class="d-flex flex-column ga-3">
                    <v-btn color="success" size="x-large" rounded="pill" block
                        class="text-none font-weight-bold checkout-btn" prepend-icon="mdi-whatsapp" elevation="4"
                        :href="checkoutLink" target="_blank">
                        Finalizar pelo WhatsApp
                    </v-btn>

                    <v-btn variant="text" block class="text-none text-medium-emphasis" @click="goToCart">
                        Ver carrinho completo e detalhes
                    </v-btn>
                </div>
            </div>
        </div>
    </v-navigation-drawer>
</template>

<style scoped>
.cart-drawer {
    z-index: 2000 !important;
}

.item-card {
    background: white;
    transition: transform 0.2s ease;
}

.item-card:hover {
    transform: scale(1.01);
}

.qty-selector {
    height: 32px;
    background: #f8fafc;
}

.qty-selector :deep(.v-btn) {
    width: 32px;
    height: 32px;
}

.checkout-btn {
    letter-spacing: 0.5px;
    text-transform: none;
}

/* Custom scrollbar para parecer mais nativo */
.overflow-y-auto::-webkit-scrollbar {
    width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 10px;
}
</style>