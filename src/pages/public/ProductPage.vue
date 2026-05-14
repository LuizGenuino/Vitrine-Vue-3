<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { productService } from '@/services/productService';
import { categoryService } from '@/services/categoryService';
import { useStorefrontStore } from '@/stores/storefront';
import { useCartStore } from '@/stores/cart';
import { useUiStore } from '@/stores/ui';
import { useWhatsApp } from '@/composables/useWhatsApp';
import { formatCurrency } from '@/utils/format';
import type { Category, Product } from '@/types';

const route = useRoute();
const router = useRouter();
const storefrontStore = useStorefrontStore();
const cartStore = useCartStore();
const uiStore = useUiStore();
const { buildProductLink } = useWhatsApp();

const panel = ref([0, 1])
const product = ref<Product | null>(null);
const categories = ref<Category[]>([]);
const loading = ref(true);
const activeImage = ref('');
const quantity = ref(1);

const storeSlug = computed(() => String(route.params.storeSlug || ''));
const productSlug = computed(() => String(route.params.productSlug || ''));

const categoryName = computed(() =>
    categories.value.find((item) => item.id === product.value?.categoryId)?.name || 'Produto'
);

// Computed de características mais robusto
const characteristics = computed(() => {
    if (!product.value?.characteristics) return [];
    return product.value.characteristics.map((item: string) => {
        const [key, ...valueParts] = item.split(':');
        return {
            key: key?.trim() || 'Info',
            value: valueParts.join(':')?.trim() || 'Consultar'
        };
    });
});

async function loadProduct() {
    loading.value = true;
    try {
        product.value = await productService.getPublicProductBySlug(storeSlug.value, productSlug.value);
        if (product.value) {
            activeImage.value = product.value.imageUrls[0] || '';
        }
        if (storefrontStore.settings.ownerId) {
            categories.value = await categoryService.listCategories(storefrontStore.settings.ownerId);
        }
    } finally {
        loading.value = false;
    }
}

function addToCart() {
    if (!product.value) return;
    cartStore.addItem({
        productId: product.value.id || product.value.slug,
        storeSlug: storeSlug.value,
        name: product.value.name,
        price: product.value.price,
        quantity: quantity.value,
        imageUrl: product.value.imageUrls[0],
    });
    uiStore.openCartDrawer();
}

function buyNow() {
    if (!product.value) return;
    window.open(buildProductLink(storefrontStore.settings.channels.whatsappNumber, product.value, quantity.value), '_blank');
}

onMounted(loadProduct);
</script>

<template>
    <v-container class="pb-16 pt-4 px-4 px-md-10">
        <v-btn variant="text" prepend-icon="mdi-chevron-left" class="mb-6 text-none opacity-70 px-0"
            @click="router.back()">
            Voltar para a vitrine
        </v-btn>

        <v-row v-if="loading" justify="center">
            <v-col cols="12" md="10">
                <v-skeleton-loader type="image, article, actions" class="rounded-xl" />
            </v-col>
        </v-row>

        <v-row v-else-if="product" spacing="6" justify="center" class="flex-wrap-reverse">
            <v-col cols="12" md="7" lg="8">
                <v-card variant="flat" rounded="xl" class="overflow-hidden border mb-8">
                    <v-img :src="activeImage || 'https://placehold.co/800x800?text=Sem+Imagem'" height="550" cover
                        class="bg-grey-lighten-4" />
                </v-card>

                <v-slide-group v-if="product.imageUrls.length > 1" class="mb-10" show-arrows>
                    <v-slide-group-item v-for="image in product.imageUrls" :key="image">
                        <v-card
                            :class="['ma-2 rounded-lg border-2 transition-swing', activeImage === image ? 'border-primary shadow-sm' : 'border-transparent opacity-70']"
                            width="90" height="90" @click="activeImage = image">
                            <v-img :src="image" cover height="100%" />
                        </v-card>
                    </v-slide-group-item>
                </v-slide-group>

                <section class="mb-12">
                    <h2 class="text-h5 font-weight-bold mb-4 border-s-lg border-primary ps-4">Descrição</h2>
                    <p class="text-body-1 text-medium-emphasis leading-relaxed pre-line">
                        {{ product.description }}
                    </p>
                </section>

                <section v-if="characteristics.length" class="mb-12">
                    <h2 class="text-h5 font-weight-bold mb-6 border-s-lg border-primary ps-4">Caracteristicas</h2>
                    <v-table class="border rounded-xl spec-table">
                        <tbody>
                            <tr v-for="item in characteristics" :key="item.key">
                                <td class="bg-grey-lighten-4 font-weight-bold text-caption text-uppercase" width="35%">
                                    {{ item.key }}</td>
                                <td class="text-body-2">{{ item.value }}</td>
                            </tr>
                        </tbody>
                    </v-table>
                </section>
                <section v-if="product.details" class="mb-12">
                    <h2 class="text-h5 font-weight-bold mb-6 border-s-lg border-primary ps-4">Detalhes</h2>
                    <p class="text-body-1 text-medium-emphasis leading-relaxed pre-line">
                        {{ product.details }}
                    </p>
                </section>
            </v-col>

            <v-col cols="12" md="5" lg="4">
                <div class="sticky-top">
                    <v-card variant="flat" rounded="xl" border class="pa-6 pa-md-8">
                        <v-chip size="x-small" variant="flat" color="primary"
                            class="mb-4 font-weight-black text-uppercase">
                            {{ categoryName }}
                        </v-chip>

                        <h1 class="text-h4 font-weight-black mb-2 leading-tight">{{ product.name }}</h1>

                        <div class="mt-6 mb-8">
                            <div class="text-h3 font-weight-bold text-primary">
                                {{ formatCurrency(product.price) }}
                            </div>
                            <div class="text-caption text-success font-weight-bold mt-1">
                                <v-icon size="small" icon="mdi-check-circle-outline" class="mr-1"></v-icon>
                                Estoque disponível para entrega imediata
                            </div>
                        </div>

                        <div class="mb-8">
                            <div class="text-subtitle-2 font-weight-bold mb-3">Escolha a quantidade:</div>
                            <v-btn-toggle v-model="quantity" mandatory rounded="pill" color="primary" variant="outlined"
                                block class="qty-toggle">
                                <v-btn :value="quantity - 1" icon="mdi-minus" size="small"
                                    @click="quantity > 1 ? quantity-- : null" />
                                <p class="flex-grow-1 text-h6 font-weight-bold py-2 px-4">{{ quantity }}</p>
                                <v-btn :value="quantity + 1" icon="mdi-plus" size="small" @click="quantity++" />
                            </v-btn-toggle>
                        </div>

                        <div class="d-flex flex-column ga-3">
                            <v-btn block size="x-large" color="primary" rounded="pill" elevation="4"
                                class="text-none font-weight-bold py-7" prepend-icon="mdi-whatsapp" @click="buyNow">
                                Pedir via WhatsApp
                            </v-btn>

                            <v-btn block size="x-large" variant="tonal" color="primary" rounded="pill"
                                class="text-none font-weight-bold" prepend-icon="mdi-cart-plus" @click="addToCart">
                                Adicionar ao Carrinho
                            </v-btn>
                        </div>

                        <v-divider class="my-8" />

                        <v-expansion-panels variant="accordion" v-model="panel" multiple flat class="compact-panels">
                            <v-expansion-panel elevation="0">
                                <v-expansion-panel-title class="font-weight-bold text-body-2">
                                    <v-icon icon="mdi-truck-delivery-outline" class="mr-2" color="primary"></v-icon>
                                    Entrega Local
                                </v-expansion-panel-title>
                                <v-expansion-panel-text class="text-caption opacity-70">
                                    Enviamos para toda a região. O valor do frete e o prazo são combinados diretamente
                                    no seu WhatsApp após o pedido.
                                </v-expansion-panel-text>
                            </v-expansion-panel>

                            <v-expansion-panel elevation="0">
                                <v-expansion-panel-title class="font-weight-bold text-body-2">
                                    <v-icon icon="mdi-shield-check-outline" class="mr-2" color="primary"></v-icon>
                                    Pagamento Combinado
                                </v-expansion-panel-title>
                                <v-expansion-panel-text class="text-caption opacity-70">
                                    Combine com o vendedor a forma de pagamento ao finalizar o pedido
                                </v-expansion-panel-text>
                            </v-expansion-panel>
                        </v-expansion-panels>
                    </v-card>
                </div>
            </v-col>
        </v-row>
    </v-container>

    <v-footer v-if="product && !loading" app class="hidden-md-and-up pa-3 border-t bg-surface" elevation="24">
        <div class="d-flex w-100 ga-3 align-center">
            <div class="flex-grow-1">
                <div class="text-caption opacity-60 font-weight-bold">Total ({{ quantity }} un)</div>
                <div class="text-h6 font-weight-bold text-primary">{{ formatCurrency(product.price * quantity) }}</div>
            </div>
            <v-btn color="primary" rounded="pill" size="large" class="px-8 text-none font-weight-black" elevation="0"
                @click="buyNow">
                Finalizar Pedido
            </v-btn>
        </div>
    </v-footer>
</template>

<style scoped>
.sticky-top {
    position: sticky;
    top: 100px;
    /* Ajuste conforme a altura da sua navbar */
    z-index: 5;
}

.pre-line {
    white-space: pre-line;
}

.leading-relaxed {
    line-height: 1.75 !important;
}

.spec-table tr:nth-child(even) {
    background-color: rgba(var(--v-theme-primary), 0.02);
}

.spec-table td {
    padding: 12px 16px !important;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.08) !important;
}

.qty-toggle :deep(.v-btn) {
    height: 54px !important;
}

.compact-panels :deep(.v-expansion-panel-title) {
    padding: 12px 0 !important;
    min-height: auto !important;
}

.compact-panels :deep(.v-expansion-panel-text__wrapper) {
    padding: 8px 0 16px 0 !important;
}

@media (max-width: 960px) {
    .sticky-top {
        position: static;
    }
}
</style>