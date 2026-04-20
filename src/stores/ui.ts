import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { ThemeMode } from '@/types';

const UI_STORAGE_KEY = 'saas-showcase-ui';

type StoredUiState = {
  themeMode?: ThemeMode;
  onboardingDismissed?: boolean;
};

const readStorage = (): StoredUiState => {
  try {
    return JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

export const useUiStore = defineStore('ui', () => {
  const initial = readStorage();
  const themeMode = ref<ThemeMode>(initial.themeMode || 'light');
  const cartDrawerOpen = ref(false);
  const onboardingDismissed = ref(Boolean(initial.onboardingDismissed));

  watch(
    [themeMode, onboardingDismissed],
    ([currentThemeMode, currentOnboardingDismissed]) => {
      localStorage.setItem(
        UI_STORAGE_KEY,
        JSON.stringify({
          themeMode: currentThemeMode,
          onboardingDismissed: currentOnboardingDismissed,
        }),
      );
    },
    { deep: true },
  );

  function toggleTheme() {
    themeMode.value = themeMode.value === 'light' ? 'dark' : 'light';
  }

  function openCartDrawer() {
    cartDrawerOpen.value = true;
  }

  function closeCartDrawer() {
    cartDrawerOpen.value = false;
  }

  function dismissOnboarding() {
    onboardingDismissed.value = true;
  }

  return {
    themeMode,
    cartDrawerOpen,
    onboardingDismissed,
    toggleTheme,
    openCartDrawer,
    closeCartDrawer,
    dismissOnboarding,
  };
});
