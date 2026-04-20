import { computed, watchEffect } from 'vue';
import { useTheme } from 'vuetify';
import { useUiStore } from '@/stores/ui';

export const useThemeMode = () => {
  const theme = useTheme();
  const uiStore = useUiStore();

  watchEffect(() => {
    theme.global.name.value = uiStore.themeMode;
    document.documentElement.dataset.theme = uiStore.themeMode;
  });

  return {
    themeMode: computed(() => uiStore.themeMode),
    isDark: computed(() => uiStore.themeMode === 'dark'),
    toggleTheme: uiStore.toggleTheme,
  };
};
