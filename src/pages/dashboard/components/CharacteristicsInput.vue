<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';

interface InternalRow {
    key: string;
    value: string;
    id: number; // ID único para controle de animação e foco
}

const props = defineProps<{
    label?: string;
    required?: boolean;
    placeholder?: string;
}>();

// Usando defineModel para sincronização automática (Vue 3.4+)
const modelValue = defineModel<string[]>({ default: () => [] });

// --- STATE ---
const localItems = ref<InternalRow[]>([]);
const rowRefs = ref<any[]>([]); // Para controle de foco

// --- LOGIC: Parsing ---
const parseToInternal = (data: string[]): InternalRow[] => {
    return (data || []).map((item, index) => {
        const [key, ...rest] = item.split(':');
        return {
            id: Date.now() + index,
            key: key?.trim() || '',
            value: rest.join(':')?.trim() || ''
        };
    });
};

const syncToExternal = () => {
    const result = localItems.value
        .filter(item => item.key.trim() !== '' || item.value.trim() !== '')
        .map(item => `${item.key.trim()}: ${item.value.trim()}`);

    modelValue.value = result;
};

// --- ACTIONS ---
const addRow = async () => {
    const newId = Date.now();
    localItems.value.push({ id: newId, key: '', value: '' });

    // UX Senior: Auto-foca no campo de nome da nova linha
    await nextTick();
    const inputs = document.querySelectorAll('.char-row-key input');
    (inputs[inputs.length - 1] as HTMLElement)?.focus();
};

const removeRow = (index: number) => {
    localItems.value.splice(index, 1);
    syncToExternal();
};

const handleEnter = (index: number) => {
    if (index === localItems.value.length - 1) {
        addRow();
    }
};

// --- WATCHERS ---
// Sincroniza apenas quando o valor externo muda drasticamente (ex: reset do form)
watch(() => modelValue.value, (newVal) => {
    const currentSerialized = localItems.value
        .filter(i => i.key || i.value)
        .map(i => `${i.key}: ${i.value}`);

    if (JSON.stringify(newVal) !== JSON.stringify(currentSerialized)) {
        localItems.value = parseToInternal(newVal);
    }
}, { deep: true });

onMounted(() => {
    if (modelValue.value.length > 0) {
        localItems.value = parseToInternal(modelValue.value);
    } else if (props.required) {
        addRow();
    }
});
</script>

<template>
    <div class="characteristics-container">
        <div class="d-flex align-center justify-space-between mb-3">
            <div class="d-flex flex-column">
                <span class="text-subtitle-2 font-weight-black">
                    {{ label || 'Especificações Técnicas' }}
                    <span v-if="required" class="text-error">*</span>
                </span>
                <span class="text-caption text-medium-emphasis">
                    Ex: Material, Dimensões, Voltagem...
                </span>
            </div>

            <v-btn prepend-icon="mdi-plus" variant="tonal" size="small" color="primary" rounded="pill" class="text-none"
                @click="addRow">
                Adicionar item
            </v-btn>
        </div>

        <v-slide-y-transition group>
            <div v-for="(item, index) in localItems" :key="item.id" class="char-row d-flex align-start ga-2 mb-2">
                <div class="flex-grow-1">
                    <v-row dense>
                        <v-col cols="5">
                            <v-text-field v-model="item.key" placeholder="Característica" density="compact"
                                variant="outlined" hide-details class="char-row-key" bg-color="surface"
                                @update:model-value="syncToExternal" />
                        </v-col>
                        <v-col cols="7">
                            <v-text-field v-model="item.value" placeholder="Valor/Descrição" density="compact"
                                variant="outlined" hide-details bg-color="surface" @update:model-value="syncToExternal"
                                @keyup.enter="handleEnter(index)" />
                        </v-col>
                    </v-row>
                </div>

                <v-btn icon="mdi-close-circle-outline" variant="text" color="medium-emphasis" size="small" class="mt-1"
                    @click="removeRow(index)" />
            </div>
        </v-slide-y-transition>

        <div v-if="localItems.length === 0" class="empty-state-dashed pa-6 text-center rounded-xl cursor-pointer"
            @click="addRow">
            <v-icon icon="mdi-text-list" color="medium-emphasis" class="mb-2" />
            <div class="text-caption text-medium-emphasis">
                Nenhuma característica adicionada.<br>
                <strong>Clique para adicionar uma nova linha.</strong>
            </div>
        </div>

        <v-alert v-if="required && localItems.length === 0" type="error" variant="tonal" density="compact"
            class="mt-2 text-caption" icon="mdi-alert-circle-outline">
            Pelo menos uma característica é obrigatória para este produto.
        </v-alert>
    </div>
</template>

<style scoped>
.characteristics-container {
    width: 100%;
}

.char-row {
    transition: all 0.3s ease;
}

.empty-state-dashed {
    border: 2px dashed rgba(var(--v-border-color), 0.2);
    transition: all 0.2s ease;
}

.empty-state-dashed:hover {
    background-color: rgba(var(--v-theme-primary), 0.02);
    border-color: rgba(var(--v-theme-primary), 0.4);
}

/* Estilo para focar na linha ativa */
.char-row:focus-within {
    transform: translateX(4px);
}

:deep(.v-field--outlined) {
    border-radius: 8px !important;
}
</style>