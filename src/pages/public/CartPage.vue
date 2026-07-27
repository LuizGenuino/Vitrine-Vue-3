<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import EmptyState from '@/components/base/EmptyState.vue';
import { useCartStore } from '@/stores/cart';
import { useStorefrontStore } from '@/stores/storefront';
import { useWhatsApp } from '@/composables/useWhatsApp';
import { formatCurrency } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const cartStore = useCartStore();
const storefrontStore = useStorefrontStore();
const { buildCartLink } = useWhatsApp();

// --- ESTADO ---
const storeSlug = computed(() => String(route.params.storeSlug || ''));
const items = computed(() => cartStore.itemsByStore(storeSlug.value));
const total = computed(() => items.value.reduce((sum, item) => sum + item.price * item.quantity, 0));

// Informações Adicionais (Crucial para o Vendedor)
const checkoutData = reactive({
    name: '',
    cep: '',
    address: '',
    number: '',
    neighborhood: '',
    city: '',
    complement: '',
    paymentMethod: '',
});

const isCepLoading = ref(false);
const cepError = ref('');

// --- LOGICA ---
const isFormValid = computed(() => {
    return checkoutData.name.length > 2 && checkoutData.address.length > 5 && checkoutData.paymentMethod;
});

const handleCheckout = () => {
    // if (!isFormValid.value) return;

    // O buildCartLink agora deve receber esses dados extras para formatar a mensagem
    const link = buildCartLink(
        storefrontStore.settings.channels.whatsappNumber,
        items.value,
        checkoutData
    );

    window.open(link, '_blank');
};

const clearCartWithConfirm = () => {
    if (confirm('Deseja realmente esvaziar seu carrinho?')) {
        cartStore.clear();
    }
};

async function searchCep() {
    const cleanCep = checkoutData.cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) return;

    isCepLoading.value = true;
    cepError.value = '';

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();

        if (data.erro) {
            cepError.value = 'CEP não encontrado.';
            return;
        }

        // Preenchimento automático (Senior UX: Foco no próximo campo vazio)
        checkoutData.address = data.logradouro;
        checkoutData.neighborhood = data.bairro;
        checkoutData.city = `${data.localidade} - ${data.uf}`;

        // Foco automático no número após o preenchimento (Opcional via ref)
    } catch (error) {
        cepError.value = 'Erro ao buscar CEP. Tente preencher manualmente.';
    } finally {
        isCepLoading.value = false;
    }
}

// Watcher para disparar a busca automaticamente quando o CEP estiver completo
watch(() => checkoutData.cep, (newCep: string) => {
    if (newCep.replace(/\D/g, '').length === 8) {
        searchCep();
    }
});

</script>

<template>
    <v-container class="py-8 pt-md-12 pb-16">
        <div class="d-flex align-center justify-space-between mb-8">
            <div>
                <v-btn variant="text" prepend-icon="mdi-chevron-left" class="px-0 mb-2 opacity-70 text-none"
                    @click="router.back()">
                    Continuar comprando
                </v-btn>
                <h1 class="text-h3 font-weight-black">Seu Carrinho</h1>
            </div>
            <v-btn v-if="items.length" variant="tonal" color="error" prepend-icon="mdi-trash-can-outline" rounded="pill"
                @click="clearCartWithConfirm">
                Limpar
            </v-btn>
        </div>

        <v-row v-if="items.length" spacing="6">
            <v-col cols="12" lg="7">
                <v-card variant="flat" rounded="xl" border class="overflow-hidden">
                    <v-list class="pa-0" lines="two">
                        <template v-for="(item, index) in items" :key="item.productId">
                            <v-list-item class="pa-4 pa-md-6">
                                <div class="d-flex ga-4 align-center w-100">
                                    <v-avatar size="80" rounded="lg" border>
                                        <v-img :src="item.imageUrl || 'https://placehold.co/300'" cover />
                                    </v-avatar>

                                    <div class="flex-grow-1">
                                        <div class="text-subtitle-1 font-weight-bold leading-tight">{{ item.name }}
                                        </div>
                                        <div class="text-caption text-primary font-weight-bold mb-2">
                                            {{ formatCurrency(item.price) }} / un
                                        </div>

                                        <div class="d-flex align-center ga-4 mt-2">
                                            <v-btn-toggle rounded="pill" color="primary" variant="outlined"
                                                density="comfortable" mandatory>
                                                <v-btn icon="mdi-minus" size="x-small"
                                                    @click="cartStore.updateQuantity(item.productId, item.quantity - 1, item.storeSlug)" />
                                                <v-btn disabled class="px-4 font-weight-bold">{{ item.quantity
                                                }}</v-btn>
                                                <v-btn icon="mdi-plus" size="x-small"
                                                    @click="cartStore.updateQuantity(item.productId, item.quantity + 1, item.storeSlug)" />
                                            </v-btn-toggle>

                                            <div class="text-subtitle-1 font-weight-black ml-auto">
                                                {{ formatCurrency(item.price * item.quantity) }}
                                            </div>
                                        </div>
                                    </div>

                                    <v-btn icon="mdi-close-circle-outline" variant="text" color="medium-emphasis"
                                        class="hidden-sm-and-down"
                                        @click="cartStore.removeItem(item.productId, item.storeSlug)" />
                                </div>
                            </v-list-item>
                            <v-divider v-if="index < items.length - 1" inset></v-divider>
                        </template>
                    </v-list>
                </v-card>
            </v-col>

            <v-col cols="12" lg="5">
                <div class="sticky-top">
                    <v-card variant="flat" border rounded="xl" class="pa-6 mb-4 bg-grey-lighten-5">
                        <div class="d-flex align-center ga-2 mb-6">
                            <v-icon icon="mdi-truck-delivery-outline" color="primary"></v-icon>
                            <h2 class="text-h6 font-weight-bold">Informações de Entrega</h2>
                        </div>

                        <v-form>
                            <v-row dense>
                                <v-col cols="12">
                                    <v-text-field v-model="checkoutData.name" label="Seu Nome completo"
                                        variant="outlined" bg-color="surface" rounded="lg"
                                        placeholder="Como o entregador deve te chamar?"
                                        prepend-inner-icon="mdi-account-outline" />
                                </v-col>

                                <v-col cols="12" md="5">
                                    <v-text-field v-model="checkoutData.cep" label="CEP" variant="outlined"
                                        bg-color="surface" rounded="lg" placeholder="00000-000" :loading="isCepLoading"
                                        :error-messages="cepError" prepend-inner-icon="mdi-map-marker-outline"
                                        v-maska="'#####-###'" />
                                </v-col>

                                <v-col cols="12" md="7">
                                    <v-text-field v-model="checkoutData.city" label="Cidade" variant="outlined"
                                        bg-color="grey-lighten-4" rounded="lg" readonly
                                        hint="Preenchido automaticamente pelo CEP" />
                                </v-col>

                                <v-col cols="12" md="8">
                                    <v-text-field v-model="checkoutData.address" label="Endereço (Rua/Avenida)"
                                        variant="outlined" bg-color="surface" rounded="lg" />
                                </v-col>

                                <v-col cols="12" md="4">
                                    <v-text-field v-model="checkoutData.number" label="Nº" variant="outlined"
                                        bg-color="surface" rounded="lg" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="checkoutData.neighborhood" label="Bairro" variant="outlined"
                                        bg-color="surface" rounded="lg" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="checkoutData.complement" label="Complemento"
                                        variant="outlined" bg-color="surface" rounded="lg"
                                        placeholder="Apto, Bloco, Referência..." />
                                </v-col>

                                <v-col cols="12" class="mt-2">
                                    <v-select v-model="checkoutData.paymentMethod" label="Forma de Pagamento"
                                        :items="['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro (na entrega)']"
                                        variant="outlined" bg-color="surface" rounded="lg"
                                        prepend-inner-icon="mdi-credit-card-outline" />
                                </v-col>
                            </v-row>
                        </v-form>
                    </v-card>
                    <v-card variant="flat" border rounded="xl" class="pa-6">
                        <h2 class="text-h6 font-weight-bold mb-4">Resumo do Pedido</h2>
                        <div class="d-flex justify-space-between text-body-1 mb-2">
                            <span class="opacity-70">Subtotal ({{ items.length }} itens)</span>
                            <span>{{ formatCurrency(total) }}</span>
                        </div>
                        <div class="d-flex justify-space-between text-body-1 mb-4">
                            <span class="opacity-70">Entrega</span>
                            <span class="text-success font-weight-bold">A combinar</span>
                        </div>
                        <v-divider class="mb-4"></v-divider>
                        <div class="d-flex justify-space-between text-h5 font-weight-black mb-8">
                            <span>Total</span>
                            <span class="text-primary">{{ formatCurrency(total) }}</span>
                        </div>

                        <v-btn color="primary" size="large" block rounded="pill" elevation="8"
                            class="text-none font-weight-bold text-title-medium!" prepend-icon="mdi-whatsapp" @click="handleCheckout">
                            Enviar Pedido via WhatsApp
                        </v-btn>
                        <!-- <p v-if="!isFormValid" class="text-caption text-center mt-3 text-error">
                            Preencha seus dados para habilitar o botão
                        </p> -->
                    </v-card>
                </div>
            </v-col>
        </v-row>

        <EmptyState v-else title="Seu carrinho está vazio"
            description="Parece que você ainda não escolheu seus produtos favoritos.">
            <v-btn color="primary" rounded="pill" class="mt-4" @click="router.push({ name: 'storefront' })">
                Voltar para a loja
            </v-btn>
        </EmptyState>
    </v-container>
</template>

<style scoped>
.sticky-top {
    position: sticky;
    top: 100px;
}

.leading-tight {
    line-height: 1.2 !important;
}

:deep(.v-btn-group--divided .v-btn) {
    border-color: rgba(var(--v-theme-primary), 0.2) !important;
}
</style>