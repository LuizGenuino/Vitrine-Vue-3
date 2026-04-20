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

function toBoolean(value, fallback = false) {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function printHelp() {
  console.log(`
Uso:
  node scripts/set-custom-claims.mjs --uid <UID> [--platformAdmin true|false] [--platformSupport true|false]

Exemplos:
  node scripts/set-custom-claims.mjs --uid abc123 --platformAdmin true
  node scripts/set-custom-claims.mjs --uid abc123 --platformSupport true
  node scripts/set-custom-claims.mjs --uid abc123 --platformAdmin false --platformSupport false

Observações:
  - Requer credenciais do Firebase Admin configuradas via GOOGLE_APPLICATION_CREDENTIALS.
  - Após atualizar claims, o usuário precisa renovar o token (logout/login ou getIdToken(true)).
`);
}

const args = parseArgs(process.argv);

if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const uid = args.uid || process.env.TARGET_UID;
if (!uid) {
  console.error('Erro: informe --uid <UID> ou defina TARGET_UID.');
  printHelp();
  process.exit(1);
}

const platformAdmin = toBoolean(args.platformAdmin, false);
const platformSupport = toBoolean(args.platformSupport, false);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

async function run() {
  const auth = admin.auth();
  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims || {};

  const nextClaims = {
    ...currentClaims,
    platformAdmin,
    platformSupport,
  };

  if (platformAdmin) {
    nextClaims.platformSupport = false;
  }

  await auth.setCustomUserClaims(uid, nextClaims);

  console.log('✅ Custom claims atualizadas com sucesso.');
  console.log(JSON.stringify({ uid, claims: nextClaims }, null, 2));
  console.log('\nPróximo passo no cliente: forçar refresh do token com currentUser.getIdToken(true) ou refazer login.');
}

run().catch((error) => {
  console.error('❌ Falha ao atualizar custom claims.');
  console.error(error);
  process.exit(1);
});
