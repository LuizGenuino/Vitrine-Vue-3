<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { categoryService } from '@/services/categoryService';
import { slugify } from '@/utils/format';
import AppSectionCard from '@/components/base/AppSectionCard.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import type { Category, Subcategory } from '@/types';

const authStore = useAuthStore();
const loading = ref(false);
const categories = ref<Category[]>([]);
const subcategories = ref<Subcategory[]>([]);

const categoryForm = reactive({ name: '' });
const subcategoryForm = reactive({ name: '', categoryId: '' });

const groupedSubcategories = computed(() =>
  categories.value.map((category) => ({
    ...category,
    subcategories: subcategories.value.filter((item) => item.categoryId === category.id),
  })),
);

async function loadData() {
  if (!authStore.user?.uid) return;
  loading.value = true;
  try {
    categories.value = await categoryService.listCategories(authStore.user.uid);
    subcategories.value = await categoryService.listSubcategories(authStore.user.uid);
  } finally {
    loading.value = false;
  }
}

async function createCategory() {
  if (!authStore.user?.uid || !categoryForm.name) return;
  await categoryService.saveCategory({
    ownerId: authStore.user.uid,
    name: categoryForm.name,
    slug: slugify(categoryForm.name),
    order: categories.value.length + 1,
  });
  categoryForm.name = '';
  await loadData();
}

async function saveCategory(category: Category) {
  await categoryService.saveCategory({ ...category, slug: slugify(category.name) });
}

async function removeCategory(id?: string) {
  if (!id) return;
  await categoryService.removeCategory(id);
  await loadData();
}

async function createSubcategory() {
  if (!authStore.user?.uid || !subcategoryForm.name || !subcategoryForm.categoryId) return;
  await categoryService.saveSubcategory({
    ownerId: authStore.user.uid,
    name: subcategoryForm.name,
    slug: slugify(subcategoryForm.name),
    categoryId: subcategoryForm.categoryId,
    order: subcategories.value.length + 1,
  });
  subcategoryForm.name = '';
  await loadData();
}

async function saveSubcategory(subcategory: Subcategory) {
  await categoryService.saveSubcategory({ ...subcategory, slug: slugify(subcategory.name) });
}

async function removeSubcategory(id?: string) {
  if (!id) return;
  await categoryService.removeSubcategory(id);
  await loadData();
}

onMounted(loadData);
</script>

<template>
  <div class="d-flex flex-column ga-6">
    <AppSectionCard title="Categorias" subtitle="Estruture sua vitrine com navegação objetiva.">
      <v-row>
        <v-col cols="12" md="8">
          <v-text-field v-model="categoryForm.name" label="Nova categoria" />
        </v-col>
        <v-col cols="12" md="4">
          <v-btn block color="primary" size="large" @click="createCategory">Adicionar categoria</v-btn>
        </v-col>
      </v-row>

      <div v-if="groupedSubcategories.length" class="d-flex flex-column ga-4 mt-4">
        <v-card v-for="category in groupedSubcategories" :key="category.id" variant="outlined" class="pa-4">
          <div class="d-flex flex-column flex-md-row ga-3 align-start align-md-center justify-space-between">
            <v-text-field v-model="category.name" hide-details label="Nome da categoria" class="flex-grow-1" />
            <div class="d-flex ga-2">
              <v-btn variant="tonal" @click="saveCategory(category)">Salvar</v-btn>
              <v-btn variant="text" color="error" @click="removeCategory(category.id)">Excluir</v-btn>
            </div>
          </div>

          <div class="mt-4 d-flex flex-column ga-3">
            <div v-for="sub in category.subcategories" :key="sub.id" class="d-flex flex-column flex-md-row ga-3 align-start align-md-center">
              <v-text-field v-model="sub.name" hide-details label="Subcategoria" class="flex-grow-1" />
              <div class="d-flex ga-2">
                <v-btn size="small" variant="tonal" @click="saveSubcategory(sub)">Salvar</v-btn>
                <v-btn size="small" variant="text" color="error" @click="removeSubcategory(sub.id)">Excluir</v-btn>
              </div>
            </div>
          </div>
        </v-card>
      </div>

      <EmptyState
        v-else
        title="Nenhuma categoria criada"
        description="Cadastre a primeira categoria para organizar seus produtos e melhorar a navegação da vitrine."
      />
    </AppSectionCard>

    <AppSectionCard title="Subcategorias" subtitle="Crie grupos secundários sem poluir a gestão.">
      <v-row>
        <v-col cols="12" md="4">
          <v-select v-model="subcategoryForm.categoryId" :items="categories" item-title="name" item-value="id" label="Categoria pai" />
        </v-col>
        <v-col cols="12" md="5">
          <v-text-field v-model="subcategoryForm.name" label="Nova subcategoria" />
        </v-col>
        <v-col cols="12" md="3">
          <v-btn block color="primary" size="large" @click="createSubcategory">Adicionar</v-btn>
        </v-col>
      </v-row>
    </AppSectionCard>
  </div>
</template>
