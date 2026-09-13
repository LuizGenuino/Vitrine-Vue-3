<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

import ImageUploadDropzone from '@/components/base/ImageUploadDropzone.vue'
import CharacteristicsInput from './CharacteristicsInput.vue'

import type { Category, Product, ProductStatus } from '@/types/models'

/* -------------------------------------------------------------------------- */
/*  Types locais                                                              */
/* -------------------------------------------------------------------------- */

interface ProductDraft extends Partial<Product> {
    attributes?: { name: string; value: string }[]
    initialStock?: number
    existingImages?: { id?: string; url: string; is_primary: boolean }[]
    parent_category_id?: string | null  // apenas para navegação da UI
}

interface Props {
    categories: Category[]        // apenas categorias raiz (parent_id null)
    subcategories: Category[]     // apenas subcategorias (parent_id preenchido)
    loading: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ save: []; close: [] }>()

/* -------------------------------------------------------------------------- */
/*  v-models                                                                  */
/* -------------------------------------------------------------------------- */

const isVisible = defineModel<boolean>({ required: true })
const product = defineModel<ProductDraft>('product', { required: true })
const pendingFiles = defineModel<File[]>('pendingFiles', { default: () => [] })

/* -------------------------------------------------------------------------- */
/*  Slug automático a partir do nome                                          */
/* -------------------------------------------------------------------------- */

function slugify(text: string): string {
    return text
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
}

const isEditing = computed(() => !!product.value.id)

// Slug auto só ao criar E enquanto o usuário não digitar manualmente
const slugAutoSync = ref(!isEditing.value && !product.value.slug)

watch(() => product.value.name, (name) => {
    if (slugAutoSync.value && name) {
        product.value.slug = slugify(name)
    }
})

function onSlugManualEdit() {
    slugAutoSync.value = false
}

/* -------------------------------------------------------------------------- */
/*  Categorias (2 níveis via parent_id)                                       */
/* -------------------------------------------------------------------------- */

// Descobre a raiz da categoria selecionada (para pré-preencher ao editar)
watch(() => product.value.category_id, (catId) => {
    if (!catId) {
        product.value.parent_category_id = null
        return
    }
    const isRoot = props.categories.some(c => c.id === catId)
    if (isRoot) {
        product.value.parent_category_id = catId
    } else {
        const sub = props.subcategories.find(s => s.id === catId)
        if (sub) product.value.parent_category_id = sub.parent_id
    }
}, { immediate: true })

const filteredSubcategories = computed(() => {
    if (!product.value.parent_category_id) return []
    return props.subcategories.filter(
        s => s.parent_id === product.value.parent_category_id,
    )
})

function onParentCategoryChange(newParentId: string | null) {
    product.value.parent_category_id = newParentId
    // Se a category_id atual não pertence à nova raiz, reseta para a raiz
    const stillValid = newParentId && (
        newParentId === product.value.category_id ||
        props.subcategories.some(s => s.id === product.value.category_id && s.parent_id === newParentId)
    )
    if (!stillValid) product.value.category_id = newParentId ?? null
}

/* -------------------------------------------------------------------------- */
/*  Steps                                                                     */
/* -------------------------------------------------------------------------- */

interface Step {
    key: string
    label: string
    icon: string
    description: string
}

const steps: Step[] = [
    { key: 'general', label: 'Geral', icon: 'mdi-information-outline', description: 'Nome, preços e categoria' },
    { key: 'images', label: 'Imagens', icon: 'mdi-image-multiple-outline', description: 'Fotos do produto' },
    { key: 'details', label: 'Detalhes', icon: 'mdi-format-list-bulleted', description: 'Atributos e descrição' },
    { key: 'seo', label: 'SEO', icon: 'mdi-magnify-scan', description: 'Otimização para busca' },
]

const activeStep = ref(0)

/* -------------------------------------------------------------------------- */
/*  Validação                                                                 */
/* -------------------------------------------------------------------------- */

const formRef = ref<any>(null)

const rules = {
    required: (v: any) => (v !== null && v !== undefined && v !== '') || 'Campo obrigatório',
    minLen: (n: number) => (v: string) => (v?.length ?? 0) >= n || `Mínimo ${n} caracteres`,
    maxLen: (n: number) => (v: string) => (v?.length ?? 0) <= n || `Máximo ${n} caracteres`,
    nonNegative: (v: number) => Number(v) >= 0 || 'Não pode ser negativo',
    positive: (v: number) => Number(v) > 0 || 'Deve ser maior que zero',
    sku: (v: string) =>
        /^[A-Za-z0-9-_]+$/.test(v ?? '') || 'Use apenas letras, números, hífen e underline',
    slug: (v: string) =>
        !v || /^[a-z0-9-]+$/.test(v) || 'Slug deve conter apenas letras minúsculas, números e hífens',
}

// Estado de erro por step (para mostrar bolinha vermelha)
const stepErrors = ref<Record<number, boolean>>({})

async function validateStep(idx: number): Promise<boolean> {
    // Delega ao Vuetify — ele valida todos os campos visíveis do window-item ativo
    await nextTick()
    const { valid, errors } = await formRef.value.validate()
    stepErrors.value = {} // limpa

    // Marca todos os steps com erros (nossa lógica de qual step tem erro)
    if (!valid) {
        // Mapeamento simples: se houve erro geral, marca o step atual
        stepErrors.value[idx] = true
    }
    return valid
}

async function nextStep() {
    const ok = await validateStep(activeStep.value)
    if (!ok) return
    if (activeStep.value < steps.length - 1) activeStep.value++
}

function prevStep() {
    if (activeStep.value > 0) activeStep.value--
}

async function submit() {
    const { valid } = await formRef.value.validate()
    if (!valid) {
        // encontra o primeiro step com erro e navega
        activeStep.value = 0
        return
    }
    emit('save')
}

/* -------------------------------------------------------------------------- */
/*  Imagens                                                                   */
/* -------------------------------------------------------------------------- */

const MAX_IMAGES = 8

// URLs temporárias de preview dos pendingFiles
const pendingPreviews = ref<string[]>([])

watch(pendingFiles, (files) => {
    // libera URLs antigas
    pendingPreviews.value.forEach(URL.revokeObjectURL)
    pendingPreviews.value = files.map(f => URL.createObjectURL(f))
}, { deep: true, immediate: true })

// Lista unificada exibida (existentes + pendentes)
interface ImageSlot {
    key: string
    url: string
    isPrimary: boolean
    isPending: boolean
    fileIndex?: number   // para pendingFiles
    existingId?: string  // para existingImages
}

const allImages = computed<ImageSlot[]>(() => {
    const existing = (product.value.existingImages ?? []).map((img, i) => ({
        key: `ex-${img.id ?? i}`,
        url: img.url,
        isPrimary: img.is_primary,
        isPending: false,
        existingId: img.id,
    }))
    const pending = pendingFiles.value.map((_, i) => ({
        key: `pd-${i}`,
        url: pendingPreviews.value[i] ?? '',
        isPrimary: false,
        isPending: true,
        fileIndex: i,
    }))
    return [...existing, ...pending]
})

const totalImages = computed(() => allImages.value.length)
const canAddMore = computed(() => totalImages.value < MAX_IMAGES)
const availableSlots = computed(() => MAX_IMAGES - totalImages.value)

function handleSelectFiles(files: File[]) {
    if (!canAddMore.value) return
    const toAdd = files.slice(0, availableSlots.value)
    pendingFiles.value = [...pendingFiles.value, ...toAdd]
}

function removeImage(slot: ImageSlot) {
    if (slot.isPending && slot.fileIndex !== undefined) {
        const newFiles = [...pendingFiles.value]
        newFiles.splice(slot.fileIndex, 1)
        pendingFiles.value = newFiles
    } else {
        product.value.existingImages = (product.value.existingImages ?? [])
            .filter(img => img.id !== slot.existingId)
    }
}

function setPrimary(slot: ImageSlot) {
    // Apenas imagens existentes podem ser marcadas como primárias
    // (as pendentes recebem is_primary no upload, no pai)
    if (slot.isPending) {
        // Move ela para o topo dos pendings, e desmarca todas existentes
        const files = [...pendingFiles.value]
        if (slot.fileIndex !== undefined && slot.fileIndex > 0) {
            const [f] = files.splice(slot.fileIndex, 1)
            files.unshift(f)
            pendingFiles.value = files
        }
        product.value.existingImages = (product.value.existingImages ?? [])
            .map(img => ({ ...img, is_primary: false }))
        return
    }

    product.value.existingImages = (product.value.existingImages ?? [])
        .map(img => ({ ...img, is_primary: img.id === slot.existingId }))
}

/* -------------------------------------------------------------------------- */
/*  Métricas do formulário                                                    */
/* -------------------------------------------------------------------------- */

const margin = computed(() => {
    const price = Number(product.value.price ?? 0)
    const cost = Number(product.value.cost_price ?? 0)
    if (!price || !cost) return null
    return {
        absolute: price - cost,
        percent: Math.round(((price - cost) / cost) * 100),
    }
})

const marginColor = computed(() => {
    if (!margin.value) return 'grey'
    if (margin.value.percent < 20) return 'error'
    if (margin.value.percent < 50) return 'warning'
    return 'success'
})

const seoScore = computed(() => {
    let score = 0
    if ((product.value.seo_title?.length ?? 0) >= 30) score += 25
    if ((product.value.seo_title?.length ?? 0) <= 60) score += 10
    if ((product.value.seo_description?.length ?? 0) >= 100) score += 30
    if ((product.value.seo_description?.length ?? 0) <= 160) score += 10
    if ((product.value.seo_keywords?.length ?? 0) > 0) score += 15
    if (product.value.slug) score += 10
    return Math.min(100, score)
})

const seoColor = computed(() => {
    if (seoScore.value >= 80) return 'success'
    if (seoScore.value >= 50) return 'warning'
    return 'error'
})

/* -------------------------------------------------------------------------- */
/*  Reset ao fechar                                                           */
/* -------------------------------------------------------------------------- */

watch(isVisible, (visible) => {
    if (visible) {
        activeStep.value = 0
        stepErrors.value = {}
    } else {
        // libera URLs de preview
        pendingPreviews.value.forEach(URL.revokeObjectURL)
        pendingPreviews.value = []
    }
})
</script>

<template>
    <v-dialog v-model="isVisible" max-width="1000" persistent scrollable transition="dialog-bottom-transition">
        <v-card rounded="xl" class="dialog-card">

            <!-- ============================================================ -->
            <!--  TOOLBAR                                                    -->
            <!-- ============================================================ -->
            <v-toolbar color="surface" border="b" density="comfortable">
                <v-btn icon="mdi-close" variant="text" @click="emit('close')" />
                <v-toolbar-title class="font-weight-black">
                    {{ isEditing ? 'Editar produto' : 'Novo produto' }}
                </v-toolbar-title>
                <v-spacer />
                <v-chip v-if="isEditing" label size="small" variant="tonal" class="mr-4 font-family-mono">
                    {{ product.sku }}
                </v-chip>
            </v-toolbar>

            <!-- ============================================================ -->
            <!--  STEPPER HORIZONTAL                                         -->
            <!-- ============================================================ -->
            <div class="steps-header">
                <div v-for="(step, i) in steps" :key="step.key" class="step-item" :class="{
                    active: activeStep === i,
                    completed: activeStep > i,
                    'has-error': stepErrors[i],
                }" @click="activeStep = i">
                    <div class="step-badge">
                        <v-icon v-if="activeStep > i && !stepErrors[i]" size="18">mdi-check</v-icon>
                        <v-icon v-else-if="stepErrors[i]" size="18">mdi-alert</v-icon>
                        <span v-else>{{ i + 1 }}</span>
                    </div>
                    <div class="step-info hidden-sm-and-down">
                        <div class="step-label">{{ step.label }}</div>
                        <div class="step-desc">{{ step.description }}</div>
                    </div>
                    <div class="step-info-mobile hidden-md-and-up">
                        <div class="step-label">{{ step.label }}</div>
                    </div>
                </div>
            </div>

            <!-- ============================================================ -->
            <!--  CONTENT                                                    -->
            <!-- ============================================================ -->
            <v-card-text class="pa-0 dialog-body">
                <v-form ref="formRef" lazy-validation>
                    <v-window v-model="activeStep" class="fill-height">

                        <!-- ================= STEP 1 — GERAL ================= -->
                        <v-window-item :value="0" class="pa-6">
                            <v-row>
                                <v-col cols="12">
                                    <v-text-field v-model="product.name" label="Nome do produto *"
                                        placeholder="Ex: Camiseta Oversized Algodão Peruano"
                                        :rules="[rules.required, rules.minLen(3), rules.maxLen(150)]" variant="outlined"
                                        density="comfortable" counter="150" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="product.sku" label="SKU / Código *"
                                        placeholder="Ex: CAM-OVR-001" :rules="[rules.required, rules.sku]"
                                        variant="outlined" density="comfortable" prepend-inner-icon="mdi-barcode"
                                        hint="Identificador único na sua loja" persistent-hint />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-text-field v-model="product.slug" label="Slug (URL)"
                                        placeholder="camiseta-oversized" :rules="[rules.slug]" variant="outlined"
                                        density="comfortable" prepend-inner-icon="mdi-link"
                                        hint="Gerado automaticamente a partir do nome" persistent-hint
                                        @update:model-value="onSlugManualEdit" />
                                </v-col>

                                <v-col cols="12" md="4">
                                    <v-text-field v-model.number="product.cost_price" label="Custo *" prefix="R$"
                                        type="number" step="0.01" min="0" :rules="[rules.required, rules.nonNegative]"
                                        variant="outlined" density="comfortable" />
                                </v-col>

                                <v-col cols="12" md="4">
                                    <v-text-field v-model.number="product.price" label="Preço de venda *" prefix="R$"
                                        type="number" step="0.01" min="0" :rules="[rules.required, rules.positive]"
                                        variant="outlined" density="comfortable" />
                                </v-col>

                                <v-col cols="12" md="4">
                                    <v-card v-if="margin" variant="tonal" :color="marginColor"
                                        class="pa-3 h-100 d-flex flex-column justify-center" rounded="lg">
                                        <div class="text-caption text-medium-emphasis">Margem de lucro</div>
                                        <div class="d-flex align-baseline ga-2">
                                            <span class="text-h6 font-weight-black">
                                                {{ margin.percent }}%
                                            </span>
                                            <span class="text-body-2">
                                                (R$ {{ margin.absolute.toFixed(2) }})
                                            </span>
                                        </div>
                                    </v-card>
                                    <v-card v-else variant="outlined"
                                        class="pa-3 h-100 d-flex flex-column justify-center text-center" rounded="lg">
                                        <div class="text-caption text-medium-emphasis">
                                            Preencha custo e preço<br>para calcular a margem
                                        </div>
                                    </v-card>
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-select v-model="product.parent_category_id"
                                        :items="[{ title: 'Sem categoria', value: null }, ...categories.map(c => ({ title: c.name, value: c.id }))]"
                                        label="Categoria" variant="outlined" density="comfortable"
                                        prepend-inner-icon="mdi-tag-outline"
                                        @update:model-value="onParentCategoryChange" />
                                </v-col>

                                <v-col cols="12" md="6">
                                    <v-select v-model="product.category_id"
                                        :items="filteredSubcategories.map(s => ({ title: s.name, value: s.id }))"
                                        label="Subcategoria" variant="outlined" density="comfortable"
                                        prepend-inner-icon="mdi-tag-multiple-outline"
                                        :disabled="!product.parent_category_id || filteredSubcategories.length === 0"
                                        clearable :hint="!filteredSubcategories.length && product.parent_category_id
                                            ? 'Esta categoria não possui subcategorias'
                                            : ''" persistent-hint />
                                </v-col>

                                <v-col v-if="!isEditing" cols="12" md="6">
                                    <v-text-field v-model.number="product.initialStock" label="Estoque inicial"
                                        type="number" min="0" :rules="[rules.nonNegative]" variant="outlined"
                                        density="comfortable" prepend-inner-icon="mdi-package-variant"
                                        hint="Será registrada uma entrada no ledger" persistent-hint />
                                </v-col>

                                <v-col cols="12" :md="isEditing ? 12 : 6">
                                    <v-select v-model="product.status" :items="[
                                        { title: '📝 Rascunho (oculto)', value: 'DRAFT' },
                                        { title: '✅ Ativo (visível)', value: 'ACTIVE' },
                                        { title: '⏸️ Inativo (temporariamente oculto)', value: 'INACTIVE' },
                                    ]" label="Status de publicação" variant="outlined" density="comfortable" />
                                </v-col>

                                <v-col cols="12">
                                    <v-switch v-model="product.is_featured" label="Destacar este produto na loja"
                                        color="warning" hide-details density="compact" prepend-icon="mdi-star" />
                                </v-col>
                            </v-row>
                        </v-window-item>

                        <!-- ================= STEP 2 — IMAGENS ================= -->
                        <v-window-item :value="1" class="pa-6">
                            <div class="mb-4 d-flex align-center justify-space-between flex-wrap ga-2">
                                <div>
                                    <h3 class="text-subtitle-1 font-weight-bold">
                                        Fotos do produto
                                    </h3>
                                    <p class="text-caption text-medium-emphasis mb-0">
                                        Adicione até {{ MAX_IMAGES }} fotos. A primeira será a principal (⭐).
                                    </p>
                                </div>
                                <v-chip size="small" variant="tonal" :color="totalImages > 0 ? 'success' : 'grey'">
                                    {{ totalImages }} / {{ MAX_IMAGES }}
                                </v-chip>
                            </div>

                            <ImageUploadDropzone :disabled="!canAddMore" :max-files="availableSlots"
                                @select-files="handleSelectFiles" />

                            <!--  Grid de imagens  -->
                            <div v-if="allImages.length" class="images-grid mt-6">
                                <div v-for="slot in allImages" :key="slot.key" class="image-slot"
                                    :class="{ 'is-primary': slot.isPrimary }">
                                    <v-img :src="slot.url" aspect-ratio="1" cover class="image-preview">
                                        <template #placeholder>
                                            <v-skeleton-loader type="image" class="fill-height" />
                                        </template>
                                    </v-img>

                                    <div class="image-overlay">
                                        <v-btn v-if="!slot.isPrimary" icon="mdi-star-outline" size="x-small"
                                            variant="flat" color="warning" @click="setPrimary(slot)">
                                            <v-icon>mdi-star-outline</v-icon>
                                            <v-tooltip activator="parent" text="Marcar como principal" />
                                        </v-btn>
                                        <v-btn icon size="x-small" variant="flat" color="error"
                                            @click="removeImage(slot)">
                                            <v-icon>mdi-close</v-icon>
                                        </v-btn>
                                    </div>

                                    <v-chip v-if="slot.isPrimary" class="primary-badge" color="warning" size="x-small"
                                        variant="flat" prepend-icon="mdi-star">
                                        Principal
                                    </v-chip>

                                    <v-chip v-if="slot.isPending" class="pending-badge" color="info" size="x-small"
                                        variant="flat">
                                        Novo
                                    </v-chip>
                                </div>
                            </div>

                            <v-alert v-if="totalImages === 0" type="warning" variant="tonal" rounded="lg"
                                density="compact" class="mt-6" icon="mdi-image-off-outline">
                                Produtos sem foto convertem muito menos. Adicione pelo menos 1 imagem.
                            </v-alert>
                        </v-window-item>

                        <!-- ================= STEP 3 — DETALHES ================= -->
                        <v-window-item :value="2" class="pa-6">
                            <v-row>
                                <v-col cols="12">
                                    <v-textarea v-model="product.description" label="Descrição comercial *"
                                        placeholder="Descreva os benefícios do produto de forma clara e persuasiva..."
                                        rows="4" variant="outlined" counter="500"
                                        :rules="[rules.required, rules.minLen(20), rules.maxLen(500)]"
                                        persistent-counter />
                                </v-col>

                                <v-col cols="12">
                                    <div class="d-flex align-center justify-space-between mb-2">
                                        <h3 class="text-subtitle-2 font-weight-bold">
                                            Atributos técnicos
                                        </h3>
                                        <v-chip v-if="product.attributes?.length" size="x-small" variant="tonal"
                                            color="primary">
                                            {{ product.attributes.length }}
                                            {{ product.attributes.length === 1 ? 'atributo' : 'atributos' }}
                                        </v-chip>
                                    </div>
                                    <p class="text-caption text-medium-emphasis mb-3">
                                        Adicione especificações como material, dimensões, voltagem, cor, tamanho...
                                    </p>
                                    <CharacteristicsInput v-model="product.attributes" label="Atributos"
                                        placeholder-key="Ex: Material" placeholder-value="Ex: Algodão 100%" />
                                </v-col>
                            </v-row>
                        </v-window-item>

                        <!-- ================= STEP 4 — SEO ================= -->
                        <v-window-item :value="3" class="pa-6">
                            <div class="mb-4 d-flex align-center justify-space-between flex-wrap ga-2">
                                <div>
                                    <h3 class="text-subtitle-1 font-weight-bold">
                                        Otimização para busca (SEO)
                                    </h3>
                                    <p class="text-caption text-medium-emphasis mb-0">
                                        Ajude o Google e outros buscadores a encontrar seu produto.
                                    </p>
                                </div>
                                <v-chip size="small" :color="seoColor" variant="tonal" prepend-icon="mdi-chart-line">
                                    Score: {{ seoScore }}/100
                                </v-chip>
                            </div>

                            <v-progress-linear :model-value="seoScore" :color="seoColor" height="6" rounded
                                class="mb-6" />

                            <v-row>
                                <v-col cols="12">
                                    <v-text-field v-model="product.seo_title" label="Título SEO"
                                        :placeholder="product.name || 'Ex: Camiseta Oversized Algodão | Loja XYZ'"
                                        variant="outlined" density="comfortable" counter="60"
                                        hint="Recomendado: 30–60 caracteres" persistent-hint />
                                </v-col>

                                <v-col cols="12">
                                    <v-textarea v-model="product.seo_description" label="Meta description"
                                        placeholder="Descrição curta que aparecerá nos resultados de busca..." rows="3"
                                        variant="outlined" counter="160" hint="Recomendado: 100–160 caracteres"
                                        persistent-hint />
                                </v-col>

                                <v-col cols="12">
                                    <v-text-field v-model="product.seo_keywords" label="Palavras-chave"
                                        placeholder="camiseta, oversized, algodão, moda masculina" variant="outlined"
                                        density="comfortable" prepend-inner-icon="mdi-key-outline"
                                        hint="Separadas por vírgula (opcional)" persistent-hint />
                                </v-col>

                                <!-- Preview Google -->
                                <v-col cols="12">
                                    <v-card variant="tonal" color="grey-lighten-4" rounded="lg"
                                        class="pa-4 seo-preview">
                                        <div class="text-caption text-medium-emphasis mb-2">
                                            Prévia do resultado no Google
                                        </div>
                                        <div class="google-preview">
                                            <div class="google-url">
                                                loja.vibestore.app › {{ product.slug || 'produto' }}
                                            </div>
                                            <div class="google-title">
                                                {{ product.seo_title || product.name || 'Nome do produto' }}
                                            </div>
                                            <div class="google-desc">
                                                {{ product.seo_description
                                                    || product.description
                                                    || 'Adicione uma descrição para que apareça aqui...' }}
                                            </div>
                                        </div>
                                    </v-card>
                                </v-col>
                            </v-row>
                        </v-window-item>

                    </v-window>
                </v-form>
            </v-card-text>

            <!-- ============================================================ -->
            <!--  ACTIONS                                                    -->
            <!-- ============================================================ -->
            <v-divider />
            <v-card-actions class="pa-4 flex-wrap ga-2">
                <v-btn v-if="activeStep > 0" variant="text" class="text-none" prepend-icon="mdi-arrow-left"
                    @click="prevStep">
                    Voltar
                </v-btn>

                <v-spacer />

                <v-btn variant="text" class="text-none" :disabled="loading" @click="emit('close')">
                    Cancelar
                </v-btn>

                <v-btn v-if="activeStep < steps.length - 1" color="primary" variant="flat" rounded="pill"
                    class="text-none px-6" append-icon="mdi-arrow-right" @click="nextStep">
                    Próximo
                </v-btn>

                <v-btn v-else color="primary" variant="flat" rounded="pill" class="text-none px-8"
                    prepend-icon="mdi-content-save-outline" :loading="loading" @click="submit">
                    {{ isEditing ? 'Salvar alterações' : 'Publicar produto' }}
                </v-btn>
            </v-card-actions>

        </v-card>
    </v-dialog>
</template>

<style scoped>
.dialog-card {
    height: 90vh;
    display: flex;
    flex-direction: column;
}

.dialog-body {
    flex: 1;
    overflow-y: auto;
}

.font-family-mono {
    font-family: 'JetBrains Mono', monospace;
}

/* ============================================================ */
/*  Stepper header                                              */
/* ============================================================ */
.steps-header {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
    background: rgba(var(--v-theme-surface-variant), 0.3);
    overflow-x: auto;
}

.step-item {
    flex: 1;
    min-width: 120px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    cursor: pointer;
    position: relative;
    transition: all 0.2s ease;
    border-bottom: 3px solid transparent;
}

.step-item:not(:last-child)::after {
    content: '';
    position: absolute;
    right: 0;
    top: 20%;
    height: 60%;
    width: 1px;
    background: rgba(var(--v-border-color), 0.12);
}

.step-item:hover {
    background: rgba(var(--v-theme-primary), 0.04);
}

.step-item.active {
    background: rgb(var(--v-theme-surface));
    border-bottom-color: rgb(var(--v-theme-primary));
}

.step-item.completed .step-badge {
    background: rgb(var(--v-theme-success));
    color: white;
}

.step-item.has-error .step-badge {
    background: rgb(var(--v-theme-error));
    color: white;
}

.step-badge {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(var(--v-theme-on-surface), 0.08);
    color: rgb(var(--v-theme-on-surface));
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    flex-shrink: 0;
}

.step-item.active .step-badge {
    background: rgb(var(--v-theme-primary));
    color: white;
}

.step-info {
    min-width: 0;
}

.step-label {
    font-size: 0.875rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
    line-height: 1.2;
}

.step-desc {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    line-height: 1.2;
    margin-top: 2px;
}

.step-info-mobile .step-label {
    font-size: 0.75rem;
}

/* ============================================================ */
/*  Images grid                                                 */
/* ============================================================ */
.images-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
}

.image-slot {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid transparent;
    transition: all 0.2s ease;
    aspect-ratio: 1;
    background: rgba(var(--v-theme-surface-variant), 0.5);
}

.image-slot.is-primary {
    border-color: rgb(var(--v-theme-warning));
    box-shadow: 0 4px 12px rgba(var(--v-theme-warning), 0.25);
}

.image-slot:hover .image-overlay {
    opacity: 1;
}

.image-preview {
    width: 100%;
    height: 100%;
}

.image-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg,
            rgba(0, 0, 0, 0.5) 0%,
            transparent 40%,
            transparent 60%,
            rgba(0, 0, 0, 0.4) 100%);
    opacity: 0;
    transition: opacity 0.2s ease;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 8px;
    gap: 4px;
}

.primary-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    pointer-events: none;
}

.pending-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    pointer-events: none;
}

/* ============================================================ */
/*  Google SEO Preview                                          */
/* ============================================================ */
.seo-preview {
    border: 1px solid rgba(var(--v-border-color), 0.2);
}

.google-preview {
    font-family: 'Arial', sans-serif;
    padding: 12px;
    background: white;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
}

.google-url {
    color: #202124;
    font-size: 0.75rem;
    margin-bottom: 4px;
}

.google-title {
    color: #1a0dab;
    font-size: 1.125rem;
    font-weight: 400;
    line-height: 1.3;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.google-desc {
    color: #4d5156;
    font-size: 0.875rem;
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

/* Dark mode adaptation for Google preview */
:deep(.v-theme--dark) .google-preview {
    background: #202124;
    border-color: #3c4043;
}

:deep(.v-theme--dark) .google-url {
    color: #bdc1c6;
}

:deep(.v-theme--dark) .google-title {
    color: #8ab4f8;
}

:deep(.v-theme--dark) .google-desc {
    color: #bdc1c6;
}
</style>
