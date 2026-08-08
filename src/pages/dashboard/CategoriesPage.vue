<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useNotifications } from '@/stores/notifications.store'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { supabase } from '@/lib/supabase'

import EmptyState from '@/components/base/EmptyState.vue'

import type { Category } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Utils                                                                     */
/* -------------------------------------------------------------------------- */

function slugify(text: string): string {
    return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
}

/* -------------------------------------------------------------------------- */
/*  Types locais                                                              */
/* -------------------------------------------------------------------------- */

interface CategoryWithChildren extends Category {
    children: Category[]
    product_count: number
}

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const auth = useAuthStore()
const notify = useNotifications()

const { currentStoreId } = storeToRefs(auth)

const loading = ref(false)
const rows = ref<Category[]>([])
const productCounts = ref<Record<string, number>>({})
const btnLoading = ref<string | null>(null)

// Formulário principal — nova categoria raiz
const categoryForm = reactive({ name: '' })

// Formulários de subcategoria por categoria pai (chave = parent_id)
const subcategoryForms = reactive<Record<string, string>>({})

// Confirmação de exclusão
const confirmDelete = reactive({
    open: false,
    id: null as string | null,
    name: '',
    productCount: 0,
    isParent: false,
    childrenCount: 0,
})

/* -------------------------------------------------------------------------- */
/*  Dados agrupados (categorias raiz + suas subcategorias)                    */
/* -------------------------------------------------------------------------- */

const groupedData = computed<CategoryWithChildren[]>(() => {
    const roots = rows.value
        .filter(c => !c.parent_id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    return roots.map(root => ({
        ...root,
        children: rows.value
            .filter(c => c.parent_id === root.id)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
        product_count: productCounts.value[root.id] ?? 0,
    }))
})

/* -------------------------------------------------------------------------- */
/*  Load                                                                      */
/* -------------------------------------------------------------------------- */

async function loadData() {
    if (!currentStoreId.value) return
    loading.value = true

    try {
        // 1. Todas as categorias da loja (RLS já filtra por store_id)
        const { data: cats, error } = await supabase
            .from('categories')
            .select('*')
            .is('deleted_at', null)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })

        if (error) throw error
        rows.value = cats ?? []

        // 2. Contagem de produtos por categoria (para exibição e confirmação)
        if (rows.value.length) {
            const { data: prodCounts } = await supabase
                .from('products')
                .select('category_id')
                .is('deleted_at', null)
                .not('category_id', 'is', null)

            const counts: Record<string, number> = {}
            for (const p of prodCounts ?? []) {
                if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1
            }
            productCounts.value = counts
        }
    } catch (err: any) {
        notify.error(err.message ?? 'Erro ao carregar categorias')
    } finally {
        loading.value = false
    }
}

/* -------------------------------------------------------------------------- */
/*  CRUD                                                                      */
/* -------------------------------------------------------------------------- */

async function withLoading(key: string, fn: () => Promise<void>) {
    btnLoading.value = key
    try {
        await fn()
        await loadData()
    } finally {
        btnLoading.value = null
    }
}

async function createCategory() {
    const name = categoryForm.name.trim()
    if (!name || !currentStoreId.value) return

    await withLoading('create-cat', async () => {
        const { error } = await supabase.from('categories').insert({
            store_id: currentStoreId.value!,
            name,
            slug: slugify(name),
            sort_order: rows.value.filter(c => !c.parent_id).length,
            is_active: true,
        })
        if (error) {
            notify.error(
                error.code === '23505'
                    ? 'Já existe uma categoria com esse nome'
                    : error.message,
            )
            return
        }
        categoryForm.name = ''
        notify.success(`Categoria "${name}" criada`)
    })
}

async function createSubcategory(parentId: string) {
    const name = subcategoryForms[parentId]?.trim()
    if (!name || !currentStoreId.value) return

    await withLoading(`sub-new-${parentId}`, async () => {
        const siblingsCount = rows.value.filter(c => c.parent_id === parentId).length

        const { error } = await supabase.from('categories').insert({
            store_id: currentStoreId.value!,
            parent_id: parentId,
            name,
            slug: slugify(name),
            sort_order: siblingsCount,
            is_active: true,
        })
        if (error) {
            notify.error(
                error.code === '23505'
                    ? 'Já existe uma subcategoria com esse nome'
                    : error.message,
            )
            return
        }
        subcategoryForms[parentId] = ''
        notify.success(`Subcategoria "${name}" criada`)
    })
}

/**
 * Rename inline: só executa se o nome realmente mudou e é válido.
 * O slug é regenerado automaticamente.
 */
async function renameCategory(cat: Category, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === cat.name) {
        // reverte se ficou vazio
        if (!trimmed) await loadData()
        return
    }

    const { error } = await supabase
        .from('categories')
        .update({ name: trimmed, slug: slugify(trimmed) })
        .eq('id', cat.id)

    if (error) {
        notify.error('Erro ao renomear')
        await loadData() // reverte visual
        return
    }
    notify.success('Nome atualizado')
    await loadData()
}

async function toggleActive(cat: Category) {
    const { error } = await supabase
        .from('categories')
        .update({ is_active: !cat.is_active })
        .eq('id', cat.id)
    if (error) return notify.error(error.message)
    notify.success(cat.is_active ? 'Categoria ocultada' : 'Categoria ativada')
    await loadData()
}

/* -------------------------------------------------------------------------- */
/*  Exclusão com confirmação contextual                                       */
/* -------------------------------------------------------------------------- */

function askRemove(cat: Category | CategoryWithChildren) {
    const isParent = !cat.parent_id
    const children = isParent
        ? rows.value.filter(c => c.parent_id === cat.id).length
        : 0
    const productCount = productCounts.value[cat.id] ?? 0

    confirmDelete.open = true
    confirmDelete.id = cat.id
    confirmDelete.name = cat.name
    confirmDelete.isParent = isParent
    confirmDelete.childrenCount = children
    confirmDelete.productCount = productCount
}

async function confirmRemove() {
    if (!confirmDelete.id) return
    const id = confirmDelete.id

    await withLoading(`del-${id}`, async () => {
        // Soft delete — a coluna `deleted_at` do schema já suporta
        const now = new Date().toISOString()

        // Se for pai, soft-delete cascata nas filhas
        if (confirmDelete.isParent && confirmDelete.childrenCount > 0) {
            await supabase
                .from('categories')
                .update({ deleted_at: now })
                .eq('parent_id', id)
        }

        const { error } = await supabase
            .from('categories')
            .update({ deleted_at: now })
            .eq('id', id)

        if (error) {
            notify.error(error.message)
            return
        }
        notify.success(`"${confirmDelete.name}" removida`)
    })

    confirmDelete.open = false
}

/* -------------------------------------------------------------------------- */
/*  Reordenação simples (subir/descer)                                        */
/* -------------------------------------------------------------------------- */

const { execute: moveCategory, loading: movingCategory } = useAsyncAction(
    async (cat: Category, direction: -1 | 1) => {
        const siblings = rows.value
            .filter(c => c.parent_id === cat.parent_id)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

        const idx = siblings.findIndex(c => c.id === cat.id)
        const swapIdx = idx + direction
        if (swapIdx < 0 || swapIdx >= siblings.length) return

        const a = siblings[idx]
        const b = siblings[swapIdx]

        await supabase.from('categories')
            .update({ sort_order: b.sort_order ?? 0 }).eq('id', a.id)
        await supabase.from('categories')
            .update({ sort_order: a.sort_order ?? 0 }).eq('id', b.id)

        await loadData()
    },
)

/* -------------------------------------------------------------------------- */
/*  Watch da loja ativa                                                       */
/* -------------------------------------------------------------------------- */

onMounted(loadData)
// Se o usuário trocar de loja, recarrega
import { watch } from 'vue'
watch(currentStoreId, () => loadData())
</script>

<template>
    <div class="d-flex flex-column ga-6">

        <!-- ================================================================ -->
        <!--  HEADER — criação de nova categoria                              -->
        <!-- ================================================================ -->
        <v-card rounded="xl" border flat class="pa-6 bg-surface">
            <v-row align="center">
                <v-col cols="12" md="7">
                    <h2 class="text-h5 font-weight-black mb-1">
                        Organize seu catálogo
                    </h2>
                    <p class="text-body-2 text-medium-emphasis mb-0">
                        Crie grupos e subgrupos para ajudar seu cliente a encontrar produtos em segundos.
                    </p>
                </v-col>
                <v-col cols="12" md="5">
                    <v-text-field v-model="categoryForm.name" label="Nova categoria"
                        placeholder="Ex: Camisetas, Hambúrgueres..." hide-details rounded="pill" variant="outlined"
                        density="comfortable" :disabled="btnLoading === 'create-cat'" @keyup.enter="createCategory">
                        <template #append-inner>
                            <v-btn color="primary" variant="flat" rounded="pill" size="small" class="text-none"
                                :loading="btnLoading === 'create-cat'" :disabled="!categoryForm.name.trim()"
                                @click="createCategory">
                                Adicionar
                            </v-btn>
                        </template>
                    </v-text-field>
                </v-col>
            </v-row>
        </v-card>

        <!-- ================================================================ -->
        <!--  LOADING                                                         -->
        <!-- ================================================================ -->
        <template v-if="loading && !rows.length">
            <v-skeleton-loader v-for="i in 3" :key="i" type="article, actions" class="rounded-xl" />
        </template>

        <!-- ================================================================ -->
        <!--  LISTA DE CATEGORIAS                                             -->
        <!-- ================================================================ -->
        <div v-else-if="groupedData.length" class="d-flex flex-column ga-4">
            <v-card v-for="(category, catIdx) in groupedData" :key="category.id" rounded="xl" border flat
                class="overflow-hidden category-card" :class="{ 'category-inactive': !category.is_active }">
                <!--  Cabeçalho da categoria  -->
                <div class="pa-4 category-header d-flex align-center justify-space-between ga-3 flex-wrap">
                    <div class="d-flex align-center ga-3 flex-grow-1 min-width-0">
                        <!--  Reordenação  -->
                        <div class="d-flex flex-column">
                            <v-btn icon="mdi-chevron-up" variant="text" size="x-small" density="compact"
                                :disabled="catIdx === 0 || movingCategory" @click="moveCategory(category, -1)" />
                            <v-btn icon="mdi-chevron-down" variant="text" size="x-small" density="compact"
                                :disabled="catIdx === groupedData.length - 1 || movingCategory"
                                @click="moveCategory(category, 1)" />
                        </div>

                        <!--  Nome editável  -->
                        <v-text-field :model-value="category.name" variant="plain" hide-details density="compact"
                            class="text-h6 font-weight-bold flex-grow-1 category-name-input"
                            @update:model-value="(v: string) => category.name = v"
                            @blur="(e: FocusEvent) => renameCategory(category, (e.target as HTMLInputElement).value)"
                            @keyup.enter="(e: KeyboardEvent) => (e.target as HTMLInputElement).blur()" />

                        <!--  Badge de produtos vinculados  -->
                        <v-chip v-if="category.product_count > 0" size="small" variant="tonal" color="primary">
                            {{ category.product_count }}
                            {{ category.product_count === 1 ? 'produto' : 'produtos' }}
                        </v-chip>
                    </div>

                    <!--  Ações  -->
                    <div class="d-flex align-center ga-1">
                        <v-tooltip :text="category.is_active ? 'Ocultar categoria' : 'Ativar categoria'">
                            <template #activator="{ props: tp }">
                                <v-btn v-bind="tp"
                                    :icon="category.is_active ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
                                    variant="text" size="small" @click="toggleActive(category)" />
                            </template>
                        </v-tooltip>

                        <v-tooltip text="Excluir">
                            <template #activator="{ props: tp }">
                                <v-btn v-bind="tp" icon="mdi-trash-can-outline" variant="text" color="error"
                                    size="small" :loading="btnLoading === `del-${category.id}`"
                                    @click="askRemove(category)" />
                            </template>
                        </v-tooltip>
                    </div>
                </div>

                <!--  Subcategorias  -->
                <div class="pa-6 pt-4">
                    <div class="text-overline text-medium-emphasis mb-3">
                        Subcategorias
                        <span v-if="category.children.length" class="ml-1 text-caption">
                            ({{ category.children.length }})
                        </span>
                    </div>

                    <div class="d-flex flex-wrap ga-2 align-center">
                        <v-chip v-for="sub in category.children" :key="sub.id" closable variant="tonal"
                            :color="sub.is_active ? 'primary' : 'grey'" class="font-weight-medium sub-chip"
                            @click:close="askRemove(sub)">
                            <v-icon v-if="!sub.is_active" start size="14" icon="mdi-eye-off-outline" />
                            {{ sub.name }}
                        </v-chip>

                        <!--  Input inline  -->
                        <v-text-field v-model="subcategoryForms[category.id]" placeholder="+ Adicionar subcategoria"
                            variant="outlined" density="compact" hide-details rounded="pill" class="quick-sub-input"
                            style="max-width: 240px" :disabled="btnLoading === `sub-new-${category.id}`"
                            @keyup.enter="createSubcategory(category.id)">
                            <template #append-inner>
                                <v-btn v-if="subcategoryForms[category.id]?.trim()" icon="mdi-check" size="x-small"
                                    color="primary" variant="flat" :loading="btnLoading === `sub-new-${category.id}`"
                                    @click="createSubcategory(category.id)" />
                            </template>
                        </v-text-field>
                    </div>

                    <div v-if="!category.children.length" class="text-caption text-disabled italic mt-3">
                        Nenhuma subcategoria em <strong>{{ category.name }}</strong> ainda.
                    </div>
                </div>
            </v-card>
        </div>

        <!-- ================================================================ -->
        <!--  EMPTY STATE                                                     -->
        <!-- ================================================================ -->
        <EmptyState v-else title="Seu catálogo está vazio"
            description="Comece criando categorias como 'Promoções' ou 'Novidades' para organizar seus produtos."
            icon="mdi-tag-multiple-outline" />

        <!-- ================================================================ -->
        <!--  DIALOG DE CONFIRMAÇÃO DE EXCLUSÃO                               -->
        <!-- ================================================================ -->
        <v-dialog v-model="confirmDelete.open" max-width="480" persistent>
            <v-card rounded="xl">
                <v-card-item>
                    <template #prepend>
                        <v-avatar color="error" variant="tonal" size="44">
                            <v-icon>mdi-alert-outline</v-icon>
                        </v-avatar>
                    </template>
                    <v-card-title class="text-h6 font-weight-bold">
                        Excluir "{{ confirmDelete.name }}"?
                    </v-card-title>
                </v-card-item>

                <v-card-text>
                    <p class="text-body-2 mb-3">
                        Esta ação move a
                        {{ confirmDelete.isParent ? 'categoria' : 'subcategoria' }}
                        para a lixeira (pode ser recuperada por um administrador).
                    </p>

                    <v-alert v-if="confirmDelete.childrenCount > 0" type="warning" variant="tonal" density="compact"
                        rounded="lg" class="mb-2">
                        Também serão removidas
                        <strong>{{ confirmDelete.childrenCount }} subcategoria(s)</strong>
                        vinculada(s).
                    </v-alert>

                    <v-alert v-if="confirmDelete.productCount > 0" type="info" variant="tonal" density="compact"
                        rounded="lg">
                        <strong>{{ confirmDelete.productCount }} produto(s)</strong>
                        ficarão sem categoria após esta ação.
                    </v-alert>
                </v-card-text>

                <v-card-actions class="pa-4">
                    <v-spacer />
                    <v-btn variant="text" class="text-none" @click="confirmDelete.open = false">
                        Cancelar
                    </v-btn>
                    <v-btn color="error" variant="flat" class="text-none"
                        :loading="btnLoading === `del-${confirmDelete.id}`" @click="confirmRemove">
                        Excluir
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

    </div>
</template>

<style scoped>
.category-card {
    transition: all 0.2s ease;
}

.category-card:hover {
    border-color: rgba(var(--v-theme-primary), 0.4) !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.category-inactive {
    opacity: 0.6;
}

.category-header {
    background: linear-gradient(90deg,
            rgba(var(--v-theme-primary), 0.03),
            rgba(var(--v-theme-surface-variant), 0.4));
    border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

.category-name-input :deep(input) {
    padding: 4px 0 !important;
    min-height: auto !important;
    font-weight: 700 !important;
}

.category-name-input :deep(input:focus) {
    background: rgba(var(--v-theme-primary), 0.05);
    border-radius: 6px;
    padding: 4px 8px !important;
}

.quick-sub-input :deep(input) {
    font-size: 0.875rem !important;
}

.sub-chip {
    transition: all 0.15s ease;
}

.sub-chip:hover {
    transform: translateY(-1px);
}

.min-width-0 {
    min-width: 0;
}
</style>
