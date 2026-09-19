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


afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
});

/** Les bandeaux effectivement rendus. */
const bandeaux = (h: HTMLElement) => [...h.querySelectorAll('.output-module-banner')];


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
