import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

// Leitura segura do localStorage
const getInitialTheme = (): string => {
    try {
        const stored = localStorage.getItem('vibestore-ui');
        if (stored) {
            const parsed = JSON.parse(stored);
            return parsed?.themeMode || 'light';
        }
    } catch (error) {
        console.warn('Erro ao ler tema do localStorage, usando "light" como padrão:', error);
    }
    return 'light';
};

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
        defaultTheme: getInitialTheme(),
        themes: {
            light: {
                dark: false,
                colors: {
                    primary: '#064E3B',
                    secondary: '#10B981',
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