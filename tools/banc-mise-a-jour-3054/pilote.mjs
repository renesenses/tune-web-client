// Banc de tune-web-client#3054 : écran noir après une mise à jour du web.
//
// Sert un build N comme le fait le serveur Tune (index en `no-cache`,
// `/assets/*` en `immutable`, 404 `no-store`), laisse le service worker
// prendre la main, pose le build N+1 (morceaux différents, ceux de N
// disparus), puis recharge NORMALEMENT — jamais Cmd+Maj+R — et vérifie que
// l'interface s'affiche, et que c'est bien N+1.
//
// Préparer deux builds (sur Shrek) :
//   TUNE_BUILD_ID=build-N  npx vite build --outDir /tmp/banc/N
//   TUNE_BUILD_ID=build-N1 npx vite build --outDir /tmp/banc/N1
// Lancer :
//   DIST_N=/tmp/banc/N DIST_N1=/tmp/banc/N1 \
//   PLAYWRIGHT_MODULE=$PWD/tools/ui-crawler/node_modules/playwright/index.mjs \
//   node tools/banc-mise-a-jour-3054/pilote.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const DIST = { N: process.env.DIST_N, N1: process.env.DIST_N1 };
assert.ok(DIST.N && DIST.N1, 'DIST_N et DIST_N1 sont requis');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

let racine = DIST.N;
let refuserProchaineCoquille = false; // une seule demande de `/` refusée
let echecsDeMorceaux = 0;

const serveur = createServer(async (req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (refuserProchaineCoquille && (chemin === '/' || chemin === '/index.html')) {
    refuserProchaineCoquille = false;
    req.socket.destroy();
    return;
  }
  if (chemin.startsWith('/api/')) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(chemin.includes('zones') || chemin.includes('profiles') ? '[]' : '{}');
    return;
  }
  if (chemin === '/ws' || chemin.startsWith('/ws/')) { res.writeHead(404); res.end(); return; }
  let fichier = normalize(join(racine, chemin));
  if (!fichier.startsWith(racine)) { res.writeHead(403); res.end(); return; }
  try {
    const s = await stat(fichier);
    if (s.isDirectory()) fichier = join(fichier, 'index.html');
  } catch {
    if (chemin.startsWith('/assets/') || extname(chemin)) {
      if (chemin.startsWith('/assets/')) echecsDeMorceaux++;
      res.writeHead(404, { 'cache-control': 'no-store' }); res.end(); return;
    }
    fichier = join(racine, 'index.html'); // routes de l'application
  }
  try {
    const corps = await readFile(fichier);
    const entetes = { 'content-type': TYPES[extname(fichier)] || 'application/octet-stream' };
    if (fichier.endsWith('index.html')) entetes['cache-control'] = 'no-cache, must-revalidate';
    else if (chemin.startsWith('/assets/')) entetes['cache-control'] = 'public, max-age=31536000, immutable';
    res.writeHead(200, entetes);
    res.end(corps);
  } catch { res.writeHead(404, { 'cache-control': 'no-store' }); res.end(); }
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${serveur.address().port}`;

const buildDe = async (dist) => JSON.parse(await readFile(join(dist, 'version.json'), 'utf-8')).build;
const BUILD = { N: await buildDe(DIST.N), N1: await buildDe(DIST.N1) };

async function interfaceAffichee(page) {
  // « Affichée » : le montage a rempli #app, ou le message de secours est là.
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return (app && app.childElementCount > 0) || document.getElementById('tune-secours-demarrage');
  }, null, { timeout: 30_000 });
  return page.evaluate(() => ({
    monte: (document.getElementById('app')?.childElementCount ?? 0) > 0,
    secours: !!document.getElementById('tune-secours-demarrage'),
  }));
}
const buildServiParLeSw = (page) => page.evaluate(async () => (await fetch('/version.json', { cache: 'no-store' })).json().then((j) => j.build));
const swAuxCommandes = (page) => page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 });
const buildCharge = (page) => page.evaluate(() => {
  const s = [...document.scripts].find((x) => x.src.includes('/assets/index-'));
  return s ? s.src : null;
});

const scenarios = {
  // 1. Rechargement normal après la pose de N+1.
  async rechargementNormal(page) {
    racine = DIST.N;
    await page.goto(BASE + '/');
    await interfaceAffichee(page);
    await swAuxCommandes(page);
    const avant = await buildCharge(page);
    racine = DIST.N1;
    await page.reload();
    const etat = await interfaceAffichee(page);
    assert.ok(etat.monte, 'interface non montée après un rechargement normal');
    assert.notEqual(await buildCharge(page), avant, 'toujours l’ancien bundle');
  },
  // 2. Rechargement pendant le redémarrage du serveur, puis N+1 en ligne :
  //    le service worker de N sert sa coquille hors ligne, dont les morceaux
  //    n'existent plus sur le serveur revenu.
  async rechargementPendantLeRedemarrage(page) {
    racine = DIST.N;
    await page.goto(BASE + '/');
    await interfaceAffichee(page);
    await swAuxCommandes(page);
    // Le serveur redémarre au moment du rechargement : la demande de la
    // coquille échoue, puis le serveur revient, avec N+1.
    racine = DIST.N1;
    refuserProchaineCoquille = true;
    await page.reload({ waitUntil: 'commit' }).catch(() => {});
    const etat = await interfaceAffichee(page);
    assert.ok(etat.monte || etat.secours, 'écran noir : ni interface ni message');
    // Le rechargement automatique doit finir sur N+1.
    await page.waitForFunction((b) => fetch('/version.json').then((r) => r.json()).then((j) => j.build === b), BUILD.N1);
  },
  // 3. Onglet ouvert sur N, morceau à la demande disparu : un rechargement, puis N+1.
  async morceauDisparuDansUnOngletOuvert(page) {
    racine = DIST.N;
    await page.goto(BASE + '/');
    await interfaceAffichee(page);
    await swAuxCommandes(page);
    const avant = await buildCharge(page);
    racine = DIST.N1;
    const nav = page.waitForEvent('framenavigated', { timeout: 30_000 });
    await page.evaluate(() => {
      const e = new Event('vite:preloadError', { cancelable: true });
      e.payload = new Error('Failed to fetch dynamically imported module');
      window.dispatchEvent(e);
    });
    await nav;
    const etat = await interfaceAffichee(page);
    assert.ok(etat.monte, 'interface non montée après le rechargement automatique');
    assert.notEqual(await buildCharge(page), avant);
  },
  // 4. Le bundle d'entrée lui-même introuvable : message, pas écran noir.
  async bundleDEntreeIntrouvable(page) {
    racine = DIST.N;
    await page.route('**/assets/index-*.js', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(BASE + '/');
    const etat = await interfaceAffichee(page);
    assert.ok(etat.secours, 'écran noir : aucun message quand le bundle d’entrée manque');
  },
};

const navigateur = await chromium.launch({ headless: true, args: ['--mute-audio'] });
let echecs = 0;
const choisis = (process.env.SCENARIOS || Object.keys(scenarios).join(',')).split(',');
try {
  for (const nom of choisis) {
    const contexte = await navigateur.newContext();
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    echecsDeMorceaux = 0;
    try {
      await scenarios[nom](page);
      console.log(`OK    ${nom}`);
    } catch (e) {
      echecs++;
      const html = await page.evaluate(() => document.getElementById('app')?.outerHTML.slice(0, 200)).catch(() => '?');
      console.log(`ÉCHEC ${nom} : ${e.message}\n      #app=${html}\n      404 morceaux=${echecsDeMorceaux}\n      ${erreurs.slice(0, 4).join('\n      ')}`);
    }
    await contexte.close();
  }
} finally {
  await navigateur.close();
  serveur.close();
}
console.log(`builds : N=${BUILD.N} N+1=${BUILD.N1}`);
process.exit(echecs ? 1 : 0);
