<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(
    defineProps<{
        modelValue?: string[];
        max?: number;
        label?: string;
    }>(),
    {
        modelValue: () => [],
        max: 1,
        label: 'Arraste imagens ou clique para selecionar',
    },
);

const emit = defineEmits<{
    (event: 'select-files', files: File[]): void;
    (event: 'remove', index: number): void;
}>();

const dragging = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

const previews = computed(() => props.modelValue || []);

function handleFiles(files: FileList | null) {
    if (!files) return;
    emit('select-files', Array.from(files).slice(0, props.max));
}
</script>

<template>
    <div>
        <div class="dropzone rounded-xl pa-6 text-center" :class="{ 'is-active': dragging }"
            @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false"
            @drop.prevent="dragging = false; handleFiles($event.dataTransfer?.files || null)"
            @click="inputRef?.click()">
            <div class="text-body-1 font-weight-medium">{{ label }}</div>
            <div class="text-body-2 text-medium-emphasis mt-2">Até {{ max }} arquivo(s), com preview imediato.</div>
            <input ref="inputRef" class="d-none" type="file" multiple accept="image/*"
                @change="handleFiles(($event.target as HTMLInputElement).files)" />
        </div>

        <v-row class="mt-4" dense>
            <v-col v-for="(image, index) in previews" :key="`${image}-${index}`" cols="6" md="3">
                <v-card rounded="lg" variant="outlined">
                    <v-img :src="image" height="120" cover />
                    <div class="pa-2 d-flex justify-end">
                        <v-btn size="small" variant="text" color="error"
                            @click.stop="emit('remove', index)">Remover</v-btn>
                    </div>
                </v-card>
            </v-col>
        </v-row>
    </div>
</template>
