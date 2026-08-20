<script setup lang="ts">
import { useThemeMode } from '@/composables/useThemeMode';


useThemeMode();

</script>

<template>
    <v-app>
        <router-view />
    </v-app>
</template>
