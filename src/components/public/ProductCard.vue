<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Product } from '@/types';
import { formatCurrency } from '@/utils/format';
import { useCartStore } from '@/stores/cart';
import { useUiStore } from '@/stores/ui';

interface Props {
    product: Product;
    storeSlug: string;
}

const props = defineProps<Props>();
const router = useRouter();
const cartStore = useCartStore();
const uiStore = useUiStore();

const snackbar = ref(false)
const text = ref<string[]>(['', ''])
const timeout = ref(5000)

// Lógica de Negócio: Estados do Produto
const isLowStock = computed(() => props.product.quantity > 0 && props.product.quantity <= 5);
const isOutOfStock = computed(() => props.product.quantity <= 0);

// Navegação Programática (Melhor para SEO e Acessibilidade)
const goToProduct = () => {
    router.push({
        name: 'product',
        params: { storeSlug: props.storeSlug, productSlug: props.product.slug }
    });
};

function addToCart() {
    if (!props.product) return;
    cartStore.addItem({
        productId: props.product.id || props.product.slug,
        storeSlug: props.storeSlug,
        name: props.product.name,
        price: props.product.price,
        quantity: 1,
        imageUrl: props.product.imageUrls[0],
    });
    snackbar.value = true
    text.value = ['Produto Adicionado ao Carrinho!', 'success']
}

</script>

<template>
    <v-hover v-slot="{ isHovering, props: hoverProps }">
        <v-card v-bind="hoverProps" :elevation="isHovering ? 8 : 1"
            class="product-card h-100 d-flex flex-column overflow-hidden transition-swing" rounded="xl" border
            @click="goToProduct">
            <div class="relative overflow-hidden">
                <v-img :src="product.imageUrls[0] || 'https://placehold.co/600x600?text=Sem+Foto'" :aspect-ratio="1"
                    cover class="bg-grey-lighten-4 transition-all duration-500" :class="{ 'scale-110': isHovering }">
                    <div class="pa-2 d-flex flex-column ga-1 align-start">
                        <v-chip v-if="isOutOfStock" color="error" size="x-small" variant="flat"
                            class="font-weight-black text-uppercase">
                            Esgotado
                        </v-chip>
                        <v-chip v-else-if="isLowStock" color="warning" size="x-small" variant="flat"
                            class="font-weight-black text-uppercase">
                            Últimas unidades
                        </v-chip>
                    </div>

                    <v-fade-transition>
                        <div v-if="isHovering && !isOutOfStock"
                            class="d-none d-md-flex align-center justify-center fill-height bg-black-overlay">
                            <v-btn color="white" icon="mdi-eye-outline" variant="flat" class="elevation-4"></v-btn>
                        </div>
                    </v-fade-transition>
                </v-img>
            </div>

            <v-card-text class="pa-4 flex-grow-1 d-flex flex-column">

                <h3 class="text-subtitle-1 font-weight-black text-high-emphasis leading-tight mb-2">
                    {{ product.name }}
                </h3>

                <p class="text-caption text-medium-emphasis mb-4 line-clamp-2">
                    {{ product.description }}
                </p>

                <v-spacer></v-spacer>

                <div class="d-flex align-end justify-space-between mt-auto">
                    <div>
                        <div class="text-caption text-disabled text-decoration-line-through mb-n1" v-if="false">
                            {{ formatCurrency(product.price * 1.2) }}
                        </div>
                        <div class="text-h6 font-weight-bold text-primary">
                            {{ formatCurrency(product.price) }}
                        </div>
                    </div>

                    <v-btn icon="mdi-shopping-outline" color="primary" variant="tonal" size="small" rounded="lg"
                        :disabled="isOutOfStock" @click.stop="addToCart"></v-btn>
                </div>
            </v-card-text>
        </v-card>
    </v-hover>
    <v-snackbar location="top end" :color="text[1]" v-model="snackbar" :timeout="timeout">
        {{ text[0] }}

        <template v-slot:actions>
            <v-btn color="" variant="text" @click="snackbar = false">
                x
            </v-btn>
        </template>
    </v-snackbar>
</template>

<style scoped>
.product-card {
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

/* Efeito de Zoom na Imagem */
.scale-110 {
    transform: scale(1.1);
}

.bg-black-overlay {
    background: rgba(0, 0, 0, 0.2);
}

/* Line Clamp para limitar linhas sem quebrar palavras */
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.leading-tight {
    line-height: 1.25 !important;
}

.leading-none {
    line-height: 1 !important;
}

.relative {
    position: relative;
}

.transition-all {
    transition: all 0.5s ease-in-out;
}
</style>