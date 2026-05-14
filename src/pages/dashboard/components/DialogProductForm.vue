<script lang="ts" setup>
import { ref, computed, reactive, watch } from 'vue';
import ImageUploadDropzone from '@/components/base/ImageUploadDropzone.vue';
import CharacteristicsInput from './CharacteristicsInput.vue';
import type { Category, Product, Subcategory } from '@/types';

// Tipagem simplificada: O componente recebe o que é essencial para renderizar
interface Props {
    categories: Category[];
    subcategories: Subcategory[];
    loading: boolean;
    canCreateProduct: boolean;
    isLimitReached: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits(['save', 'close']);

// Models
const isVisible = defineModel<boolean>({ required: true });
const product = defineModel<Product>('product', { required: true });
const pendingFiles = defineModel<File[]>('pendingFiles', { default: () => [] });

// Estado Interno
const activeTab = ref(0);
const formRef = ref<any>(null); // Referência para validação do Vuetify

// Regras de Validação (UX Senior)
const rules = {
    required: (v: any) => !!v || 'Campo obrigatório',
    minPrice: (v: number) => v > 0 || 'O preço deve ser maior que zero',
    maxImages: (v: any[]) => v.length > 0 || 'Adicione pelo menos uma imagem'
};

// Lógica de Categorias
const filteredSubcategories = computed(() =>
    props.subcategories.filter((item) => item.categoryId === product.value.categoryId)
);

// Resetar subcategoria se a categoria pai mudar
watch(() => product.value.categoryId, () => {
    product.value.subcategoryId = '';
});

// Handlers de Imagem
const handleSelectFiles = (files: File[]) => {
    const MAX_FILES = 4;
    const availableSlots = MAX_FILES - product.value.imageUrls.length;
    if (availableSlots <= 0) return;

    const filesToAdd = files.slice(0, availableSlots);
    pendingFiles.value = [...pendingFiles.value, ...filesToAdd];

    const newTemporaryUrls = filesToAdd.map((file) => URL.createObjectURL(file));
    product.value.imageUrls = [...product.value.imageUrls, ...newTemporaryUrls];
};

const removeImage = (index: number) => {
    const urlToRemove = product.value.imageUrls[index];
    if (urlToRemove.startsWith('blob:')) {
        const blobIndex = product.value.imageUrls
            .filter(url => url.startsWith('blob:'))
            .indexOf(urlToRemove);
        if (blobIndex !== -1) pendingFiles.value.splice(blobIndex, 1);
        URL.revokeObjectURL(urlToRemove);
    }
    product.value.imageUrls.splice(index, 1);
};

// Função de Disparo
async function submit() {
    const { valid } = await formRef.value.validate();
    if (valid) {
        emit('save');
    } else {
        activeTab.value = 0; // Volta para a primeira aba se houver erro
    }
}
</script>

<template>
    <v-dialog v-model="isVisible" max-width="900" persistent scrollable>
        <v-card rounded="xl" class="overflow-hidden">
            <v-toolbar color="surface" border="b">
                <v-btn icon="mdi-close" variant="text" @click="emit('close')"></v-btn>
                <v-toolbar-title class="font-weight-black">
                    {{ product.id ? 'Editar Produto' : 'Cadastrar Novo Produto' }}
                </v-toolbar-title>
                <v-spacer></v-spacer>
                <v-chip v-if="product.id" label size="small" class="mr-4">
                    ID: {{ product.code }}
                </v-chip>
            </v-toolbar>

            <v-tabs v-model="activeTab" color="primary" align-tabs="title">
                <v-tab :value="0" class="text-none">1. Informações Básicas</v-tab>
                <v-tab :value="1" class="text-none">2. Mídia (Fotos)</v-tab>
                <v-tab :value="2" class="text-none">3. Detalhes & Ficha Técnica</v-tab>
            </v-tabs>

            <v-card-text class="pa-6" style="height: 600px;">
                <v-form ref="formRef" lazy-validation>
                    <v-window v-model="activeTab">

                        <v-window-item :value="0">
                            <v-row class="pt-2">
                                <v-col cols="12">
                                    <v-text-field v-model="product.name" label="Nome comercial do produto"
                                        placeholder="Ex: Camiseta Oversized Algodão" :rules="[rules.required]"
                                        variant="outlined" />
                                </v-col>
                                <v-col cols="12" md="6">
                                    <v-text-field v-model="product.price" label="Preço de venda" prefix="R$"
                                        type="number" :rules="[rules.required, rules.minPrice]" variant="outlined" />
                                </v-col>
                                <v-col cols="12" md="6">
                                    <v-text-field v-model="product.quantity" label="Estoque disponível" type="number"
                                        variant="outlined" append-inner-icon="mdi-package-variant" />
                                </v-col>
                                <v-col cols="12" md="6">
                                    <v-select v-model="product.categoryId" :items="categories" item-title="name"
                                        item-value="id" label="Categoria Pai" variant="outlined"
                                        :rules="[rules.required]" />
                                </v-col>
                                <v-col cols="12" md="6">
                                    <v-select v-model="product.subcategoryId" :items="filteredSubcategories"
                                        item-title="name" item-value="id" label="Subcategoria" variant="outlined"
                                        :disabled="!product.categoryId" />
                                </v-col>
                                <v-col cols="12">
                                    <v-textarea v-model="product.description" label="Descrição curta (Venda)"
                                        placeholder="Descreva os benefícios do produto..." rows="3" variant="outlined"
                                        counter="255" :rules="[rules.required]" />
                                </v-col>
                            </v-row>
                        </v-window-item>

                        <v-window-item :value="1">
                            <div class="mb-4">
                                <h3 class="text-subtitle-1 font-weight-bold">Fotos do Produto</h3>
                                <p class="text-caption text-medium-emphasis">Adicione até 4 fotos. A primeira será a
                                    foto principal.</p>
                            </div>
                            <image-upload-dropzone :model-value="product.imageUrls" :max="4"
                                @select-files="handleSelectFiles" @remove="removeImage" />
                            <v-input :rules="[rules.maxImages]" :model-value="product.imageUrls" />
                        </v-window-item>

                        <v-window-item :value="2">
                            <v-row>
                                <v-col cols="12">
                                    <characteristics-input v-model="product.characteristics"
                                        label="Características (Chave: Valor)" placeholder="Ex: Material: Couro" />
                                </v-col>
                                <v-col cols="12">
                                    <v-textarea v-model="product.details" label="Ficha Técnica / Detalhes Adicionais"
                                        placeholder="Informações técnicas, cuidados, garantias..." rows="6"
                                        variant="outlined" />
                                </v-col>
                                <v-col cols="12">
                                    <v-select v-model="product.status"
                                        :items="[{ title: 'Ativo (Visível na loja)', value: 'active' }, { title: 'Rascunho (Oculto)', value: 'draft' }]"
                                        label="Status de Publicação" variant="outlined" />
                                </v-col>
                            </v-row>
                        </v-window-item>

                    </v-window>
                </v-form>
            </v-card-text>

            <v-divider></v-divider>

            <v-card-actions class="pa-4">
                <v-slide-x-transition>
                    <div v-if="!product.id && isLimitReached"
                        class="text-caption text-error font-weight-bold d-flex align-center ga-2">
                        <v-icon icon="mdi-alert-circle" size="small"></v-icon>
                        Limite do plano atingido
                    </div>
                </v-slide-x-transition>

                <v-spacer></v-spacer>

                <v-btn variant="text" class="text-none" @click="emit('close')">Cancelar</v-btn>
                <v-btn color="primary" variant="flat" rounded="pill" class="px-8 text-none" :loading="loading"
                    :disabled="(!product.id && isLimitReached)" @click="submit">
                    {{ product.id ? 'Salvar Alterações' : 'Publicar Produto' }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
.custom-input :deep(input) {
    font-size: 0.9rem;
}
</style>