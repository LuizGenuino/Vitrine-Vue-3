import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useFeedbackStore = defineStore('feedback', () => {
  const visible = ref(false);
  const message = ref('');
  const color = ref<'success' | 'info' | 'warning' | 'error'>('info');

  function show(text: string, tone: 'success' | 'info' | 'warning' | 'error' = 'info') {
    message.value = text;
    color.value = tone;
    visible.value = true;
  }

  function hide() {
    visible.value = false;
  }

  return { visible, message, color, show, hide };
});
