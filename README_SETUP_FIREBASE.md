# README_SETUP_FIREBASE

Guia completo para configurar o Firebase no projeto **saas-showcase** com Firestore, Storage, regras, índices, bootstrap inicial e custom claims.

---

## Visão geral

Este projeto usa:

- **Firebase Authentication** para login
- **Cloud Firestore** para dados do SaaS e catálogo
- **Cloud Storage** para logos, banners e imagens de produto
- **Firebase Security Rules** para controle de acesso
- **Firebase Admin SDK** para bootstrap inicial e configuração de custom claims

A configuração está preparada para dois cenários ao mesmo tempo:

1. **Compatibilidade com a V3 atual**
2. **Base pronta para a versão final multi-tenant do SaaS**

Para entender a modelagem de dados e permissões, consulte também `FIREBASE_SAAS_MODELAGEM.md`.

---

## Pré-requisitos

Antes de começar, você precisa ter:

- **Node.js 20+** recomendado
- **npm** instalado
- conta no **Firebase**
- projeto criado no **Firebase Console**
- **Cloud Firestore** habilitado
- **Cloud Storage** habilitado
- **Firebase CLI** instalada globalmente
- uma **Service Account** do Google Cloud/Firebase para uso com Admin SDK

Instale a Firebase CLI:

```bash
npm install -g firebase-tools
```

A Firebase CLI é a forma recomendada de publicar regras e configurações do projeto. O Firebase também documenta o deploy seletivo de regras e recursos via CLI [Firebase](https://firebase.google.com/docs/rules/manage-deploy).

---

## Estrutura de arquivos esperada

Confirme que estes arquivos existem no projeto:

```bash
firebase.json
firestore.rules
firestore.indexes.json
storage.rules
.env.example
README_SETUP_FIREBASE.md
FIREBASE_SAAS_MODELAGEM.md
scripts/
  set-custom-claims.mjs
  bootstrap-firebase.mjs
```

Se os scripts ainda não estiverem no projeto, copie os arquivos criados anteriormente para a pasta `scripts/`.

---

## Instalação das dependências

Dentro da pasta do projeto:

```bash
npm install
npm install firebase-admin
```

Se quiser persistir o Admin SDK no projeto, adicione `firebase-admin` ao `package.json`.

---

## Variáveis de ambiente do frontend

Crie um arquivo `.env` na raiz do projeto com base no `.env.example`:

```bash
cp .env.example .env
```

Preencha com as credenciais do seu app web Firebase:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Essas variáveis são usadas pelo frontend em `src/services/firebase.ts`.

### Onde encontrar esses dados

No Firebase Console:

**Project Settings → General → Your apps → Web app config**

---

## Credencial do Admin SDK

Os scripts Node.js que usam `firebase-admin` precisam de credenciais privilegiadas.

### Como obter a Service Account

No Firebase Console / Google Cloud:

- acesse as configurações do projeto
- abra a área de **Service Accounts**
- gere uma nova chave JSON
- salve o arquivo em local seguro

### Configurar a variável `GOOGLE_APPLICATION_CREDENTIALS`

#### Linux / macOS

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/caminho/para/service-account.json"
```

#### Windows PowerShell

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\caminho\para\service-account.json"
```

> **Importante:** nunca versionar a service account no Git.

---

## Configuração do Firebase CLI

### 1. Login

```bash
firebase login
```

Ou, se tiver criado o script no `package.json`:

```bash
npm run firebase:login
```

### 2. Vincular o projeto local ao projeto Firebase

```bash
firebase use --add
```

Ou:

```bash
npm run firebase:use
```

Escolha o projeto correto e salve o alias.

---

## `firebase.json`

O arquivo `firebase.json` deve apontar para os arquivos de regras e índices:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

---

## Scripts recomendados no `package.json`

Adicione os scripts abaixo ao `package.json` para facilitar sua rotina:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",

    "firebase:login": "firebase login",
    "firebase:use": "firebase use --add",

    "firebase:deploy": "firebase deploy",
    "firebase:deploy:firestore": "firebase deploy --only firestore",
    "firebase:deploy:rules": "firebase deploy --only firestore:rules",
    "firebase:deploy:indexes": "firebase deploy --only firestore",
    "firebase:deploy:storage": "firebase deploy --only storage",
    "firebase:deploy:security": "firebase deploy --only firestore,storage",

    "firebase:claims": "node scripts/set-custom-claims.mjs",
    "firebase:bootstrap": "node scripts/bootstrap-firebase.mjs"
  }
}
```

O Firebase documenta o deploy seletivo de regras do Firestore e Storage com CLI, e a publicação dos índices a partir do arquivo local do Firestore [Firebase](https://firebase.google.com/docs/rules/manage-deploy) [firebase.google.com](https://firebase.google.com/docs/firestore/query-data/indexing).

---

## Ordem correta de execução

Esta é a ordem recomendada para configurar tudo sem quebrar o projeto.

### Etapa 1 — instalar dependências

```bash
npm install
npm install firebase-admin
```

### Etapa 2 — configurar `.env`

```bash
cp .env.example .env
```

Preencha as variáveis `VITE_FIREBASE_*`.

### Etapa 3 — configurar credenciais do Admin SDK

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/caminho/para/service-account.json"
```

### Etapa 4 — autenticar e vincular projeto Firebase

```bash
firebase login
firebase use --add
```

### Etapa 5 — subir regras e índices

#### Recomendado: tudo de segurança de uma vez

```bash
firebase deploy --only firestore,storage
```

#### Ou separado

```bash
firebase deploy --only firestore
firebase deploy --only storage
```

O Firebase recomenda esse fluxo pela CLI para regras e configuração do projeto [Firebase](https://firebase.google.com/docs/rules/manage-deploy). A documentação de indexação também confirma o uso do arquivo JSON local para deploy de índices [firebase.google.com](https://firebase.google.com/docs/firestore/query-data/indexing).

### Etapa 6 — fazer bootstrap inicial do Firestore

```bash
node scripts/bootstrap-firebase.mjs \
  --ownerUid SEU_UID \
  --email dono@loja.com \
  --storeName "Minha Loja" \
  --slug minha-loja \
  --whatsapp 5511999999999
```

Esse script cria/atualiza:

- `users/{uid}`
- `plans/free`
- `plans/starter`
- `plans/growth`
- `plans/scale`
- `stores/{storeId}`
- `stores/{storeId}/members/{uid}`
- `stores/{storeId}/subscriptions/subscription_free_default`
- `stores/{storeId}/usageMetrics/{YYYY-MM}`

### Etapa 7 — configurar custom claims, se necessário

#### Tornar um usuário `platformAdmin`

```bash
node scripts/set-custom-claims.mjs --uid SEU_UID --platformAdmin true
```

#### Tornar um usuário `platformSupport`

```bash
node scripts/set-custom-claims.mjs --uid SEU_UID --platformSupport true
```

Custom claims devem ser definidas pelo Firebase Admin SDK em ambiente privilegiado. Depois disso, o token do usuário precisa ser renovado para refletir as novas claims [Firebase](https://firebase.google.com/docs/auth/admin/custom-claims).

### Etapa 8 — renovar sessão do usuário no frontend

Depois de alterar claims:

- faça logout/login
- ou force refresh do token

Exemplo:

```ts
await auth.currentUser?.getIdToken(true);
```

A propagação das claims para o cliente depende da emissão de um novo ID token [Firebase](https://firebase.google.com/docs/auth/admin/custom-claims).

### Etapa 9 — rodar o projeto localmente

```bash
npm run dev
```

### Etapa 10 — build e deploy do frontend, se necessário

```bash
npm run build
firebase deploy --only hosting
```

---

## Comandos rápidos de referência

### Instalação

```bash
npm install
npm install firebase-admin
```

### Login e seleção de projeto

```bash
firebase login
firebase use --add
```

### Deploy de regras e índices

```bash
firebase deploy --only firestore
firebase deploy --only storage
firebase deploy --only firestore,storage
```

### Bootstrap inicial

```bash
node scripts/bootstrap-firebase.mjs --ownerUid SEU_UID --email dono@loja.com --storeName "Minha Loja"
```

### Custom claims

```bash
node scripts/set-custom-claims.mjs --uid SEU_UID --platformAdmin true
node scripts/set-custom-claims.mjs --uid SEU_UID --platformSupport true
```

### Desenvolvimento local

```bash
npm run dev
```

### Build

```bash
npm run build
```

---

## O que validar no Firebase Console após o bootstrap

### Firestore

Confirme a existência dos documentos:

- `plans/free`
- `plans/starter`
- `plans/growth`
- `plans/scale`
- `users/{ownerUid}`
- `stores/store_{slug}`
- `stores/store_{slug}/members/{ownerUid}`
- `stores/store_{slug}/subscriptions/subscription_free_default`
- `stores/store_{slug}/usageMetrics/{YYYY-MM}`

### Storage

Depois de usar a aplicação, valide se uploads aparecem nos caminhos esperados.

Estrutura atual suportada:

- legado: `/{ownerId}/...`
- final recomendada:
  - `/public/stores/{storeId}/branding/*`
  - `/public/stores/{storeId}/products/{productId}/*`
  - `/private/stores/{storeId}/...`

### Authentication

Confirme que:

- o owner consegue logar
- o usuário com claim administrativa renovou o token
- as claims aparecem no token após refresh ou novo login

---

## Troubleshooting

### 1. `Missing or insufficient permissions`

Causa comum:

- regras já subidas, mas o usuário ainda não tem role/claim correta
- documento `members/{uid}` não existe
- token ainda não foi renovado após alterar custom claims

Como resolver:

- confirme `stores/{storeId}/members/{uid}`
- confirme `ownerId` no documento da loja
- faça logout/login
- ou force refresh do token com `getIdToken(true)`

As regras do Firestore podem consultar outros documentos com `get()` e `exists()`, mas essas leituras precisam apontar para caminhos válidos e consistentes [firebase.google.com](https://firebase.google.com/docs/firestore/security/rules-conditions).

### 2. `The caller does not have permission` ao rodar scripts Node

Causa comum:

- `GOOGLE_APPLICATION_CREDENTIALS` não configurada
- service account sem permissão suficiente

Como resolver:

- exporte corretamente a variável de ambiente
- baixe novamente a service account
- confirme que o projeto selecionado é o correto

### 3. Claims não aparecem no app

Causa:

- claims atualizadas no Auth, mas token antigo ainda está em uso

Como resolver:

- refaça login
- ou use `currentUser.getIdToken(true)`

O próprio Firebase documenta que claims novas só aparecem quando um novo ID token é emitido [Firebase](https://firebase.google.com/docs/auth/admin/custom-claims).

### 4. Query pública falhando mesmo com regra permitindo leitura pública

Causa provável:

- a query não respeita as condições da regra

Como resolver:

- garanta filtros coerentes com as rules
- exemplo: consultar apenas produtos `active`

O Firestore deixa claro que **rules não são filtros**; se a consulta puder retornar documentos não autorizados, toda a query falha [firebase.google.com](https://firebase.google.com/docs/firestore/security/rules-conditions).

### 5. Upload bloqueado no Storage

Causa comum:

- tipo de arquivo inválido
- arquivo maior que o limite
- caminho incompatível com a regra

Como resolver:

- verifique `contentType`
- verifique o tamanho do arquivo
- confira se o upload foi para a pasta esperada

As regras de Storage permitem validação por caminho, tipo de arquivo e tamanho [firebase.google.com](https://firebase.google.com/docs/storage/security).

### 6. Deploy de índices parece não surtir efeito imediatamente

Causa:

- índices ainda estão em construção

Como resolver:

- acompanhe no Firebase Console na aba de índices
- aguarde a finalização do build do índice

O Firebase informa que a criação de índices é uma operação assíncrona e pode levar alguns minutos dependendo do volume de dados [firebase.google.com](https://firebase.google.com/docs/firestore/query-data/indexing).

---

## Boas práticas recomendadas

- nunca commitar `.env` sensível de produção
- nunca commitar a service account JSON
- usar `plans` como catálogo mestre de planos
- manter `stores/{storeId}.planSnapshot` para limites efetivos do tenant
- manter `stores/{storeId}.metrics` atualizado para enforcement de quota
- preferir subcollections por loja para o modelo final multi-tenant
- usar ambiente separado para dev e prod, se possível

---

## Checklist final de validação

### Infra
- [ ] Node.js instalado
- [ ] Firebase CLI instalada
- [ ] Projeto Firebase criado
- [ ] Firestore habilitado
- [ ] Storage habilitado
- [ ] Service account baixada
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` configurada

### Projeto local
- [ ] `npm install` executado
- [ ] `firebase-admin` instalado
- [ ] `.env` criado a partir de `.env.example`
- [ ] variáveis `VITE_FIREBASE_*` preenchidas
- [ ] scripts `set-custom-claims.mjs` e `bootstrap-firebase.mjs` presentes
- [ ] `package.json` com scripts Firebase adicionados

### Firebase CLI
- [ ] `firebase login` executado
- [ ] `firebase use --add` executado no projeto correto

### Segurança
- [ ] `firestore.rules` publicada
- [ ] `firestore.indexes.json` publicado
- [ ] `storage.rules` publicada

### Bootstrap de dados
- [ ] `plans/free` criado
- [ ] `plans/starter` criado
- [ ] `plans/growth` criado
- [ ] `plans/scale` criado
- [ ] `users/{ownerUid}` criado
- [ ] `stores/{storeId}` criada
- [ ] `stores/{storeId}/members/{ownerUid}` criado
- [ ] `stores/{storeId}/subscriptions/subscription_free_default` criado
- [ ] `stores/{storeId}/usageMetrics/{YYYY-MM}` criado

### Claims e acesso
- [ ] claims aplicadas quando necessário
- [ ] usuário renovou token
- [ ] owner acessa dashboard
- [ ] visitante acessa vitrine pública
- [ ] regras bloqueiam o que deveria ser privado

### App
- [ ] `npm run dev` funcionando
- [ ] login funcionando
- [ ] leitura de loja funcionando
- [ ] upload de imagem funcionando
- [ ] leitura pública de catálogo funcionando

---

## Sequência mínima recomendada

Se você quiser fazer o setup do zero com o menor risco possível, esta é a sequência enxuta:

```bash
npm install
npm install firebase-admin
cp .env.example .env
# preencher .env
export GOOGLE_APPLICATION_CREDENTIALS="/caminho/para/service-account.json"
firebase login
firebase use --add
firebase deploy --only firestore,storage
node scripts/bootstrap-firebase.mjs --ownerUid SEU_UID --email dono@loja.com --storeName "Minha Loja" --slug minha-loja --whatsapp 5511999999999
node scripts/set-custom-claims.mjs --uid SEU_UID --platformAdmin true
npm run dev
```

---

## Referências oficiais

- Deploy e gerenciamento de regras com Firebase CLI [Firebase](https://firebase.google.com/docs/rules/manage-deploy)
- Deploy e gerenciamento de índices do Firestore [firebase.google.com](https://firebase.google.com/docs/firestore/query-data/indexing)
- Custom claims com Firebase Admin SDK [Firebase](https://firebase.google.com/docs/auth/admin/custom-claims)
- Condições de regras do Firestore, `get()` e `exists()` [firebase.google.com](https://firebase.google.com/docs/firestore/security/rules-conditions)
- Segurança do Cloud Storage [firebase.google.com](https://firebase.google.com/docs/storage/security)