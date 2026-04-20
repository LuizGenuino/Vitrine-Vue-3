# Vitrine SaaS V3

Aplicação Vue 3 + TypeScript + Vuetify 3 + Firebase com arquitetura escalável para criação de vitrines digitais e mini e-commerces com checkout simplificado via WhatsApp.

## Stack

- Vue 3 com Composition API
- TypeScript
- Vuetify 3
- Pinia
- Vue Router
- Firebase Auth, Firestore, Storage e Hosting

## O que a versão 3 adiciona

- camada SaaS preparada para monetização por assinatura
- plano gratuito ativo por padrão
- catálogo orientado por limite de produtos conforme plano
- página de planos pronta para futura integração com checkout recorrente
- resumo de uso do plano no dashboard e no cadastro de produtos
- feedback global com snackbar
- landing atualizada com posicionamento de produto mais maduro

## Estrutura

```bash
src/
  components/
    base/
    dashboard/
    public/
  composables/
  layouts/
  pages/
    auth/
    dashboard/
    public/
  router/
  services/
  stores/
  types/
  utils/
```

## Rodando o projeto

```bash
npm install
cp .env.example .env
npm run dev
```

## Build de produção

```bash
npm run build
```

## Deploy no Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc
npm run build
firebase deploy
```

## Collections do Firestore

- `stores`
- `categories`
- `subcategories`
- `products`
- `orderIntents`

## Estrutura sugerida de uploads no Storage

- `/{ownerId}/logos/*`
- `/{ownerId}/banners/*`
- `/{ownerId}/products/*`

## Camada SaaS preparada

- `free`: até 25 produtos e funcionamento atual da vitrine
- `starter`: até 100 produtos, pronto para checkout futuro
- `growth`: até 500 produtos
- `scale`: praticamente ilimitado

## Arquivos de infraestrutura incluídos

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`
- `.firebaserc.example`
