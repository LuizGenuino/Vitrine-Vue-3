<script setup lang="ts">
import { ref } from 'vue'

interface Props {
    maxFiles?: number
    disabled?: boolean
    accept?: string
    maxSizeMb?: number
}
const props = withDefaults(defineProps<Props>(), {
    maxFiles: 10,
    disabled: false,
    accept: 'image/jpeg,image/png,image/webp',
    maxSizeMb: 5,
})

const emit = defineEmits<{
    selectFiles: [files: File[]]
}>()

const isDragging = ref(false)
const inputRef = ref<HTMLInputElement>()

function openPicker() {
    if (!props.disabled) inputRef.value?.click()
}

function handleFiles(files: FileList | null) {
    if (!files || props.disabled) return

    const arr = Array.from(files)
        .filter(f => f.size <= props.maxSizeMb * 1024 * 1024)
        .filter(f => props.accept.split(',').some(t => f.type.match(t.trim().replace('*', '.*'))))
        .slice(0, props.maxFiles)

    if (arr.length) emit('selectFiles', arr)
}

function onDrop(e: DragEvent) {
    e.preventDefault()
    isDragging.value = false
    handleFiles(e.dataTransfer?.files ?? null)
}

function onDragOver(e: DragEvent) {
    e.preventDefault()
    if (!props.disabled) isDragging.value = true
}

function onDragLeave() {
    isDragging.value = false
}

function onFileChange(e: Event) {
    const target = e.target as HTMLInputElement
    handleFiles(target.files)
    target.value = ''
}
</script>

<template>
    <div class="dropzone" :class="{ dragging: isDragging, disabled }" @click="openPicker" @drop="onDrop"
        @dragover="onDragOver" @dragleave="onDragLeave">
        <input ref="inputRef" type="file" :accept="accept" multiple hidden @change="onFileChange">

        <v-icon size="48" :color="isDragging ? 'primary' : 'grey'">
            {{ isDragging ? 'mdi-tray-arrow-down' : 'mdi-cloud-upload-outline' }}
        </v-icon>

        <div class="mt-3 text-body-1 font-weight-medium">
            <template v-if="disabled">
                Limite de imagens atingido
            </template>
            <template v-else-if="isDragging">
                Solte para adicionar
            </template>
            <template v-else>
                Arraste imagens aqui ou <span class="text-primary">clique para selecionar</span>
            </template>
        </div>

        <div class="text-caption text-medium-emphasis mt-1">
            JPG, PNG ou WebP · até {{ maxSizeMb }}MB por arquivo · máx. {{ maxFiles }} imagens
        </div>
    </div>
</template>

<style scoped>
.dropzone {
    border: 2px dashed rgba(var(--v-border-color), 0.3);
    border-radius: 16px;
    padding: 40px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: rgba(var(--v-theme-surface-variant), 0.2);
}

.dropzone:hover:not(.disabled) {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.04);
}

.dropzone.dragging {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
    transform: scale(1.01);
}

.dropzone.disabled {
    cursor: not-allowed;
    opacity: 0.5;
}
</style>
