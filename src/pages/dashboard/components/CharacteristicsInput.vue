<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';

interface InternalRow {
    key: string;
    value: string;
}

const props = defineProps<{
    label?: string;
    required?: boolean;
    modelValue: string[]; // Ex: ["Cor: Vermelho", "Tamanho: G"]
}>();

const emit = defineEmits(['update:modelValue']);

// --- STATE ---
const localItems = ref<InternalRow[]>([]);

// --- LOGIC: Parsing ---
// Transforma ["A: B"] em [{ key: 'A', value: 'B' }]
const parseIncoming = (data: string[]): InternalRow[] => {
    if (!data || data.length === 0) return [];
    return data.map(item => {
        const [key, ...rest] = item.split(':');
        return {
            key: key?.trim() || '',
            value: rest.join(':')?.trim() || '' // join(':') caso o valor contenha ":"
        };
    });
};

// Transforma [{ key: 'A', value: 'B' }] em ["A: B"]
const emitUpdate = () => {
    const result = localItems.value
        .filter(item => item.key.trim() !== '' || item.value.trim() !== '')
        .map(item => `${item.key.trim()}: ${item.value.trim()}`);

    emit('update:modelValue', result);
};

// --- ACTIONS ---
const addRow = () => {
    const lastRow = localItems.value[localItems.value.length - 1];

    // Regra: Se tiver linha em branco (chave ou valor vazios), não adiciona outra
    if (lastRow && (lastRow.key.trim() === '' || lastRow.value.trim() === '')) {
        return;
    }

    localItems.value.push({ key: '', value: '' });
};

const removeRow = (index: number) => {
    localItems.value.splice(index, 1);
    emitUpdate();
};

// --- VALIDATION ---
const rules = {
    required: (v: any) => !props.required || localItems.value.length > 0 || 'Adicione ao menos uma característica',
    field: (v: string) => !props.required || !!v || 'Campo obrigatório'
};

// --- LIFECYCLE / WATCHERS ---
onMounted(() => {
    if (props.modelValue && props.modelValue.length > 0) {
        localItems.value = parseIncoming(props.modelValue);
    } else {
        // Se for novo e obrigatório, já começa com uma linha
        if (props.required) addRow();
    }
});

// Watch para mudanças externas (edit form)
watch(() => props.modelValue, (newVal) => {
    const parsed = parseIncoming(newVal);
    // Só atualiza se for realmente diferente para evitar loops de reatividade
    if (JSON.stringify(parsed) !== JSON.stringify(localItems.value)) {
        localItems.value = parsed;
    }
}, { deep: true });
</script>

<template>
    <div class="characteristics-input">
        <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-subtitle-2 font-weight-bold">
                {{ label || 'Características' }}
                <span v-if="required" class="text-error">*</span>
            </span>

            <v-btn prepend-icon="mdi-plus" variant="tonal" size="small" color="primary" @click="addRow">
                Adicionar
            </v-btn>
        </div>

        <v-alert v-if="required && localItems.length === 0" type="warning" variant="tonal" density="compact"
            class="mb-4">
            É necessário informar ao menos uma característica.
        </v-alert>

        <v-row v-for="(item, index) in localItems" :key="index" dense align="start" class="mb-2">
            <v-col cols="5">
                <v-text-field v-model="item.key" placeholder="Ex: Cor" label="Característica" density="compact"
                    variant="outlined" hide-details="auto" :rules="[rules.field]" @update:model-value="emitUpdate" />
            </v-col>
            <v-col cols="5">
                <v-text-field v-model="item.value" placeholder="Ex: Vermelho" label="Valor" density="compact"
                    variant="outlined" hide-details="auto" :rules="[rules.field]" @update:model-value="emitUpdate" />
            </v-col>
            <v-col cols="2" class="d-flex justify-center pt-2">
                <v-btn icon="mdi-delete" variant="text" color="error" size="small" @click="removeRow(index)" />
            </v-col>
        </v-row>
    </div>
</template>

<style scoped>
.characteristics-input {
    width: 100%;
}
</style>