<script setup lang="ts">
import { useThemeMode } from '@/composables/useThemeMode';
import AppSnackbar from '@/components/base/AppSnackbar.vue';
import { ref, onMounted } from 'vue'
import { supabase } from './utils/supabase';


useThemeMode();

const todos = ref<any[]>([])
async function getTodos() {
    const { data } = await supabase.from('todos').select()
    todos.value = data as any[]
}

onMounted(() => {
    getTodos()
})
</script>

<template>
    <v-app>
        <router-view />
        <AppSnackbar />
    </v-app>
</template>
