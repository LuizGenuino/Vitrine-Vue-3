<script setup lang="ts">
import type { StoreSettingsForm } from '@/types';
import { formatCurrency } from '@/utils/format';
import { computed } from 'vue';

const props = defineProps<{
    settings: StoreSettingsForm;
}>();

// Dados fictícios para o preview parecer "vivo"
const sampleProducts = [
    { name: 'Produto Exemplo A', price: 89.90, cat: 'Lançamentos' },
    { name: 'Produto Exemplo B', price: 129.00, cat: 'Mais Vendidos' },
    { name: 'Produto Exemplo C', price: 45.00, cat: 'Ofertas' },
];

// Estilo dinâmico para o gradiente de sobreposição do banner
const heroOverlayStyle = computed(() => {
    const color1 = props.settings.primaryColor || '#4F46E5';
    const color2 = props.settings.secondaryColor || '#14B8A6';
    return {
        background: `linear-gradient(to top, rgba(0,0,0,0.8) 0%, ${color1}AA 60%, ${color2}88 100%)`
    };
});
</script>

<template>
    <v-card class="preview-container bg-grey-lighten-4 pa-4 pa-md-6" rounded="xl" border flat>
        <div class="text-overline text-medium-emphasis mb-4 d-flex align-center">
            <v-icon icon="mdi-cellphone" size="small" class="mr-2" />
            Visualização Mobile (Simulação)
        </div>

        <div class="browser-frame border shadow-xl mx-auto overflow-hidden bg-white">
            <div class="browser-header px-4 d-flex align-center justify-space-between bg-white border-b">
                <div class="text-caption font-weight-bold">9:41</div>
                <div class="d-flex ga-1">
                    <v-icon icon="mdi-signal" size="x-small" />
                    <v-icon icon="mdi-wifi" size="x-small" />
                    <v-icon icon="mdi-battery" size="x-small" />
                </div>
            </div>

            <div class="store-scroll-area">

                <div class="px-4 py-3 d-flex align-center justify-space-between bg-white shadow-sm sticky-top">
                    <div class="d-flex align-center ga-2">
                        <v-avatar :color="props.settings.primaryColor" size="28">
                            <v-img v-if="props.settings.logoUrl" :src="props.settings.logoUrl" />
                            <span v-else class="text-white text-caption font-weight-bold">
                                {{ props.settings.storeName?.charAt(0) || 'S' }}
                            </span>
                        </v-avatar>
                        <span class="text-caption font-weight-black">{{ props.settings.storeName || 'Sua Loja' }}</span>
                    </div>
                    <v-btn icon="mdi-shopping-outline" variant="tonal" :color="props.settings.primaryColor"
                        size="x-small" />
                </div>

                <div class="position-relative overflow-hidden">
                    <v-img
                        :src="props.settings.bannerUrl || 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000'"
                        height="180" cover />
                    <div class="hero-overlay position-absolute fill-height w-100 pa-4 d-flex align-end"
                        :style="heroOverlayStyle">
                        <div class="text-white">
                            <div class="text-h6 font-weight-black leading-tight">{{ props.settings.title
                                || 'Seja bem-vindo!' }}</div>
                            <v-chip size="x-small" color="success" variant="flat" class="mt-1">
                                <v-icon start icon="mdi-whatsapp" size="10" />
                                WhatsApp On-line
                            </v-chip>
                        </div>
                    </div>
                </div>

                <div class="pa-4">
                    <p class="text-caption text-medium-emphasis mb-4">{{ props.settings.subtitle
                        || 'Confira nosso catálogo completo.' }}</p>

                    <div class="d-flex ga-2 overflow-hidden mb-5">
                        <v-chip size="x-small" :color="props.settings.primaryColor" variant="flat">Tudo</v-chip>
                        <v-chip size="x-small" variant="outlined">Novidades</v-chip>
                        <v-chip size="x-small" variant="outlined">Promoções</v-chip>
                    </div>

                    <v-row dense>
                        <v-col v-for="item in sampleProducts" :key="item.name" cols="6">
                            <v-card rounded="lg" border flat class="pa-2 h-100">
                                <div class="rounded bg-grey-lighten-3 mb-2 d-flex align-center justify-center"
                                    style="aspect-ratio: 1/1">
                                    <v-icon icon="mdi-image-outline" color="grey-lighten-1" />
                                </div>
                                <div class="text-caption font-weight-bold leading-tight">{{ item.name }}</div>
                                <div class="text-overline text-disabled leading-none mb-2"
                                    style="font-size: 8px !important;">{{ item.cat }}</div>
                                <div class="text-subtitle-2 font-weight-black"
                                    :style="{ color: props.settings.primaryColor }">
                                    {{ formatCurrency(item.price) }}
                                </div>
                                <v-btn block size="x-small" color="primary" variant="flat" class="mt-2 text-none"
                                    rounded="pill">
                                    Ver detalhes
                                </v-btn>
                            </v-card>
                        </v-col>
                    </v-row>
                </div>

            </div>
        </div>
    </v-card>
</template>

<style scoped>
.preview-container {
    min-height: 600px;
}

.browser-frame {
    width: 320px;
    height: 580px;
    border-radius: 40px;
    border: 8px solid #1a1a1a !important;
    position: relative;
}

.browser-header {
    height: 34px;
    z-index: 20;
}

.store-scroll-area {
    height: calc(580px - 34px);
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.store-scroll-area::-webkit-scrollbar {
    display: none;
}

.sticky-top {
    position: sticky;
    top: 0;
    z-index: 10;
}

.hero-overlay {
    top: 0;
    left: 0;
    transition: background 0.5s ease;
}

.leading-tight {
    line-height: 1.2 !important;
}

.leading-none {
    line-height: 1 !important;
}

.shadow-xl {
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
}
</style>