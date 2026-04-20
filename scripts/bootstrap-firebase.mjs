#!/usr/bin/env node
import admin from 'firebase-admin';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function buildPlans() {
  return [
    {
      id: 'free',
      name: 'Free',
      status: 'active',
      limits: { products: 25, teamMembers: 1, storageMb: 1024 },
      features: { customDomain: false, analytics: false, auditLogs: false },
      price: { amount: 0, currency: 'BRL', interval: 'month' },
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'starter',
      name: 'Starter',
      status: 'active',
      limits: { products: 100, teamMembers: 3, storageMb: 5120 },
      features: { customDomain: true, analytics: true, auditLogs: false },
      price: { amount: 49.9, currency: 'BRL', interval: 'month' },
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'growth',
      name: 'Growth',
      status: 'active',
      limits: { products: 500, teamMembers: 10, storageMb: 20480 },
      features: { customDomain: true, analytics: true, auditLogs: true },
      price: { amount: 149.9, currency: 'BRL', interval: 'month' },
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'scale',
      name: 'Scale',
      status: 'active',
      limits: { products: 999999, teamMembers: 999999, storageMb: 102400 },
      features: { customDomain: true, analytics: true, auditLogs: true },
      price: { amount: 499.9, currency: 'BRL', interval: 'month' },
      createdAt: now(),
      updatedAt: now(),
    },
  ];
}

function printHelp() {
  console.log(`
Uso:
  node scripts/bootstrap-firebase.mjs --ownerUid <UID> --email <EMAIL> --storeName "Minha Loja" [--slug minha-loja] [--whatsapp 5511999999999]

Exemplo:
  node scripts/bootstrap-firebase.mjs \
    --ownerUid abc123 \
    --email dono@loja.com \
    --storeName "Minha Loja" \
    --slug minha-loja \
    --whatsapp 5511999999999

O script faz:
  1. cria/atualiza users/{uid}
  2. cria/atualiza plans/{planId}
  3. cria a store inicial em stores/{storeId}
  4. cria members/{uid} com role admin
  5. cria subscriptions/{subscriptionId} no plano free
  6. cria usageMetrics inicial do mês corrente
`);
}

const args = parseArgs(process.argv);
if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const ownerUid = args.ownerUid || process.env.BOOTSTRAP_OWNER_UID;
const email = args.email || process.env.BOOTSTRAP_OWNER_EMAIL || '';
const storeName = args.storeName || process.env.BOOTSTRAP_STORE_NAME;
const slug = args.slug || process.env.BOOTSTRAP_STORE_SLUG || slugify(storeName || 'minha-loja');
const whatsappNumber = args.whatsapp || process.env.BOOTSTRAP_WHATSAPP || '';
const primaryColor = args.primaryColor || '#4F46E5';
const secondaryColor = args.secondaryColor || '#14B8A6';
const title = args.title || 'Sua vitrine digital com experiência premium';
const subtitle = args.subtitle || 'Compre pelo WhatsApp com catálogo elegante e responsivo.';

if (!ownerUid || !storeName) {
  console.error('Erro: informe ao menos --ownerUid e --storeName.');
  printHelp();
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function upsertPlans(batch) {
  for (const plan of buildPlans()) {
    batch.set(db.collection('plans').doc(plan.id), plan, { merge: true });
  }
}

async function run() {
  const storeId = `store_${slug}`;
  const subscriptionId = 'subscription_free_default';
  const metricId = new Date().toISOString().slice(0, 7);

  const userRef = db.collection('users').doc(ownerUid);
  const storeRef = db.collection('stores').doc(storeId);
  const memberRef = storeRef.collection('members').doc(ownerUid);
  const subscriptionRef = storeRef.collection('subscriptions').doc(subscriptionId);
  const usageMetricRef = storeRef.collection('usageMetrics').doc(metricId);

  const batch = db.batch();

  await upsertPlans(batch);

  batch.set(
    userRef,
    {
      email,
      displayName: storeName,
      status: 'active',
      defaultStoreId: storeId,
      createdAt: now(),
      updatedAt: now(),
    },
    { merge: true },
  );

  batch.set(
    storeRef,
    {
      ownerId: ownerUid,
      slug,
      storeName,
      title,
      subtitle,
      status: 'active',
      visibility: 'public',
      activePlanId: 'free',
      planSnapshot: {
        name: 'Free',
        limits: {
          products: 25,
          teamMembers: 1,
          storageMb: 1024,
        },
      },
      metrics: {
        productsCount: 0,
        activeProductsCount: 0,
        teamMembersCount: 1,
      },
      branding: {
        primaryColor,
        secondaryColor,
        logoUrl: '',
        bannerUrl: '',
      },
      channels: {
        whatsappNumber,
      },
      createdAt: now(),
      updatedAt: now(),
    },
    { merge: true },
  );

  batch.set(
    memberRef,
    {
      userId: ownerUid,
      role: 'admin',
      status: 'active',
      invitedBy: ownerUid,
      createdAt: now(),
      updatedAt: now(),
    },
    { merge: true },
  );

  batch.set(
    subscriptionRef,
    {
      storeId,
      planId: 'free',
      status: 'active',
      provider: 'internal-bootstrap',
      providerSubscriptionId: null,
      startedAt: now(),
      renewalAt: null,
      cancelAtPeriodEnd: false,
      limitsSnapshot: {
        products: 25,
        teamMembers: 1,
        storageMb: 1024,
      },
      createdAt: now(),
      updatedAt: now(),
    },
    { merge: true },
  );

  batch.set(
    usageMetricRef,
    {
      storeId,
      periodKey: metricId,
      productsCount: 0,
      storageUsedMb: 0,
      orderIntentsCount: 0,
      updatedAt: now(),
      createdAt: now(),
    },
    { merge: true },
  );

  await batch.commit();

  console.log('✅ Bootstrap inicial concluído com sucesso.');
  console.log(JSON.stringify({
    ownerUid,
    storeId,
    slug,
    subscriptionId,
    usageMetricId: metricId,
  }, null, 2));

  console.log('\nPróximos passos sugeridos:');
  console.log('1. Suba firestore.rules, firestore.indexes.json e storage.rules.');
  console.log('2. Rode o script de custom claims se quiser platformAdmin/platformSupport.');
  console.log('3. Faça login com o owner e teste acesso ao dashboard.');
}

run().catch((error) => {
  console.error('❌ Falha no bootstrap inicial do Firebase.');
  console.error(error);
  process.exit(1);
});
