<script setup lang="ts">
import { ref, computed, nextTick, watch, useTemplateRef } from 'vue'

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface Attribute {
    name: string
    value: string
}

interface InternalRow extends Attribute {
    id: string
}

interface Props {
    label?: string
    hint?: string
    required?: boolean
    placeholderKey?: string
    placeholderValue?: string
    maxItems?: number
    suggestions?: string[]
}

const props = withDefaults(defineProps<Props>(), {
    label: 'Atributos',
    hint: 'Adicione especificações técnicas (Material, Cor, Dimensões...)',
    required: false,
    placeholderKey: 'Ex: Material',
    placeholderValue: 'Ex: Algodão 100%',
    maxItems: 30,
    suggestions: () => [
        'Material', 'Cor', 'Tamanho', 'Peso', 'Dimensões',
        'Voltagem', 'Marca', 'Modelo', 'Fabricante',
        'Origem', 'Garantia', 'Composição', 'Capacidade',
        'Potência', 'Conexão', 'Idioma',
    ],
})

/* -------------------------------------------------------------------------- */
/*  v-model                                                                   */
/* -------------------------------------------------------------------------- */

const modelValue = defineModel<Attribute[]>({ default: () => [] })

/* -------------------------------------------------------------------------- */
/*  Estado interno                                                            */
/* -------------------------------------------------------------------------- */

const rows = ref<InternalRow[]>([])
const containerRef = useTemplateRef<HTMLDivElement>('container')

// Bandeira para evitar loop no watcher enquanto sincronizamos
let syncingFromExternal = false

/* -------------------------------------------------------------------------- */
/*  Sincronização bidirecional                                                */
/* -------------------------------------------------------------------------- */

/** Do modelo externo → estado interno (só quando o array externo é substituído) */
function hydrateFromModel() {
    syncingFromExternal = true
    rows.value = (modelValue.value ?? []).map(attr => ({
        id: crypto.randomUUID(),
        name: attr.name ?? '',
        value: attr.value ?? '',
    }))
    nextTick(() => { syncingFromExternal = false })
}

/** Do estado interno → modelo externo (só linhas não vazias) */
function syncToModel() {
    if (syncingFromExternal) return
    modelValue.value = rows.value
        .filter(r => r.name.trim() || r.value.trim())
        .map(r => ({ name: r.name.trim(), value: r.value.trim() }))
}

// Sincroniza quando o pai substitui o array (ex: abrir dialog em modo edição)
watch(
    modelValue,
    (newVal) => {
        // Só re-hidrata se o array externo diferir semanticamente do interno
        const externalSerialized = JSON.stringify(newVal ?? [])
        const internalSerialized = JSON.stringify(
            rows.value
                .filter(r => r.name.trim() || r.value.trim())
                .map(r => ({ name: r.name.trim(), value: r.value.trim() })),
        )
        if (externalSerialized !== internalSerialized) hydrateFromModel()
    },
    { immediate: true, deep: true },
)

// Sincroniza sempre que o estado interno muda
watch(rows, () => syncToModel(), { deep: true })

/* -------------------------------------------------------------------------- */
/*  Ações                                                                     */
/* -------------------------------------------------------------------------- */

async function addRow() {
    if (rows.value.length >= props.maxItems) return
    rows.value.push({
        id: crypto.randomUUID(),
        name: '',
        value: '',
    })

    // foco na chave da nova linha
    await nextTick()
    const inputs = containerRef.value?.querySelectorAll<HTMLInputElement>(
        '.char-row-key input',
    )
    if (inputs?.length) inputs[inputs.length - 1].focus()
}

function removeRow(id: string) {
    rows.value = rows.value.filter(r => r.id !== id)
}

function moveRow(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= rows.value.length) return
    const clone = [...rows.value]
    const [moved] = clone.splice(index, 1)
    clone.splice(target, 0, moved)
    rows.value = clone
}

async function onValueEnter(index: number) {
    // Enter na última linha cria uma nova
    if (index === rows.value.length - 1) {
        await addRow()
    } else {
        // pula para a próxima linha
        await nextTick()
        const nextRow = containerRef.value?.querySelectorAll<HTMLInputElement>(
            '.char-row-key input',
        )?.[index + 1]
        nextRow?.focus()
    }
}

function clearAll() {
    rows.value = []
}

/* -------------------------------------------------------------------------- */
/*  Detecção de duplicatas                                                    */
/* -------------------------------------------------------------------------- */

const duplicateIds = computed(() => {
    const seen = new Map<string, string>()
    const dups = new Set<string>()

    for (const row of rows.value) {
        const key = row.name.trim().toLowerCase()
        if (!key) continue
        if (seen.has(key)) {
            dups.add(seen.get(key)!)
            dups.add(row.id)
        } else {
            seen.set(key, row.id)
        }
    }
    return dups
})

const hasDuplicates = computed(() => duplicateIds.value.size > 0)

const validRowsCount = computed(
    () => rows.value.filter(r => r.name.trim() && r.value.trim()).length,
)

const isAtMax = computed(() => rows.value.length >= props.maxItems)

/* -------------------------------------------------------------------------- */
/*  Sugestões contextuais (excluir já usadas)                                 */
/* -------------------------------------------------------------------------- */

const usedNames = computed(() =>
    new Set(rows.value.map(r => r.name.trim().toLowerCase()).filter(Boolean)),
)

const availableSuggestions = computed(() =>
    props.suggestions.filter(s => !usedNames.value.has(s.toLowerCase())),
)

function applySuggestion(suggestion: string) {
    // Preenche primeira linha vazia, ou cria nova
    const emptyRow = rows.value.find(r => !r.name.trim())
    if (emptyRow) {
        emptyRow.name = suggestion
    } else if (!isAtMax.value) {
        rows.value.push({
            id: crypto.randomUUID(),
            name: suggestion,
            value: '',
        })
    }

    // foco no value da linha correspondente
    nextTick(() => {
        const rowIndex = rows.value.findIndex(
            r => r.name === suggestion && !r.value,
        )
        if (rowIndex >= 0) {
            const valInputs = containerRef.value?.querySelectorAll<HTMLInputElement>(
                '.char-row-value input',
            )
            valInputs?.[rowIndex]?.focus()
        }
    })
}

/* -------------------------------------------------------------------------- */
/*  Auto-add primeira linha se required + vazio                               */
/* -------------------------------------------------------------------------- */

watch(
    () => rows.value.length,
    (len) => {
        if (props.required && len === 0) {
            // aguarda o hydrate inicial terminar
            nextTick(() => {
                if (rows.value.length === 0) addRow()
            })
        }
    },
)
</script>

<template>
    <div ref="container" class="characteristics-container">

        <!-- ===== HEADER ===== -->
        <div class="d-flex align-start justify-space-between mb-3 flex-wrap ga-2">
            <div class="min-width-0">
                <div class="text-subtitle-2 font-weight-bold d-flex align-center ga-2">
                    {{ label }}
                    <span v-if="required" class="text-error">*</span>
                    <v-chip v-if="validRowsCount > 0" size="x-small" variant="tonal" color="primary">
                        {{ validRowsCount }}
                    </v-chip>
                </div>
                <div class="text-caption text-medium-emphasis">{{ hint }}</div>
            </div>

            <div class="d-flex ga-1">
                <v-btn v-if="rows.length > 1" variant="text" size="small" color="error" class="text-none"
                    prepend-icon="mdi-broom" @click="clearAll">
                    Limpar
                </v-btn>
                <v-btn prepend-icon="mdi-plus" variant="tonal" size="small" color="primary" rounded="pill"
                    class="text-none" :disabled="isAtMax" @click="addRow">
                    Adicionar
                </v-btn>
            </div>
        </div>

        <!-- ===== SUGESTÕES (chips clicáveis) ===== -->
        <div v-if="availableSuggestions.length" class="suggestion-chips mb-3">
            <span class="text-caption text-medium-emphasis mr-2">Sugestões:</span>
            <v-chip v-for="suggestion in availableSuggestions.slice(0, 8)" :key="suggestion" size="x-small"
                variant="outlined" color="primary" class="cursor-pointer suggestion-chip" prepend-icon="mdi-plus"
                @click="applySuggestion(suggestion)">
                {{ suggestion }}
            </v-chip>
        </div>

        <!-- ===== LISTA DE LINHAS ===== -->
        <v-slide-y-transition group tag="div" class="rows-wrapper">
            <div v-for="(item, index) in rows" :key="item.id" class="char-row"
                :class="{ 'has-error': duplicateIds.has(item.id) }">
                <!--  Reorder handle (só aparece em >= sm)  -->
                <div class="reorder-controls hidden-xs">
                    <v-btn icon="mdi-chevron-up" variant="text" size="x-small" density="compact" :disabled="index === 0"
                        @click="moveRow(index, -1)" />
                    <v-btn icon="mdi-chevron-down" variant="text" size="x-small" density="compact"
                        :disabled="index === rows.length - 1" @click="moveRow(index, 1)" />
                </div>

                <!--  Inputs  -->
                <div class="flex-grow-1">
                    <v-row dense>
                        <v-col cols="12" sm="5">
                            <v-text-field v-model="item.name" :placeholder="placeholderKey" density="compact"
                                variant="outlined" hide-details class="char-row-key" :error="duplicateIds.has(item.id)">
                                <template #prepend-inner>
                                    <v-icon size="16" color="medium-emphasis">mdi-tag-outline</v-icon>
                                </template>
                            </v-text-field>
                        </v-col>
                        <v-col cols="12" sm="7">
                            <v-text-field v-model="item.value" :placeholder="placeholderValue" density="compact"
                                variant="outlined" hide-details class="char-row-value"
                                @keyup.enter="onValueEnter(index)" />
                        </v-col>
                    </v-row>
                </div>

                <!--  Remove  -->
                <v-btn icon="mdi-close" variant="text" color="medium-emphasis" size="small" class="remove-btn"
                    @click="removeRow(item.id)" />
            </div>
        </v-slide-y-transition>

        <!-- ===== EMPTY STATE ===== -->
        <div v-if="rows.length === 0" class="empty-state pa-6 text-center rounded-xl cursor-pointer" @click="addRow">
            <v-icon size="32" color="grey" class="mb-2">mdi-format-list-bulleted-type</v-icon>
            <div class="text-body-2 font-weight-medium">
                Nenhum atributo adicionado
            </div>
            <div class="text-caption text-medium-emphasis mt-1">
                Clique aqui ou use as sugestões acima para começar
            </div>
        </div>

        <!-- ===== FEEDBACK ===== -->
        <v-alert v-if="hasDuplicates" type="warning" variant="tonal" density="compact" rounded="lg" class="mt-3"
            icon="mdi-alert-outline">
            <div class="text-caption">
                Você tem atributos com o mesmo nome. Considere consolidá-los ou renomear.
            </div>
        </v-alert>

        <v-alert v-if="required && validRowsCount === 0 && rows.length > 0" type="error" variant="tonal"
            density="compact" rounded="lg" class="mt-3" icon="mdi-alert-circle-outline">
            <div class="text-caption">
                Pelo menos um atributo preenchido (nome + valor) é obrigatório.
            </div>
        </v-alert>

        <v-alert v-if="isAtMax" type="info" variant="tonal" density="compact" rounded="lg" class="mt-3"
            icon="mdi-information-outline">
            <div class="text-caption">
                Limite de <strong>{{ maxItems }}</strong> atributos atingido.
            </div>
        </v-alert>
    </div>
</template>

<style scoped>
.characteristics-container {
    width: 100%;
}

.min-width-0 {
    min-width: 0;
}

.cursor-pointer {
    cursor: pointer;
}

/* ================== Suggestion chips ================== */
.suggestion-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: rgba(var(--v-theme-primary), 0.03);
    border-radius: 10px;
    border: 1px dashed rgba(var(--v-theme-primary), 0.2);
}

.suggestion-chip {
    transition: all 0.15s ease;
}

.suggestion-chip:hover {
    transform: translateY(-1px);
    background: rgba(var(--v-theme-primary), 0.08) !important;
}

/* ================== Rows wrapper ================== */
.rows-wrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.char-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px;
    border-radius: 10px;
    transition: all 0.2s ease;
}

.char-row:hover {
    background: rgba(var(--v-theme-surface-variant), 0.4);
}

.char-row.has-error {
    background: rgba(var(--v-theme-warning), 0.06);
}

.char-row.has-error .char-row-key :deep(.v-field) {
    border-color: rgb(var(--v-theme-warning));
}

/* ================== Reorder ================== */
.reorder-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 2px;
    gap: 0;
    opacity: 0.35;
    transition: opacity 0.15s ease;
}

.char-row:hover .reorder-controls {
    opacity: 1;
}

.remove-btn {
    margin-top: 2px;
    opacity: 0.5;
    transition: opacity 0.15s ease;
}

.char-row:hover .remove-btn {
    opacity: 1;
}

/* ================== Inputs ================== */
:deep(.v-field--variant-outlined .v-field__outline) {
    --v-field-border-opacity: 0.15;
}

.char-row-key :deep(.v-field) {
    background: rgba(var(--v-theme-surface-variant), 0.3);
}

.char-row-key :deep(.v-field--focused) {
    background: rgb(var(--v-theme-surface));
}

/* ================== Empty state ================== */
.empty-state {
    border: 2px dashed rgba(var(--v-border-color), 0.25);
    background: rgba(var(--v-theme-surface-variant), 0.2);
    transition: all 0.2s ease;
}

.empty-state:hover {
    border-color: rgba(var(--v-theme-primary), 0.5);
    background: rgba(var(--v-theme-primary), 0.03);
    transform: translateY(-1px);
}

/* ================== Responsivo ================== */
@media (max-width: 599px) {
    .char-row {
        flex-wrap: wrap;
    }

    .remove-btn {
        margin-left: auto;
    }
}
</style>
