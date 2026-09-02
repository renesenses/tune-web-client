// @vitest-environment jsdom
//
// jsdom, et pas `node` : ce fichier MONTE le composant réel. Sans `window`, le
// runtime client de Svelte n'installe pas son ordonnanceur — le composant ne
// rendrait rien et chaque assertion « le bandeau est absent » passerait au vert
// sans avoir rien exécuté. Pire qu'un test absent (voir l'en-tête de
// `miniLecteurOuverture.test.ts`, qui a payé cette découverte).
//
// ─────────────────────────────────────────────────────────────────────────────
//
// `renesenses/tune-server-rust#2392` — le refus le plus coûteux du produit.
//
// Le 25/08/2026, un bêta-testeur du module Diretta n'a vu AUCUN appareil dans
// ses Zones. Aucune erreur, aucun avertissement. Il en a conclu à un problème
// d'installation et a tout repris depuis zéro : réinstallation complète de
// Fedora, changement de système de fichiers (OverlayFS → XFS après des arrêts
// machine pendant la compilation), trente minutes de recompilation,
// récupération manuelle de l'interface web. Puis : « Tune Server démarre
// correctement, mais au final j'ai toujours le même résultat : aucun appareil
// Diretta n'apparaît. Je ne sais que faire ! »
//
// Son droit était valide depuis sept jours. Sa compilation était bonne. Il lui
// manquait UNE connexion de compte.
//
// Le serveur nommait déjà ce refus. Le client ne le lisait pas : avant ce
// correctif, `output_providers`, `account_linked`, `licensed_modules`,
// `module_account_not_linked` et `module_not_owned` avaient ZÉRO occurrence
// dans tout le dépôt.
//
// ─────────────────────────────────────────────────────────────────────────────
//
// Ce test monte le COMPOSANT, pas une transcription de son source. Un test qui
// relit le `.svelte` avec `readFileSync` et cherche une chaîne réplique le code
// au lieu de le garder : il reste vert si le bandeau n'est jamais rendu.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, unmount } from 'svelte';

import OutputModuleBanner from '../../components/OutputModuleBanner.svelte';
import {
  COMPTE_NON_RELIE,
  MODULE_NON_POSSEDE,
  REFUS_INCONNU,
  refusAAfficher,
} from '../refusModuleSortie';
// Les onze dictionnaires : une clé absente d'un seul fait retomber cette
// langue-là sur le français, en silence.
//
// Tous préfixés `l` : `import it from '../locales/it'` écraserait le `it` de
// Vitest, et chaque `it(...)` du fichier appellerait le dictionnaire italien —
// « TypeError: default is not a function », zéro test exécuté. Le piège est
// déjà documenté dans `miniLecteurOuverture.test.ts`.
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

/** Le dictionnaire de référence : `i18n.ts` fait défaut sur `fr`. */
const fr = lFr;

// ─────────────────────────────────────────────────────────────────────────────
// La charge utile RÉELLE.
//
// Relevée dans `tune-server-rust` sur `main` ET sur `batch/p2-recentes-1` — les
// deux refs sont identiques pour ce chemin. Elle vient de deux fichiers :
//
//   `routes/system/diagnostics.rs:278`
//       "output_providers": crate::discovery_setup::provider_status_snapshot(),
//   `discovery_setup.rs:2060` (`publier_statut_fournisseurs`)
//       { "account_linked", "licensed_modules", "providers" }
//   `discovery_setup.rs:1874` (`statut_du_fournisseur`)
//       { "provider", "required_module", "devices", "refusal" }
//   `premium_guard.rs:110` (`ModuleRefusal::to_json`)
//       { "error", "code", "module", "action", "message", "upgrade_url" }
//
// Attention : le JSON qui circule dans le ticket ne porte QUE `code` et
// `message` dans `refusal`. C'est une fixture de test Rust
// (`diagnostics.rs:2273`), passée directement à `section_fournisseurs_de_sortie`
// — pas ce que sert la route. Le vrai `refusal` a six champs, et l'instantané
// est imbriqué sous `output_providers`. C'est celui-ci qu'on rejoue.
// ─────────────────────────────────────────────────────────────────────────────

/** Le cas vécu : droit acheté et valide, mais aucun compte relié au serveur. */
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
  ],
};

/** L'autre refus : compte relié, droits lus, ce module-ci n'y est pas. */
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

/**
 * LE TÉMOIN — compte relié, module possédé.
 *
 * `ModuleRefusal::evaluate(true, _) => None` : le serveur n'écrit alors aucun
 * `refusal`. Cet utilisateur ne doit RIEN voir changer. Noter `devices: 0` :
 * il cherche vraiment et ne trouve rien, ce qui n'est pas un problème de droit
 * et ne se répare pas en reliant un compte. Confondre les deux renverrait un
 * utilisateur en règle vers un écran de compte pour un défaut de réseau.
 */
const TEMOIN_COMPTE_RELIE = {
  account_linked: true,
  licensed_modules: ['diretta'],
  providers: [
    {
      provider: 'diretta',
      required_module: 'diretta',
      devices: 0,
      refusal: null,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Montage du composant réel
// ─────────────────────────────────────────────────────────────────────────────

let monte: Record<string, unknown> | null = null;
let hote: HTMLDivElement | null = null;

/** Monte `OutputModuleBanner` pour de vrai et rend le DOM produit. */
function rendre(instantane: unknown): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(OutputModuleBanner, { target: hote, props: { instantane } });
  return hote;
}

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
});

/** Les bandeaux effectivement rendus. */
const bandeaux = (h: HTMLElement) => [...h.querySelectorAll('.output-module-banner')];

describe('#2392 — le refus est rendu par le composant réel', () => {
  it("nomme le module, dit que l'installation n'est pas en cause, et dit où cliquer", () => {
    const h = rendre(COMPTE_NON_RELIE_REEL);

    expect(bandeaux(h)).toHaveLength(1);
    const texte = h.textContent ?? '';

    // 1. Le module est reconnu — c'est ce qui aurait évité la réinstallation.
    expect(texte).toContain('diretta');
    expect(texte).toContain(fr['outputModule.notLinkedTitle'].replace('{module}', 'diretta'));

    // 2. Ce qui manque est la connexion du compte, et la clé n'est pas en cause.
    expect(texte).toContain(fr['outputModule.notLinkedBody']);

    // 3. Où cliquer — un bouton, pas seulement une phrase.
    const action = h.querySelector('button.output-module-banner-action');
    expect(action).not.toBeNull();
    expect(action?.textContent?.trim()).toBe(fr['outputModule.notLinkedAction']);
  });

  it("n'affiche JAMAIS le code technique à l'écran", () => {
    // Un code à l'écran n'a jamais épargné une réinstallation à personne. Il
    // reste dans le rapport de diagnostic, qui est sa place.
    const texte = rendre(COMPTE_NON_RELIE_REEL).textContent ?? '';
    expect(texte).not.toContain('module_account_not_linked');
    expect(texte).not.toContain('module_required');
    // Ni le `message` anglais du serveur, explicitement « jamais destiné à être
    // affiché tel quel » (`premium_guard.rs`) : il traversait une interface
    // traduite en onze langues sur #2419.
    expect(texte).not.toContain('paid add-on');
  });

  it('distingue « compte non relié » de « module non possédé » : ni le même texte, ni la même action', () => {
    const nonRelie = rendre(COMPTE_NON_RELIE_REEL).textContent ?? '';
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();

    const h2 = rendre(MODULE_NON_POSSEDE_REEL);
    const nonPossede = h2.textContent ?? '';

    expect(nonPossede).not.toBe(nonRelie);
    expect(nonPossede).toContain(fr['outputModule.notOwnedTitle'].replace('{module}', 'diretta'));
    expect(nonPossede).toContain(fr['outputModule.notOwnedBody']);

    // « Non possédé » est un ACHAT : un lien vers la boutique, pas le bouton
    // « relier mon compte » — relier un compte déjà relié ne répare rien.
    expect(h2.querySelector('button.output-module-banner-action')).toBeNull();
    const lien = h2.querySelector('a.output-module-banner-action') as HTMLAnchorElement | null;
    expect(lien).not.toBeNull();
    expect(lien?.getAttribute('href')).toBe('https://mozaiklabs.fr/pricing');
    expect(nonPossede).not.toContain(fr['outputModule.notLinkedAction']);
    expect(nonPossede).not.toContain(fr['outputModule.notLinkedBody']);
  });

  it("l'URL d'achat vient du serveur et n'est jamais inventée", () => {
    const sansUrl = structuredClone(MODULE_NON_POSSEDE_REEL) as Record<string, any>;
    delete sansUrl.providers[0].refusal.upgrade_url;
    const h = rendre(sansUrl);
    // Le bandeau reste — on prévient, on ne masque pas — mais sans lien mort.
    expect(bandeaux(h)).toHaveLength(1);
    expect(h.querySelector('a.output-module-banner-action')).toBeNull();
  });

  it('prévient même sur un code de refus inconnu, plutôt que de se taire', () => {
    const h = rendre({
      account_linked: true,
      licensed_modules: [],
      providers: [
        { provider: 'diretta', required_module: 'diretta', devices: 0, refusal: { code: 'un_refus_futur' } },
      ],
    });
    expect(bandeaux(h)).toHaveLength(1);
    expect(h.textContent ?? '').toContain(fr['outputModule.unknownBody']);
  });
});

describe('#2392 — le témoin : un compte relié ne voit rien changer', () => {
  it('ne rend AUCUN bandeau quand le module est possédé, même sans appareil trouvé', () => {
    const h = rendre(TEMOIN_COMPTE_RELIE);
    expect(bandeaux(h)).toHaveLength(0);
    // Rien de visible : pas un élément, pas un caractère. Svelte laisse une
    // ancre `<!---->` pour son `{#each}` vide — un commentaire, que l'on ne
    // confond pas avec « rien affiché ».
    expect(h.querySelectorAll('*')).toHaveLength(0);
    expect(h.textContent?.trim()).toBe('');
    expect(h.innerHTML.replace(/<!--.*?-->/g, '')).toBe('');
  });

  it.each([
    ['un serveur antérieur à #2392 (champ absent)', undefined],
    ['aucun fournisseur hors-arbre compilé (`null`)', null],
    ['une liste de fournisseurs vide', { account_linked: false, licensed_modules: [], providers: [] }],
    ['un instantané qui n\'est pas un objet', 'nawak'],
    ['`providers` qui n\'est pas un tableau', { providers: 42 }],
  ])('ne rend AUCUN bandeau pour %s', (_libelle, instantane) => {
    expect(bandeaux(rendre(instantane))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La décision, isolée du rendu
// ─────────────────────────────────────────────────────────────────────────────

describe('refusAAfficher', () => {
  it('rend le code exact des deux refus du serveur', () => {
    expect(refusAAfficher(COMPTE_NON_RELIE_REEL)[0].code).toBe(COMPTE_NON_RELIE);
    expect(refusAAfficher(MODULE_NON_POSSEDE_REEL)[0].code).toBe(MODULE_NON_POSSEDE);
    expect(COMPTE_NON_RELIE).toBe('module_account_not_linked');
    expect(MODULE_NON_POSSEDE).toBe('module_not_owned');
  });

  it('ne regarde jamais `devices` : un module refusé se dit même à côté de zones qui marchent', () => {
    // Un utilisateur qui a déjà un Sonos a une liste de zones NON vide et reste
    // pourtant privé de son module Diretta. Conditionner l'avertissement à une
    // liste vide rejouerait le défaut sur lui.
    const avecAppareils = structuredClone(COMPTE_NON_RELIE_REEL) as Record<string, any>;
    avecAppareils.providers[0].devices = 7;
    expect(refusAAfficher(avecAppareils)).toHaveLength(1);
  });

  it('groupe par code et dédoublonne les modules, de façon déterministe', () => {
    const deux = refusAAfficher({
      account_linked: false,
      providers: [
        { provider: 'zeta', refusal: { code: 'module_account_not_linked', module: 'zeta' } },
        { provider: 'alpha', refusal: { code: 'module_account_not_linked', module: 'alpha' } },
        { provider: 'alpha', refusal: { code: 'module_account_not_linked', module: 'alpha' } },
      ],
    });
    expect(deux).toHaveLength(1);
    expect(deux[0].modules).toEqual(['alpha', 'zeta']);
  });

  it('replie sur `required_module` puis `provider` quand `refusal.module` manque', () => {
    expect(refusAAfficher({ providers: [{ provider: 'p', required_module: 'rm', refusal: { code: 'module_not_owned' } }] })[0].modules).toEqual(['rm']);
    expect(refusAAfficher({ providers: [{ provider: 'p', refusal: { code: 'module_not_owned' } }] })[0].modules).toEqual(['p']);
    // Aucun nom lisible : le bandeau existe quand même, sans nom.
    expect(refusAAfficher({ providers: [{ refusal: { code: 'module_not_owned' } }] })[0].modules).toEqual([]);
  });

  it('range tout code non reconnu — ou absent — dans le refus générique', () => {
    expect(refusAAfficher({ providers: [{ provider: 'p', refusal: {} }] })[0].code).toBe(REFUS_INCONNU);
    expect(refusAAfficher({ providers: [{ provider: 'p', refusal: { code: 'nouveau' } }] })[0].code).toBe(REFUS_INCONNU);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le câblage — 96 fonctions exportées par la couche `api` ne sont appelées par
// aucun écran (16 % des 600). Un bandeau que personne ne monte serait le 97ᵉ
// cas : correct, testé, et invisible.
// ─────────────────────────────────────────────────────────────────────────────

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('#2392 — le bandeau est réellement monté par les écrans', () => {
  it("l'écran des ZONES lit `output_providers` et monte le bandeau", () => {
    // C'est LA décision de ce correctif. Diagnostics est l'endroit logique,
    // mais ce n'est pas là que l'utilisateur va quand aucun appareil
    // n'apparaît : le testeur Diretta a réinstallé son OS sans jamais ouvrir
    // Diagnostics. Il est venu ici.
    const vue = lire('src/components/ZoneManagerView.svelte');
    expect(vue).toContain("import OutputModuleBanner from './OutputModuleBanner.svelte'");
    expect(vue).toContain('api.getServerDiagnostics()');
    expect(vue).toContain('output_providers');
    expect(vue).toContain('<OutputModuleBanner instantane={instantaneFournisseurs} />');
  });

  it("l'écran Diagnostics monte le même bandeau, sans requête supplémentaire", () => {
    const vue = lire('src/components/DiagnosticsView.svelte');
    expect(vue).toContain("import OutputModuleBanner from './OutputModuleBanner.svelte'");
    expect(vue).toContain('<OutputModuleBanner instantane={serverDiag?.output_providers} />');
  });

  it('le bandeau est hors du bloc « aucune zone » : il prévient, il ne se masque pas', () => {
    // Le bloc de correction FIR masquait son contenu sur les zones
    // incompatibles, ce qui avait fait conclure à un abonné Premium que la
    // fonction n'existait pas. On ne recommence pas.
    const vue = lire('src/components/ZoneManagerView.svelte');
    const bandeau = vue.indexOf('<OutputModuleBanner');
    const blocVide = vue.indexOf('$zones.length === 0');
    expect(bandeau).toBeGreaterThan(-1);
    expect(blocVide).toBeGreaterThan(-1);
    expect(bandeau).toBeLessThan(blocVide);
  });
});

describe('#2392 — les onze langues sont remplies', () => {
  const CLES = [
    'outputModule.notLinkedTitle',
    'outputModule.notLinkedBody',
    'outputModule.notLinkedAction',
    'outputModule.notOwnedTitle',
    'outputModule.notOwnedBody',
    'outputModule.notOwnedAction',
    'outputModule.unknownTitle',
    'outputModule.unknownBody',
    'outputModule.genericName',
  ] as const;

  const DICTS: Record<string, Record<string, string>> = {
    de: lDe, en: lEn, es: lEs, fr: lFr, hu: lHu, it: lIt,
    ja: lJa, ko: lKo, ro: lRo, sv: lSv, zh: lZh,
  };

  it.each(Object.keys(DICTS))('%s porte les neuf clés, non vides', (langue) => {
    for (const cle of CLES) {
      const valeur = DICTS[langue][cle];
      expect(valeur, `${langue} — ${cle}`).toBeTruthy();
      expect(valeur.trim().length, `${langue} — ${cle}`).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(DICTS))('%s garde le repère {module} dans les trois titres', (langue) => {
    // Sans lui, l'utilisateur lit « un module est inactif » sans savoir lequel.
    for (const cle of ['outputModule.notLinkedTitle', 'outputModule.notOwnedTitle', 'outputModule.unknownTitle']) {
      expect(DICTS[langue][cle], `${langue} — ${cle}`).toContain('{module}');
    }
  });

  it.each(Object.keys(DICTS))('%s ne confond pas les deux refus', (langue) => {
    const d = DICTS[langue];
    expect(d['outputModule.notLinkedTitle']).not.toBe(d['outputModule.notOwnedTitle']);
    expect(d['outputModule.notLinkedBody']).not.toBe(d['outputModule.notOwnedBody']);
    expect(d['outputModule.notLinkedAction']).not.toBe(d['outputModule.notOwnedAction']);
  });
});
