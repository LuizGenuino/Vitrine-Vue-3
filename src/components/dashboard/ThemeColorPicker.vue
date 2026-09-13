<script setup lang="ts">
import { ref, computed } from 'vue';

const props = withDefaults(
    defineProps<{
        modelValue: string;
        canEdit?: boolean | null;
        defaultColor?: string;
    }>(),
    {
        canEdit: true,
        defaultColor: '#6366f1',
    }
);

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();

const colorMenu = ref(false);

// Paleta pré-definida curada (Cores corporativas modernas e limpas)
const presetColors = [
    { label: 'Índigo (Padrão)', hex: '#6366f1' },
    { label: 'Esmeralda', hex: '#10b981' },
    { label: 'Âmbar', hex: '#f59e0b' },
    { label: 'Rubi', hex: '#ef4444' },
    { label: 'Rosa Pink', hex: '#ec4899' },
    { label: 'Azul Céu', hex: '#0ea5e9' },
    { label: 'Verde Floresta', hex: '#2e7d32' },
    { label: 'Grafite Escuro', hex: '#1e293b' },
    { label: 'Preto Puro', hex: '#000000' },
];

// Helper computado para leitura e escrita segura com o v-model
const currentColor = computed({
    get: () => props.modelValue || props.defaultColor,
    set: (val: string) => {
        let formatted = val.trim();
        if (formatted && !formatted.startsWith('#')) {
            formatted = `#${formatted}`;
        }
        emit('update:modelValue', formatted);
    },
});

// Validação de formato Hexadecimal
const isValidHex = computed(() => {
    return /^#([0-9A-Fa-f]{3}){1,2}$/.test(currentColor.value);
});

// Calcula se a cor de fundo é escura para alternar o ícone de check entre branco e preto
function isDarkColor(hex: string): boolean {
    const c = hex.replace('#', '');
    if (c.length !== 6 && c.length !== 3) return true;
    const fullHex = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
    const r = parseInt(fullHex.substring(0, 2), 16);
    const g = parseInt(fullHex.substring(2, 4), 16);
    const b = parseInt(fullHex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 140;
}

function selectPreset(hex: string) {
    if (!props.canEdit) return;
    currentColor.value = hex;
}

function resetToDefault() {
    if (!props.canEdit) return;
    currentColor.value = props.defaultColor;
}
</script>

<template>
    <v-col cols="12" class="pa-0">
        <v-divider class="my-4" />

        <!-- CABEÇALHO DO BLOCO -->
        <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
            <div>
                <div class="text-subtitle-1 font-weight-black text-high-emphasis leading-none">
                    Cor de Destaque
                </div>
                <p class="text-caption text-medium-emphasis mb-0 mt-1">
                    Personalize a identidade visual dos botões, badges e elementos de destaque da sua vitrine.
                </p>
            </div>

            <!-- BOTÃO DE RESTAURAR PADRÃO -->
            <v-btn v-if="canEdit && currentColor.toLowerCase() !== defaultColor.toLowerCase()" variant="text"
                color="primary" size="small" prepend-icon="mdi-restore" class="text-none font-weight-bold"
                @click="resetToDefault">
                Restaurar padrão
            </v-btn>
        </div>

        <!-- ÁREA DE CONTROLES -->
        <v-card border flat rounded="xl" class="pa-4 bg-surface">
            <div class="d-flex flex-column flex-md-row align-start align-md-center justify-space-between ga-4">

                <!-- SELEÇÃO DIRETA (PREVIEW + INPUT + POPUP COLOR PICKER) -->
                <div class="d-flex align-center ga-3 flex-wrap">

                    <!-- MENU COM O COLOR PICKER COMPLETO DO VUETIFY -->
                    <v-menu v-model="colorMenu" :close-on-content-click="false" location="bottom start" offset="8"
                        :disabled="!canEdit">
                        <template v-slot:activator="{ props: menuProps }">
                            <div v-bind="menuProps" class="color-preview-box cursor-pointer position-relative shadow-sm"
                                :style="{ background: isValidHex ? currentColor : '#e2e8f0' }"
                                :title="canEdit ? 'Clique para abrir o seletor completo' : ''">
                                <div class="preview-overlay d-flex align-center justify-center">
                                    <v-icon icon="mdi-eyedropper" size="18"
                                        :color="isDarkColor(currentColor) ? 'white' : 'black'" />
                                </div>
                            </div>
                        </template>

                        <!-- PALETA AVANÇADA DE CORES (V-COLOR-PICKER) -->
                        <v-card rounded="xl" elevation="10" class="pa-2">
                            <v-color-picker v-model="currentColor" mode="hex" hide-canvas-input show-swatches
                                elevation="0" swatches-max-height="120" />
                        </v-card>
                    </v-menu>

                    <!-- CAMPO TEXTUAL PARA DIGITAÇÃO DIRETA DO HEX -->
                    <v-text-field v-model="currentColor" label="Código HEX" placeholder="#000000" variant="outlined"
                        density="comfortable" hide-details rounded="lg" style="width: 170px" :readonly="!canEdit"
                        prepend-inner-icon="mdi-pound" :error="!isValidHex" class="text-mono" />
                </div>

                <!-- PALETA RÁPIDA DE CORES RECOMENDADAS (SWATCHES) -->
                <div class="d-flex flex-column ga-2 w-100 w-md-auto">
                    <span class="text-caption font-weight-bold text-medium-emphasis uppercase tracking-wider">
                        Cores Recomendadas
                    </span>

                    <div class="d-flex align-center ga-2 flex-wrap">
                        <button v-for="swatch in presetColors" :key="swatch.hex" type="button" class="color-swatch-btn"
                            :style="{ background: swatch.hex }" :disabled="!canEdit" :title="swatch.label"
                            @click="selectPreset(swatch.hex)">
                            <!-- Ícone de Check se estiver ativo -->
                            <v-fade-transition>
                                <v-icon v-if="currentColor.toLowerCase() === swatch.hex.toLowerCase()" icon="mdi-check"
                                    size="16" :color="isDarkColor(swatch.hex) ? 'white' : 'black'" />
                            </v-fade-transition>
                        </button>
                    </div>
                </div>

            </div>

            <!-- DEMONSTRAÇÃO VISUAL EM TEMPO REAL (MOCKUP PREVIEW) -->
            <div class="mt-4 pt-3 border-t">
                <span class="text-caption text-disabled font-weight-medium d-block mb-2">
                    Pré-visualização dos componentes com a cor escolhida:
                </span>

                <div class="d-flex align-center ga-3 flex-wrap">
                    <!-- Botão Primário de Exemplo -->
                    <v-btn size="small" rounded="pill" flat class="text-none font-weight-bold text-white px-4"
                        :style="{ background: isValidHex ? currentColor : defaultColor }">
                        Botão Principal
                    </v-btn>

                    <!-- Chip / Badge de Exemplo -->
                    <v-chip size="small" variant="tonal" class="font-weight-black" :style="{
                        color: isValidHex ? currentColor : defaultColor,
                        backgroundColor: `${isValidHex ? currentColor : defaultColor}1A`
                    }">
                        Tag em Destaque
                    </v-chip>

                    <!-- Texto de Exemplo -->
                    <span class="text-body-2 font-weight-black"
                        :style="{ color: isValidHex ? currentColor : defaultColor }">
                        R$ 125.000,00
                    </span>
                </div>
            </div>
        </v-card>
    </v-col>
</template>

<style scoped>
.leading-none {
    line-height: 1 !important;
}

.uppercase {
    text-transform: uppercase;
}

.tracking-wider {
    letter-spacing: 0.5px !important;
}

.text-mono :deep(input) {
    font-family: monospace;
    font-weight: 700;
    text-transform: uppercase;
}

/* Caixa de Pré-visualização com Ícone */
.color-preview-box {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: 2px solid rgba(var(--v-border-color), 0.15);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    overflow: hidden;
}

.color-preview-box:hover {
    transform: scale(1.05);
}

.preview-overlay {
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.1);
    opacity: 0;
    transition: opacity 0.2s ease;
}

.color-preview-box:hover .preview-overlay {
    opacity: 1;
}

/* Botões da Paleta Rápida (Swatches) */
.color-swatch-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.color-swatch-btn:hover:not(:disabled) {
    transform: scale(1.15);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}

.color-swatch-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}
</style>