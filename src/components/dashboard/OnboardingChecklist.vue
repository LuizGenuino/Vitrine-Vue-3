<script setup lang="ts">
interface Step {
    key: string
    title: string
    description: string
    done: boolean
    action?: { label: string; to: any }
}
defineProps<{ steps: Step[] }>()
defineEmits<{ action: [step: Step] }>()
</script>

<template>
    <div class="d-flex flex-column ga-3">
        <div v-for="step in steps" :key="step.key" class="d-flex align-center ga-4 pa-3 rounded-lg step-row"
            :class="{ 'step-done': step.done }">
            <v-avatar :color="step.done ? 'success' : 'grey-lighten-3'" size="32">
                <v-icon :color="step.done ? 'white' : 'grey'" size="18">
                    {{ step.done ? 'mdi-check' : 'mdi-circle-outline' }}
                </v-icon>
            </v-avatar>

            <div class="flex-grow-1 min-width-0">
                <div class="text-body-2 font-weight-bold"
                    :class="{ 'text-decoration-line-through text-medium-emphasis': step.done }">
                    {{ step.title }}
                </div>
                <div class="text-caption text-medium-emphasis">
                    {{ step.description }}
                </div>
            </div>

            <v-btn v-if="!step.done && step.action" variant="text" size="small" color="primary" class="text-none"
                @click="$emit('action', step)">
                {{ step.action.label }}
            </v-btn>
        </div>
    </div>
</template>

<style scoped>
.step-row {
    transition: background-color .2s;
}

.step-row:hover {
    background-color: rgb(var(--v-theme-surface-variant), .3);
}

.step-done {
    opacity: .7;
}

.min-width-0 {
    min-width: 0;
}
</style>
