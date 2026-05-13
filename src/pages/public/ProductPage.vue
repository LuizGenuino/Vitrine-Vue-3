<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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

const characteristics = computed(() => product.value?.characteristics.map((item: string) => {
    const array = item.split(':')
    console.log(array);
    return { key: array[0], value: array[1] }
}))

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
    // Integra a quantidade no link do WhatsApp se seu composable permitir
    window.open(buildProductLink(storefrontStore.settings.channels.whatsappNumber, product.value), '_blank');
}


onMounted(loadProduct);
</script>

<template>
    <v-container class="pb-16 pt-4">
        <v-btn variant="text" prepend-icon="mdi-arrow-left" class="mb-6 text-none opacity-70" @click="router.back()">
            Voltar para a vitrine
        </v-btn>

        <v-row v-if="loading">
            <v-col cols="12" md="6">
                <v-skeleton-loader type="image, image" height="500" class="rounded-xl" />
            </v-col>
            <v-col cols="12" md="6">
                <v-skeleton-loader type="article, actions" class="rounded-xl" />
            </v-col>
        </v-row>

        <v-row v-else-if="product" class="px-4" justify="center">
            <v-col cols="12" md="6" lg="7">
                <v-card variant="flat" rounded="xl" class="overflow-hidden border">
                    <v-img :src="activeImage || 'https://placehold.co/800x800?text=Sem+Imagem'" height="500" cover
                        class="bg-grey-lighten-4 transition-swing">
                        <template v-slot:placeholder>
                            <div class="d-flex align-center justify-center fill-height">
                                <v-progress-circular indeterminate color="primary" />
                            </div>
                        </template>
                    </v-img>
                </v-card>

                <v-slide-group v-if="product.imageUrls.length > 1" class="mt-4" show-arrows>
                    <v-slide-group-item v-for="image in product.imageUrls" :key="image">
                        <v-card
                            :class="['ma-2 rounded-lg border-2', activeImage === image ? 'border-primary' : 'border-transparent']"
                            width="80" height="80" @click="activeImage = image">
                            <v-img :src="image" cover height="100%" />
                        </v-card>
                    </v-slide-group-item>
                </v-slide-group>
            </v-col>

            <v-col cols="12" md="6" lg="4">
                <v-chip size="small" variant="tonal" color="primary" class="mb-2 font-weight-bold">
                    {{ categoryName }}
                </v-chip>

                <h1 class="text-h4 font-weight-black mb-2">{{ product.name }}</h1>

                <div class="d-flex align-baseline ga-2 mb-6">
                    <span class="text-h4 font-weight-bold text-primary">
                        {{ formatCurrency(product.price) }}
                    </span>
                    <span class="text-caption text-medium-emphasis">à vista no Pix/Dinheiro</span>
                </div>

                <div class="d-flex align-center ga-4 mb-8">
                    <div class="text-subtitle-2 font-weight-bold">Quantidade:</div>
                    <v-btn-toggle v-model="quantity" mandatory rounded="pill" color="primary" variant="outlined"
                        divided>
                        <v-btn :value="quantity - 1" icon="mdi-minus" size="small"
                            @click="quantity > 1 ? quantity-- : null" />
                        <v-btn disabled class="px-6 text-body-1 font-weight-bold">{{ quantity }}</v-btn>
                        <v-btn :value="quantity + 1" icon="mdi-plus" size="small" @click="quantity++" />
                    </v-btn-toggle>
                </div>

                <div class="d-flex flex-column ga-3">
                    <v-btn block size="x-large" color="primary" rounded="pill" elevation="8"
                        class="text-none font-weight-bold" prepend-icon="mdi-whatsapp" @click="buyNow">
                        Pedir agora pelo WhatsApp
                    </v-btn>

                    <v-btn block size="x-large" variant="outlined" color="primary" rounded="pill"
                        class="text-none font-weight-bold" prepend-icon="mdi-cart-plus" @click="addToCart">
                        Adicionar ao Carrinho
                    </v-btn>
                </div>
            </v-col>
            <div class="ma-auto" style="width: 1000px;">
                <v-col cols="12">
                    <p class="text-h4 mb-4">Descrição</p>
                    <p class="text-body-1 text-medium-emphasis mb-8 leading-relaxed">
                        {{ product.description }}
                    </p>
                </v-col>
                <v-col cols="12">
                    <p class="text-h4 mb-4">Caracteristicas</p>
                    <v-table striped="even">
                        <tbody>
                            <tr v-for="item in characteristics" :key="item.key">
                                <td>{{ item.key }}</td>
                                <td>{{ item.value }}</td>
                            </tr>
                        </tbody>
                    </v-table>

                </v-col>
                <v-col cols="12">
                    <v-divider class="my-10" />


                    <v-expansion-panels variant="accordion" class="border rounded-xl overflow-hidden" multiple
                        v-model="panel">
                        <v-expansion-panel v-if="product.details" title="Detalhes" :text="product.details"
                            elevation="0" />
                        <v-expansion-panel title="Entrega e Pagamento" elevation="0">
                            <template v-slot:text>
                                <p class="text-caption">
                                    Este estabelecimento realiza entregas locais. O pagamento é combinado diretamente
                                    via
                                    WhatsApp.
                                    Aceitamos Pix, Cartão e Dinheiro na entrega.
                                </p>
                            </template>
                        </v-expansion-panel>
                    </v-expansion-panels>
                </v-col>
            </div>
        </v-row>
    </v-container>

    <v-footer v-if="product && !loading" app class="hidden-md-and-up pa-3 border-t bg-surface" elevation="10">
        <div class="d-flex w-100 ga-2 align-center">
            <div class="flex-grow-1">
                <div class="text-caption opacity-70">Total</div>
                <div class="text-h6 font-weight-bold">{{ formatCurrency(product.price * quantity) }}</div>
            </div>
            <v-btn color="primary" rounded="pill" size="large" class="px-8 text-none font-weight-bold" @click="buyNow">
                Pedir via Zap
            </v-btn>
        </div>
    </v-footer>
</template>

<style scoped>
.transition-swing {
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.5, 1);
}

.leading-relaxed {
    line-height: 1.65 !important;
}

/* Efeito de borda no botão de quantidade */
:deep(.v-btn-group--divided .v-btn) {
    border-color: rgba(var(--v-theme-primary), 0.2) !important;
}

/* Esconde scrollbar da galeria */
:deep(.v-slide-group__content) {
    padding-bottom: 4px;
}
</style>