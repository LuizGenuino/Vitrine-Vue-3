<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import { categoryService } from '@/services/categoryService';
import { slugify } from '@/utils/format';
import AppSectionCard from '@/components/base/AppSectionCard.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import type { Category, Subcategory } from '@/types';
import { toast } from '@/utils/swal/toast';

const authStore = useAuthStore();
const loading = ref(false);
const btnLoading = ref<string | null>(null); // Loading individual para botões
const categories = ref<Category[]>([]);
const subcategories = ref<Subcategory[]>([]);

const categoryForm = reactive({ name: '' });
const subcategoryForms = reactive<Record<string, string>>({}); // Formulários por categoria

const groupedData = computed(() =>
    categories.value.map((category) => ({
        ...category,
        subcategories: subcategories.value.filter((item) => item.categoryId === category.id),
    })),
);

async function loadData() {
    if (!authStore.user?.uid) return;
    loading.value = true;
    try {
        const [cats, subs] = await Promise.all([
            categoryService.listCategories(authStore.user.uid),
            categoryService.listSubcategories(authStore.user.uid)
        ]);
        categories.value = cats;
        subcategories.value = subs;
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast('Erro ao carregar categorias e subcategorias.', 'error');
    } finally {
        loading.value = false;
    }
}

async function handleAction(id: string, action: () => Promise<void>) {
    btnLoading.value = id;
    try {
        await action();
        await loadData();
    }
    catch (error) {
        console.error('Erro ao executar ação:', error);
        throw error; // Re-throw para que o chamador possa lidar com o erro
    } finally { btnLoading.value = null; }
}

async function createCategory() {
    if (!authStore.user?.uid || !categoryForm.name) return;
    await handleAction('create-cat', async () => {
        await categoryService.saveCategory({
            ownerId: authStore.user!.uid,
            name: categoryForm.name,
            slug: slugify(categoryForm.name),
            order: categories.value.length + 1,
        });
        categoryForm.name = '';
        toast('Categoria criada com sucesso.', 'success');
    }).catch((err) => {
        toast('Erro ao criar categoria.', 'error');
    });
}

async function quickCreateSub(categoryId: string) {
    const name = subcategoryForms[categoryId];
    if (!authStore.user?.uid || !name) return;

    await handleAction(`sub-new-${categoryId}`, async () => {
        await categoryService.saveSubcategory({
            ownerId: authStore.user!.uid,
            name: name,
            slug: slugify(name),
            categoryId: categoryId,
            order: 99,
        });
        subcategoryForms[categoryId] = '';
        toast('Subcategoria criada com sucesso.', 'success');
    }).catch((err) => {
        toast('Erro ao criar subcategoria.', 'error');
    });
}

async function removeCategory(id?: string) {
    if (!id || !confirm('Excluir esta categoria removerá o vínculo com os produtos. Confirmar?')) return;
    await handleAction(`del-${id}`, async () => {
        await categoryService.removeCategory(id);
        toast('Categoria removida com sucesso.', 'info');
    }).catch((err) => {
        toast('Erro ao remover categoria.', 'error');
    });
}

async function removeSub(id?: string) {
    if (!id) return;
    await handleAction(`del-sub-${id}`, async () => {
        await categoryService.removeSubcategory(id);
        toast('Subcategoria removida com sucesso.', 'info');
    }).catch((err) => {
        toast('Erro ao remover subcategoria.', 'error');
    });
}

onMounted(loadData);
</script>

<template>
    <div class="d-flex flex-column ga-6">
        <v-card rounded="xl" border flat class="pa-6 bg-surface">
            <v-row align="center">
                <v-col cols="12" md="7">
                    <h2 class="text-h5 font-weight-black mb-1">Organize seu Catálogo</h2>
                    <p class="text-body-2 text-medium-emphasis">
                        Crie grupos e subgrupos para ajudar seu cliente a encontrar produtos em segundos.
                    </p>
                </v-col>
                <v-col cols="12" md="5">
                    <v-text-field v-model="categoryForm.name" label="Nome da nova categoria"
                        placeholder="Ex: Camisetas, Hambúrgueres..." hide-details rounded="pill" variant="outlined"
                        @keyup.enter="createCategory">
                        <template #append-inner>
                            <v-btn color="primary" variant="flat" rounded="pill" size="small" class="text-none"
                                :loading="btnLoading === 'create-cat'" @click="createCategory">
                                Adicionar
                            </v-btn>
                        </template>
                    </v-text-field>
                </v-col>
            </v-row>
        </v-card>

        <div v-if="loading && !categories.length" class="d-flex justify-center py-10">
            <v-progress-circular indeterminate color="primary" />
        </div>

        <div v-else-if="groupedData.length" class="d-flex flex-column ga-4">
            <v-card v-for="category in groupedData" :key="category.id" rounded="xl" border flat class="overflow-hidden">
                <div class="pa-4 bg-grey-lighten-4 d-flex align-center justify-space-between">
                    <div class="d-flex align-center ga-3 flex-grow-1">
                        <v-icon icon="mdi-drag-variant" color="medium-emphasis" class="cursor-move" />
                        <v-text-field v-model="category.name" variant="plain" hide-details
                            class="text-h6 font-weight-bold p-0 m-0 custom-input"
                            @blur="categoryService.saveCategory(category)" />
                    </div>
                    <div class="d-flex align-center ga-2">
                        <v-btn icon="mdi-trash-can-outline" variant="text" color="error" size="small"
                            :loading="btnLoading === `del-${category.id}`" @click="removeCategory(category.id)" />
                    </div>
                </div>

                <div class="pa-6 pt-2">
                    <div class="text-overline text-medium-emphasis mb-4">Subcategorias</div>

                    <div class="d-flex flex-wrap ga-2 mb-4">
                        <v-chip v-for="sub in category.subcategories" :key="sub.id" closable variant="tonal"
                            color="primary" class="font-weight-medium" @click:close="removeSub(sub.id)">
                            {{ sub.name }}
                        </v-chip>

                        <v-text-field v-model="subcategoryForms[category.id!]" placeholder="Adicionar sub..."
                            variant="underlined" density="compact" hide-details class="ml-2 quick-sub-input"
                            style="max-width: 150px" @keyup.enter="quickCreateSub(category.id!)">
                            <template #append-inner>
                                <v-icon icon="mdi-plus" size="small" class="cursor-pointer"
                                    @click="quickCreateSub(category.id!)" />
                            </template>
                        </v-text-field>
                    </div>

                    <div v-if="!category.subcategories.length" class="text-caption text-disabled italic">
                        Nenhuma subcategoria para {{ category.name }}.
                    </div>
                </div>
            </v-card>
        </div>

        <EmptyState v-else title="Seu catálogo está vazio"
            description="Comece criando categorias como 'Promoções' ou 'Novidades' para organizar seus produtos." />
    </div>
</template>

<style scoped>
.custom-input :deep(input) {
    padding: 0 !important;
    min-height: auto !important;
}

.quick-sub-input :deep(input) {
    font-size: 0.875rem !important;
}

.cursor-move {
    cursor: grab;
}

.cursor-move:active {
    cursor: grabbing;
}

/* Transição suave para os cards */
.v-card {
    transition: all 0.2s ease;
}

.v-card:hover {
    border-color: rgba(var(--v-theme-primary), 0.5) !important;
}
</style>