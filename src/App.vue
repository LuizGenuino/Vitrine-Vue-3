<script setup lang="ts">
import { useThemeMode } from '@/composables/useThemeMode';
import AppSnackbar from '@/components/base/AppSnackbar.vue';


useThemeMode();

</script>

<template>
    <v-app>
        <router-view />
        <AppSnackbar />
    </v-app>
</template>
