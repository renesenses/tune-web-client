#!/usr/bin/env node
/**
 * Verification ciblee du parcours de notation, dans le navigateur.
 *
 * L'exploration ne signale plus rien sur la notation — mais une absence de
 * constat ne prouve rien tant qu'on n'a pas montre que les etoiles ont bien
 * ete cliquees. Ce script les clique explicitement et regarde ce que l'UI
 * affiche : poser une note, la reprendre, saisir un commentaire.
 *
 *   node check-rating.mjs --base-url http://127.0.0.1:8355
 */
import { chromium } from 'playwright';
import { installProbe } from './src/probe.mjs';

const baseUrl = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://127.0.0.1:8888';

/**
 * Couper le son avant d'ouvrir quoi que ce soit.
 *
 * `run.mjs` le fait pour l'exploration ; ce script-ci se lance a la main
 * contre un serveur lance a la main, et un clic malencontreux suffit a mettre
 * de la musique dans la piece de quelqu'un qui travaille. Le garde-fou
 * appartient au script, pas a la procedure de lancement.
 */
async function silenceZones() {
  try {
    const response = await fetch(`${baseUrl}/api/v1/zones`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return;
    const data = await response.json();
    const zones = Array.isArray(data) ? data : data.items || data.zones || [];
    for (const zone of zones) {
      await fetch(`${baseUrl}/api/v1/zones/${zone.id}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: 0 }),
      }).catch(() => {});
    }
    if (zones.length) console.log(`· ${zones.length} zone(s) mises a volume 0\n`);
  } catch { /* pas de zones : rien a couper */ }
}
await silenceZones();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
await context.addInitScript(installProbe);
const page = await context.newPage();

const drain = () => page.evaluate(() => {
  const bus = window.__tuneCrawl;
  const out = { toasts: bus.toasts.splice(0), calls: bus.calls.splice(0), errors: bus.errors.splice(0) };
  return out;
});

const report = [];
function check(label, signals, { expectRating } = {}) {
  const errors = signals.toasts.filter((t) => t.level === 'error');
  const success = signals.toasts.filter((t) => t.level === 'success');
  const rateCalls = signals.calls.filter((c) => c.url.includes('/rate'));
  const ok = errors.length === 0 && signals.errors.length === 0;
  report.push({ label, ok, errors, success, rateCalls, expectRating });
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${label}`);
  // Les URL relevees par la sonde sont relatives : les afficher telles quelles.
  for (const c of rateCalls) console.log(`    ${c.method} ${c.url} ${c.requestBody} → ${c.status}`);
  for (const t of success) console.log(`    toast succes : « ${t.message} »`);
  for (const t of errors) console.log(`    TOAST ERREUR : « ${t.message} »`);
  for (const e of signals.errors) console.log(`    ERREUR JS : ${e.message}`);
}

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.nav-item');
await page.waitForTimeout(1500);

await page.locator('.nav-item', { hasText: 'Bibliothèque' }).first().click();
await page.waitForSelector('.album-card', { timeout: 10000 });
// Viser le titre, pas le centre de la carte : le centre est la pochette, que
// recouvre au survol une pastille « lecture » qui arrete la propagation — le
// clic lancerait l'album au lieu d'ouvrir sa fiche.
await page.locator('.album-card').first().locator('.album-card-title').click();
await page.waitForSelector('.album-stars .star-btn', { timeout: 10000 });
await page.waitForTimeout(800);
console.log(`fiche album ouverte : « ${(await page.locator('h1, .album-detail-title').first().textContent())?.trim()} »\n`);

const stars = page.locator('.album-stars .star-btn');
const noteField = page.locator('.rating-note-input');

// L'album de depart peut deja porter une note : partir d'un etat connu.
const filled = await page.locator('.album-stars .star-btn.filled').count();
if (filled > 0) { await stars.nth(filled - 1).click(); await page.waitForTimeout(900); }
await drain();

await stars.nth(3).click();
await page.waitForTimeout(900);
check('poser 4 etoiles', await drain(), { expectRating: 4 });

const noteDisabledWhileRated = await noteField.isDisabled();
console.log(`${noteDisabledWhileRated ? '✗' : '✓'} champ commentaire actif une fois l'album note`);

await noteField.fill('commentaire de verification');
await noteField.press('Enter');
await page.waitForTimeout(900);
check('enregistrer un commentaire', await drain());

await stars.nth(3).click();
await page.waitForTimeout(900);
check('reprendre la note (clic sur l\'etoile allumee)', await drain(), { expectRating: 0 });

const noteDisabledWhenUnrated = await noteField.isDisabled();
console.log(`${noteDisabledWhenUnrated ? '✓' : '✗'} champ commentaire desactive quand l'album n'est plus note`);

await browser.close();

const failures = report.filter((r) => !r.ok).length + (noteDisabledWhileRated ? 1 : 0) + (noteDisabledWhenUnrated ? 0 : 1);
console.log(`\n${failures === 0 ? 'parcours de notation sain' : failures + ' etape(s) en echec'}`);
process.exit(failures === 0 ? 0 : 1);
