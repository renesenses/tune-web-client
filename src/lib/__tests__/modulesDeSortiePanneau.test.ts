// @vitest-environment jsdom
//
// jsdom, et pas `node` : ce fichier MONTE le composant réel. Sans `window`, le
// runtime client de Svelte n'installe pas son ordonnanceur et chaque assertion
// « le panneau montre… » passerait au vert sans avoir rien rendu.
//
// ─────────────────────────────────────────────────────────────────────────────
//
// `renesenses/tune-server-rust#2392` — le panneau « Modules de sortie » de
// Diagnostics (arbitrage de Bertrand, 01/09/2026).
//
// Le serveur sert depuis v0.9.115, sous `output_providers`, l'état de chaque
// fournisseur de sortie : module requis, appareils vus, refus nommé. Le bandeau
// `OutputModuleBanner` n'en lisait que les refus, sans leur code. Ce panneau
// montre l'état COMPLET, code compris — c'est l'écran qu'on envoie au support.
//
// Ce que cette garde tient :
//   1. le panneau est rendu par le composant réel, ligne par ligne ;
//   2. un refus AFFICHE SON CODE (`module_account_not_linked`, `module_not_owned`)
//      et propose le geste qui répare ;
//   3. le témoin (module possédé) est « Actif », sans code ni bouton ;
//   4. un serveur ancien (pas d'`output_providers`) ne produit AUCUN panneau ;
//   5. les deux écrans — Diagnostics (v1) et Tune Health (v2) — le montent ;
//   6. les onze langues portent toutes ses clés.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, unmount } from 'svelte';
import OutputModulesPanel from '../../components/OutputModulesPanel.svelte';
import {
  COMPTE_NON_RELIE,
  MODULE_NON_POSSEDE,
  REFUS_INCONNU,
  tableauFournisseurs,
} from '../refusModuleSortie';
// Tous préfixés `l` : `import it from '../locales/it'` écraserait le `it` de
// Vitest (voir `refusModuleSortie.test.ts`).
import lFr from '../locales/fr';
import lDe from '../locales/de';
import lEn from '../locales/en';
import lEs from '../locales/es';
import lHu from '../locales/hu';
import lIt from '../locales/it';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lZh from '../locales/zh';

const fr: Record<string, string> = lFr;

// ─────────────────────────────────────────────────────────────────────────────
// Charges utiles RÉELLES — `discovery_setup.rs` (`statut_du_fournisseur`,
// `publier_statut_fournisseurs`) et `premium_guard.rs` (`ModuleRefusal::to_json`).
// ─────────────────────────────────────────────────────────────────────────────
const COMPTE_NON_RELIE_REEL = {
  account_linked: false,
  licensed_modules: [],
  providers: [
    {
      provider: 'diretta',
      required_module: 'diretta',
      devices: 0,
      refusal: {
        error: 'module_required',
        code: 'module_account_not_linked',
        module: 'diretta',
        action: 'link_account',
        message:
          'the diretta module is a paid add-on: link your Mozaiklabs account so the server can receive the entitlement',
        upgrade_url: 'https://mozaiklabs.fr/pricing',
      },
    },
    // Un fournisseur libre à côté : pas de module, pas de refus, deux appareils.
    { provider: 'sonos', required_module: null, devices: 2, refusal: null },
  ],
};
const MODULE_NON_POSSEDE_REEL = {
  account_linked: true,
  licensed_modules: ['dsp'],
  providers: [
    {
      provider: 'diretta',
      required_module: 'diretta',
      devices: 0,
      refusal: {
        error: 'module_required',
        code: 'module_not_owned',
        module: 'diretta',
        action: 'purchase_module',
        message: 'the diretta module is a paid add-on and this account does not own it',
        upgrade_url: 'https://mozaiklabs.fr/pricing',
      },
    },
  ],
};
/** Le témoin : compte relié, module possédé, aucun appareil trouvé. */
const TEMOIN_COMPTE_RELIE = {
  account_linked: true,
  licensed_modules: ['diretta'],
  providers: [{ provider: 'diretta', required_module: 'diretta', devices: 0, refusal: null }],
};

// ─────────────────────────────────────────────────────────────────────────────
// Montage du composant réel
// ─────────────────────────────────────────────────────────────────────────────
let monte: Record<string, unknown> | null = null;
let hote: HTMLDivElement | null = null;
function rendre(instantane: unknown, variante: 'v1' | 'v2' = 'v1'): HTMLDivElement {
  const tableau = tableauFournisseurs(instantane);
  if (!tableau) throw new Error('le test monte un panneau : il faut un instantané présent');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(OutputModulesPanel, { target: hote, props: { tableau, variante } });
  return hote;
}
function demonter() {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
}
afterEach(demonter);
const lignes = (h: HTMLElement) => [...h.querySelectorAll<HTMLTableRowElement>('tbody tr')];

describe('#2392 — tableauFournisseurs : présent ou absent, jamais inventé', () => {
  it("rend `null` quand `output_providers` manque : serveur antérieur à v0.9.115, pas de panneau", () => {
    expect(tableauFournisseurs(undefined)).toBeNull();
    expect(tableauFournisseurs(null)).toBeNull();
    expect(tableauFournisseurs('n/a')).toBeNull();
  });
  it('rend un tableau VIDE, pas `null`, quand le serveur dit « aucun fournisseur »', () => {
    expect(tableauFournisseurs({ account_linked: true, licensed_modules: [], providers: [] })).toEqual({
      accountLinked: true,
      licensedModules: [],
      lignes: [],
    });
    // Un instantané sans `providers` du tout reste un instantané présent.
    expect(tableauFournisseurs({})).toEqual({ accountLinked: null, licensedModules: [], lignes: [] });
  });
  it('lit chaque fournisseur : nom, module requis, appareils, refus avec son code brut', () => {
    const t = tableauFournisseurs(COMPTE_NON_RELIE_REEL)!;
    expect(t.accountLinked).toBe(false);
    expect(t.lignes).toHaveLength(2);
    expect(t.lignes[0]).toEqual({
      provider: 'diretta',
      requiredModule: 'diretta',
      devices: 0,
      refus: {
        code: COMPTE_NON_RELIE,
        codeBrut: 'module_account_not_linked',
        upgradeUrl: 'https://mozaiklabs.fr/pricing',
      },
    });
    expect(t.lignes[1]).toEqual({ provider: 'sonos', requiredModule: null, devices: 2, refus: null });
    expect(tableauFournisseurs(MODULE_NON_POSSEDE_REEL)!.lignes[0].refus?.code).toBe(MODULE_NON_POSSEDE);
    expect(tableauFournisseurs(MODULE_NON_POSSEDE_REEL)!.licensedModules).toEqual(['dsp']);
  });
  it('garde le code brut même inconnu, et le range dans le refus générique', () => {
    const t = tableauFournisseurs({
      providers: [{ provider: 'x', required_module: 'x', devices: 1, refusal: { code: 'un_refus_futur' } }],
    })!;
    expect(t.lignes[0].refus).toEqual({ code: REFUS_INCONNU, codeBrut: 'un_refus_futur', upgradeUrl: null });
  });
});

describe('#2392 — le panneau est rendu par le composant réel', () => {
  it('une ligne par fournisseur : nom, module requis, appareils vus', () => {
    const h = rendre(COMPTE_NON_RELIE_REEL);
    const rows = lignes(h);
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-provider')).toBe('diretta');
    expect(rows[0].textContent).toContain('diretta');
    expect(rows[1].getAttribute('data-provider')).toBe('sonos');
    // Le fournisseur libre : « aucun (inclus) », deux appareils, actif.
    expect(rows[1].textContent).toContain(fr['diagnostics.outputNoModuleRequired']);
    expect(rows[1].querySelector('td.num')?.textContent?.trim()).toBe('2');
    expect(rows[1].textContent).toContain(fr['diagnostics.outputActive']);
    // L'en-tête du panneau dit l'état du compte.
    expect(h.textContent).toContain(fr['diagnostics.outputAccountNotLinked']);
    expect(h.textContent).toContain(fr['diagnostics.outputNoLicensedModules']);
  });
  it('un refus « compte non relié » AFFICHE SON CODE et le bouton de liaison', () => {
    const h = rendre(COMPTE_NON_RELIE_REEL);
    const row = lignes(h)[0];
    expect(row.getAttribute('data-refus')).toBe('module_account_not_linked');
    expect(row.textContent).toContain(fr['diagnostics.outputRefusedNotLinked']);
    // LE CODE, à l'écran : c'est Diagnostics, l'écran qu'on envoie au support.
    expect(row.querySelector('code.output-modules-code')?.textContent).toBe('module_account_not_linked');
    const bouton = row.querySelector('button.output-modules-action');
    expect(bouton?.textContent?.trim()).toBe(fr['outputModule.notLinkedAction']);
    // Pas de lien boutique : sans compte lié on ne SAIT PAS si le module est possédé.
    expect(row.querySelector('a.output-modules-action')).toBeNull();
  });
  it('un refus « module non possédé » AFFICHE SON CODE, la licence et la boutique du serveur', () => {
    const h = rendre(MODULE_NON_POSSEDE_REEL);
    const row = lignes(h)[0];
    expect(row.getAttribute('data-refus')).toBe('module_not_owned');
    expect(row.textContent).toContain(fr['diagnostics.outputRefusedNotOwned']);
    expect(row.querySelector('code.output-modules-code')?.textContent).toBe('module_not_owned');
    expect(row.querySelector('button.output-modules-action')?.textContent?.trim()).toBe(
      fr['diagnostics.outputOpenLicense'],
    );
    const lien = row.querySelector<HTMLAnchorElement>('a.output-modules-action');
    expect(lien?.getAttribute('href')).toBe('https://mozaiklabs.fr/pricing');
    expect(h.textContent).toContain(fr['diagnostics.outputAccountLinked']);
    expect(h.textContent).toContain(fr['diagnostics.outputLicensedModules'].replace('{list}', 'dsp'));
  });
  it("l'URL de la boutique vient du serveur : sans elle, pas de lien mort", () => {
    const sansUrl = structuredClone(MODULE_NON_POSSEDE_REEL) as Record<string, any>;
    delete sansUrl.providers[0].refusal.upgrade_url;
    const h = rendre(sansUrl);
    expect(h.querySelector('a.output-modules-action')).toBeNull();
    expect(h.querySelector('code.output-modules-code')?.textContent).toBe('module_not_owned');
  });
  it('le témoin (module possédé) est « Actif » : ni code, ni bouton, même sans appareil', () => {
    const h = rendre(TEMOIN_COMPTE_RELIE);
    const row = lignes(h)[0];
    expect(row.getAttribute('data-refus')).toBe('ok');
    expect(row.textContent).toContain(fr['diagnostics.outputActive']);
    expect(row.querySelector('td.num')?.textContent?.trim()).toBe('0');
    expect(row.querySelector('code.output-modules-code')).toBeNull();
    expect(row.querySelector('.output-modules-action')).toBeNull();
    expect(h.textContent).not.toContain('module_');
  });
  it('un serveur sans fournisseur externe le dit, plutôt que de montrer un tableau vide', () => {
    const h = rendre({ account_linked: true, licensed_modules: [], providers: [] });
    expect(lignes(h)).toHaveLength(0);
    expect(h.textContent).toContain(fr['diagnostics.outputNoProviders']);
  });
  it("n'affiche jamais le `message` anglais du serveur, qui n'est qu'un repli de journal", () => {
    const texte = rendre(COMPTE_NON_RELIE_REEL).textContent ?? '';
    expect(texte).not.toContain('paid add-on');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Les écrans montent réellement le panneau, et seulement si l'instantané existe
// ─────────────────────────────────────────────────────────────────────────────
const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('#2392 — le panneau est monté par les deux écrans de diagnostic', () => {
  it('Diagnostics (client actuel) le monte sous le titre « Modules de sortie », derrière `{#if}`', () => {
    const vue = lire('src/components/DiagnosticsView.svelte');
    expect(vue).toContain("import OutputModulesPanel from './OutputModulesPanel.svelte'");
    expect(vue).toContain('tableauFournisseurs(serverDiag?.output_providers)');
    expect(vue).toContain("{$t('diagnostics.outputModules')}");
    expect(vue).toContain('<OutputModulesPanel tableau={tableauModules} />');
    // Le panneau n'existe pas sur un serveur ancien : la section est conditionnelle.
    const si = vue.indexOf('{#if tableauModules}');
    const panneau = vue.indexOf('<OutputModulesPanel');
    expect(si).toBeGreaterThan(-1);
    expect(si).toBeLessThan(panneau);
  });
  it('Tune Health (nouveau client) le monte aussi, sur la même route', () => {
    const vue = lire('src/components/v2/TuneHealthV2.svelte');
    expect(vue).toContain("import OutputModulesPanel from '../OutputModulesPanel.svelte'");
    expect(vue).toContain('api.getServerDiagnostics()');
    expect(vue).toContain('tableauFournisseurs(diag[0].value?.output_providers)');
    expect(vue).toContain('<OutputModulesPanel tableau={modulesSortie} variante="v2" />');
    const si = vue.indexOf('{#if modulesSortie}');
    const panneau = vue.indexOf('<OutputModulesPanel');
    expect(si).toBeGreaterThan(-1);
    expect(si).toBeLessThan(panneau);
  });
});

describe('#2392 — les onze langues portent les clés du panneau', () => {
  const CLES = [
    'diagnostics.outputModules',
    'diagnostics.outputModulesHint',
    'diagnostics.outputProvider',
    'diagnostics.outputRequiredModule',
    'diagnostics.outputDevices',
    'diagnostics.outputStatus',
    'diagnostics.outputNoModuleRequired',
    'diagnostics.outputActive',
    'diagnostics.outputRefusedNotLinked',
    'diagnostics.outputRefusedNotOwned',
    'diagnostics.outputRefusedUnknown',
    'diagnostics.outputAccountLinked',
    'diagnostics.outputAccountNotLinked',
    'diagnostics.outputLicensedModules',
    'diagnostics.outputNoLicensedModules',
    'diagnostics.outputNoProviders',
    'diagnostics.outputOpenLicense',
  ];
  const LANGUES: Record<string, Record<string, string>> = {
    fr: lFr, en: lEn, de: lDe, es: lEs, it: lIt, hu: lHu, ja: lJa, ko: lKo, ro: lRo, sv: lSv, zh: lZh,
  };
  it.each(Object.keys(LANGUES))('%s', (langue) => {
    const dict = LANGUES[langue];
    for (const cle of CLES) {
      expect(typeof dict[cle], `${langue} : ${cle}`).toBe('string');
      expect(dict[cle].trim().length, `${langue} : ${cle} vide`).toBeGreaterThan(0);
    }
    expect(dict['diagnostics.outputLicensedModules']).toContain('{list}');
  });
});
