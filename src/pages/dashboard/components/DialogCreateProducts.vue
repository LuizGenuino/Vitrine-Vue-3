<script lang="ts" setup>
import ImageUploadDropzone from '@/components/base/ImageUploadDropzone.vue';
import type { Category, Product, Subcategory } from '@/types';
import { computed } from 'vue';
import CharacteristicsInput from './CharacteristicsInput.vue';

type PropsType = {
    subcategories: Subcategory[],
    categories: Category[],
    canSave: boolean,
    isEditing: boolean,
    isLimitReached: boolean,
    loading: boolean,
    uploading:
    boolean,
    canCreateProduct: boolean,
}

const dialog = defineModel<boolean>('dialog', { required: true })
const form = defineModel<Product>('form', { required: true })
const pendingFiles = defineModel<File[]>('pendingFiles', { required: true })

const { categories, subcategories, canSave, isEditing, isLimitReached, loading, uploading, canCreateProduct } = defineProps<PropsType>()

const emit = defineEmits(['saveProduct', 'close'])

const filteredSubcategories = computed(() => subcategories.filter((item) => item.categoryId === form.value.categoryId));

async function handleSelectFiles(files: File[]) {
    const MAX_FILES = 4;

    const currentTotal = form.value.imageUrls.length;
    const availableSlots = MAX_FILES - currentTotal;

    if (availableSlots <= 0) return;

    const filesToAdd = files.slice(0, availableSlots);

    pendingFiles.value = [...pendingFiles.value, ...filesToAdd];

    const newTemporaryUrls = filesToAdd.map((file) => URL.createObjectURL(file));

    form.value.imageUrls = [...form.value.imageUrls, ...newTemporaryUrls];
}

function removeImage(index: number) {
    const urlToRemove = form.value.imageUrls[index];

    if (urlToRemove.startsWith('blob:')) {
        const blobIndex = form.value.imageUrls
            .filter(url => url.startsWith('blob:'))
            .indexOf(urlToRemove);

        if (blobIndex !== -1) {
            pendingFiles.value.splice(blobIndex, 1);
        }

        URL.revokeObjectURL(urlToRemove);
    }

    form.value.imageUrls.splice(index, 1);
}

</script>

<template>
    <v-dialog v-model="dialog" max-width="800">
        <v-card prepend-icon="mdi-package" :title="form.id ? 'Editar produto' : 'Novo produto'"
            subtitle="Agora com validações mais claras, métricas e consciência do plano atual.">
            <v-card-text>
                <v-row density="comfortable">
                    <v-col cols="12">
                        <image-upload-dropzone :model-value="form.imageUrls" :max="4" @select-files="handleSelectFiles"
                            @remove="removeImage" />
                    </v-col>
                    <v-col cols="12">
                        <v-text-field v-model="form.name" label="Nome do produto*" />
                    </v-col>
                    <v-col cols="12" sm="6">
                        <v-text-field v-model="form.price" label="Preço*" type="number" />
                    </v-col>
                    <v-col cols="12" sm="6">
                        <v-text-field v-model="form.quantity" label="Quantidade*" type="number" />
                    </v-col>
                    <v-col cols="12">
                        <v-textarea v-model="form.description" label="Descrição*" rows="3" />
                    </v-col>
                    <v-col cols="12">
                        <v-textarea v-model="form.details" label="Detalhes" hint="Detalhes do produto" persistent-hint
                            rows="4" />
                    </v-col>
                    <v-col cols="12">
                        <characteristics-input v-model="form.characteristics" label="Caracteristicas do Produto" />
                    </v-col>
                    <v-col cols="12" md="4" sm="6">
                        <v-select v-model="form.categoryId" :items="categories" item-title="name" item-value="id"
                            label="Categoria" />
                    </v-col>
                    <v-col cols="12" md="4" sm="6">
                        <v-select v-model="form.subcategoryId" :items="filteredSubcategories" item-title="name"
                            item-value="id" label="Subcategoria" />
                    </v-col>
                    <v-col cols="12" md="4" sm="6">
                        <v-select v-model="form.status" :items="['active', 'draft']" label="Status" />
                    </v-col>
                    <v-col cols="12">
                        <v-alert v-if="!canSave" type="info" variant="tonal">
                            Preencha nome, descrição, preço e ao menos uma imagem para salvar.
                        </v-alert>
                        <v-alert v-if="!isEditing && isLimitReached" type="warning" variant="tonal">
                            Novos produtos estão bloqueados pelo limite do plano atual.
                        </v-alert>

                    </v-col>
                </v-row>
            </v-card-text>

            <v-divider></v-divider>

            <v-card-actions>
                <v-spacer></v-spacer>

                <v-btn color="primary" :loading="loading || uploading"
                    :disabled="!canSave || (!isEditing && !canCreateProduct)" @click="emit('saveProduct')">Salvar
                    produto</v-btn>

                <v-btn variant="text" @click="emit('close')">Cancelar</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>
