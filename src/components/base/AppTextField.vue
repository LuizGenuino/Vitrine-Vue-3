<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import {
    formatMask,
    maskRules,
    type InputMaskType,
} from '@/composables/useInputMask'

defineOptions({
    inheritAttrs: false,
})

const props = defineProps<{
    modelValue?: string
    mask?: InputMaskType
}>()

const emit = defineEmits<{
    'update:modelValue': [value: string]
}>()

const attrs = useAttrs()

const inputValue = computed({
    get: () => props.modelValue ?? '',

    set: (value: string) => {
        if (!props.mask) {
            emit('update:modelValue', value)
            return
        }

        emit(
            'update:modelValue',
            formatMask(props.mask, value),
        )
    },
})

const rules = computed<any>(() => {
  if (!props.mask) {
    return attrs.rules
  }

  return [
        ...(Array.isArray(attrs.rules) ? attrs.rules : []),
    ...maskRules[props.mask],
  ]
})
</script>

<template>
    <v-text-field v-bind="attrs" v-model="inputValue"  :rules="rules">
        <template v-for="(_, slot) in $slots" #[slot]="slotProps">
            <slot :name="slot" v-bind="slotProps" />
        </template>
    </v-text-field>
</template>