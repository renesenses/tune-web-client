// Géométrie réelle Chromium : balisage d'en-tête et CSS lus dans le composant.
// Installer Playwright dans l'environnement de test, puis :
// node scripts/test-reveils-grappe.cjs
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const source = readFileSync('src/components/v2/AlarmesV2.svelte', 'utf8');
const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
const commun = readFileSync('src/styles/tune-v2.css', 'utf8');
const entete = source.match(/<header\b[\s\S]*?<\/header>/)[0]
  .replace(/\{\$t\('alarms.title'\)\}/g, 'Alarms')
  .replace(/\{\$t\('alarms.newAlarm'\)\}/g, 'New alarm')
  .replace(/onclick=\{ouvrirCreation\}/g, '');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const erreurs = [];
    for (const largeur of [360, 768, 1024, 1440]) {
      for (const recherche of [false, true]) {
        for (const decale of [false, true]) {
          const haut = decale ? 68 : 20;
          const grappe = Math.min(recherche ? 420 : 172, largeur - 60);
          await page.setViewportSize({ width: largeur, height: 700 });
          // Les variables sont celles que ResizeObserver pose dans ShellV2.
          await page.setContent(`<style>${commun}\n${css}\nbody{margin:0}.cadre{position:relative;width:100%;height:700px;--v2-grappe-w:${grappe + 44}px;--v2-grappe-h:${haut + 46}px}.grappe{position:absolute;top:${haut}px;right:30px;width:${grappe}px;height:32px;z-index:80;background:#bbb}</style><main class="cadre"><div class="v2-ecran tune-v2">${entete}</div><div class="grappe">Search / Full screen</div></main>`);
          const bouton = page.locator('header button');
          const b = await bouton.boundingBox();
          const g = await page.locator('.grappe').boundingBox();
          const recouvert = b.x < g.x + g.width && b.x + b.width > g.x && b.y < g.y + g.height && b.y + b.height > g.y;
          const horsEcran = b.x < 0 || b.x + b.width > largeur;
          if (recouvert || horsEcran) erreurs.push({ largeur, recherche, decale, recouvert, horsEcran });
          else {
            await bouton.evaluate((el) => el.addEventListener('click', () => el.dataset.clique = 'oui'));
            await bouton.click({ timeout: 1000 });
            assert.equal(await bouton.getAttribute('data-clique'), 'oui');
          }
          if (process.env.PREUVES_REVEILS && largeur === 768 && recherche && !decale)
            await page.screenshot({ path: resolve(process.env.PREUVES_REVEILS, 'reveils.png') });
        }
      }
    }
    assert.deepEqual(erreurs, [], 'Nouveau réveil est recouvert par la grappe ou sort de l’écran');
    console.log('16 configurations : bouton visible et cliquable');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
