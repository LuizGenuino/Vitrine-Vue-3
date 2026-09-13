/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Declaração direta para impedir que o TS reclame do CSS do Vuetify
declare module 'vuetify/styles' {
  const content: any
  export default content
}