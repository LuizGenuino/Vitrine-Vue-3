<script setup lang="ts">
import { useThemeMode } from '@/composables/useThemeMode';
import { useLoadingDialog } from './composables/useLoadingDialog';

const { loading, title, text } = useLoadingDialog()
useThemeMode();

</script>

<template>
    <v-app>
        <router-view />
    </v-app>
    <v-dialog v-model="loading" persistent width="auto">
        <v-card class="pa-4 rounded-lg text-center" elevation="4" min-width="280">
            <v-card-text class="d-flex flex-column align-center justify-center pt-4 pb-2">
                <h3 v-if="title" class="text-h6 font-weight-bold text-high-emphasis mb-1">
                    {{ title }}
                </h3>

                <v-progress-circular indeterminate color="info" size="64" width="5" class="my-4"></v-progress-circular>
                <p v-if="text" class="text-body-2 text-medium-emphasis mb-0">
                    {{ text }}
                </p>

            </v-card-text>
        </v-card>
    </v-dialog>
</template>
