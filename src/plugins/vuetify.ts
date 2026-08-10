import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

const initialTheme = localStorage.getItem('vibestore-ui')
  ? JSON.parse(localStorage.getItem('vibestore-ui') || '{}')?.themeMode || 'light'
  : 'light';

export const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
  },
  defaults: {
    VCard: {
      rounded: 'xl',
      elevation: 0,
    },
    VBtn: {
      rounded: 'lg',
      elevation: 0,
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
    VTextarea: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
    VFileInput: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },
  },
  theme: {
    defaultTheme: initialTheme,
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#4F46E5',
          secondary: '#14B8A6',
          surface: '#FFFFFF',
          background: '#F8FAFC',
          'surface-variant': '#E2E8F0',
          error: '#DC2626',
          success: '#16A34A',
          warning: '#D97706',
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: '#818CF8',
          secondary: '#2DD4BF',
          surface: '#111827',
          background: '#020617',
          'surface-variant': '#1E293B',
          error: '#F87171',
          success: '#4ADE80',
          warning: '#FBBF24',
        },
      },
    },
  },
});
