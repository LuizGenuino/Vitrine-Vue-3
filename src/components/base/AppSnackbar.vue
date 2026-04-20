<script setup lang="ts">
import { useFeedbackStore } from '@/stores/feedback';

const feedbackStore = useFeedbackStore();
</script>

<template>
  <v-snackbar v-model="feedbackStore.visible" :color="feedbackStore.color" timeout="2800" location="top right">
    {{ feedbackStore.message }}
    <template #actions>
      <v-btn variant="text" @click="feedbackStore.hide">Fechar</v-btn>
    </template>
  </v-snackbar>
</template>
