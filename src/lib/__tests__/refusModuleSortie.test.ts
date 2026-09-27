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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
// 🔴 L'écran RÉEL des Zones, et pas le bandeau seul. C'est la garantie que le
// 19/09 a emportée : le bandeau était juste, c'est son hôte qui avait disparu.
// Monter le composant isolément laisserait repasser exactement ce défaut.
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { etatDesZones } from '../chargementDesZones';
import { activeView } from '../stores/navigation';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { locale } from '../i18n';
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

/** Une zone qui MARCHE, présente à l'écran pendant tout le fichier.
 *
 *  Elle n'est pas décorative : elle interdit au bandeau de se cacher derrière
 *  « aucune zone ». L'utilisateur qui a déjà un Sonos a une liste NON vide et
 *  reste pourtant privé de son module Diretta en silence — c'est sur lui que
 *  le défaut se rejouerait si l'avertissement était réservé à la liste vide.
 */
const ZONE_QUI_MARCHE = { id: 1, name: 'Salon', state: 'stopped', volume: 0.4, output_type: 'local' };

/** La réponse de `/system/diagnostics` servie au montage suivant. */
let diagnostics: Record<string, unknown> = {};

const json = (corps: unknown) =>
  new Response(JSON.stringify(corps), { headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  diagnostics = {};
  zones.set([ZONE_QUI_MARCHE] as never);
  currentZoneId.set(1);
  activeView.set('zonemanager');
  v2SettingsTarget.set(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL) => {
      const url = String(entree);
      // `/system/diagnostics` sert DEUX lecteurs : `output_providers` (ici) et
      // `zones_doublons` (DUP-1). Une seule réponse pour les deux.
      if (url.endsWith('/system/diagnostics')) return json(diagnostics);
      if (url.endsWith('/zones')) return json([ZONE_QUI_MARCHE]);
      if (url.endsWith('/zones/stereo-pairs')) return json([]);
      if (url.endsWith('/devices')) return json([]);
      if (url.includes('tune-tested.json')) return json({ version: 1, count: 0, devices: [] });
      throw new Error(`requête inattendue : ${url}`);
    }),
  );
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  etatDesZones.set('jamais');
  activeView.set('home');
  v2SettingsTarget.set(null);
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Monte l'écran Zones avec cet instantané sous `output_providers`. */
async function ouvrirZones(instantane: unknown): Promise<HTMLElement> {
  diagnostics = { zones_doublons: [], output_providers: instantane };
  monte = mount(ZonesV2, { target: hote! }) as Record<string, unknown>;
  flushSync();
  // Deux tours de boucle : `/system/diagnostics` est demandé dans un effet, et
  // sa réponse n'atteint le DOM qu'au balayage suivant.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
  return hote!;
}

/** Les bandeaux effectivement rendus. */
const bandeaux = (h: HTMLElement) => [...h.querySelectorAll('.output-module-banner')];

/** Le texte lisible d'un bandeau : ce que l'utilisateur lit vraiment. */
const texteDu = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim();


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
//
// 🔴 C'est EXACTEMENT ce qui s'est produit du 19 au 27/09/2026. `d5ed7deb`
// (« Phase 5 : retirer l'ancienne interface ») a supprimé `ZoneManagerView`,
// `DiagnosticsView` et `OutputModuleBanner` d'un seul geste. `refusAAfficher`
// est resté juste, couvert par les cinq témoins ci-dessus, et sans un seul
// appelant de production : Zones ne disait plus rien. Les témoins de la
// décision étaient tous verts pendant ces huit jours.
//
// Ce bloc-ci est le seul qui aurait rougi. Il monte l'écran ZONES — celui où
// l'utilisateur va quand aucun appareil n'apparaît, pas Diagnostics — et lit
// le bandeau RENDU. Et il vérifie nommément les deux garanties que
// `docs/garanties-sans-temoin-phase5.md` a signalées perdues :
// « nomme le module » et « dit que l'installation n'est pas en cause ».
// ─────────────────────────────────────────────────────────────────────────────

/** Le texte du dictionnaire, avec le nom du module substitué — pas une
 *  reformulation : c'est la chaîne exacte que `fr.ts` porte. */
const attendu = (cle: keyof typeof fr, module: string) => fr[cle].replace('{module}', module);

describe('#2392 — Zones DIT le refus, sur le DOM monté', () => {
  it('compte non relié : le bandeau nomme diretta et dédouane l’installation', async () => {
    const h = await ouvrirZones(COMPTE_NON_RELIE_REEL);

    // Une seule zone qui marche est à l'écran : le bandeau ne se cache pas
    // derrière « aucune zone ».
    expect(h.querySelector('.grille .carte'), 'la zone Salon est bien rendue').not.toBeNull();

    const vus = bandeaux(h);
    expect(vus).toHaveLength(1);
    expect(vus[0].getAttribute('data-refus')).toBe(COMPTE_NON_RELIE);

    const txt = texteDu(vus[0]);
    // GARANTIE 1 — il NOMME le module.
    expect(txt).toContain('diretta');
    expect(txt).toContain(attendu('outputModule.notLinkedTitle', 'diretta'));
    // GARANTIE 2 — il dit que l'installation n'est pas en cause, et que la clé
    // de licence ne l'est pas davantage. C'est la phrase qui a coûté une
    // réinstallation de Fedora et trente minutes de recompilation.
    expect(txt).toContain(attendu('outputModule.notLinkedBody', 'diretta'));
    expect(fr['outputModule.notLinkedBody']).toContain("ni un problème d'installation");
    // Aucun repère non substitué ne reste sous les yeux de l'utilisateur.
    expect(txt).not.toContain('{module}');
    // Le code technique reste au diagnostic : il n'a jamais épargné une
    // réinstallation à personne.
    expect(txt).not.toContain('module_account_not_linked');
  });

  it('module non possédé : le bandeau dit que le serveur n’est pas en cause, et mène à la boutique', async () => {
    const h = await ouvrirZones(MODULE_NON_POSSEDE_REEL);
    const vus = bandeaux(h);
    expect(vus).toHaveLength(1);
    expect(vus[0].getAttribute('data-refus')).toBe(MODULE_NON_POSSEDE);

    const txt = texteDu(vus[0]);
    expect(txt).toContain('diretta');
    expect(txt).toContain(attendu('outputModule.notOwnedTitle', 'diretta'));
    expect(txt).toContain(attendu('outputModule.notOwnedBody', 'diretta'));
    expect(fr['outputModule.notOwnedBody']).toContain("l'installation de votre serveur, elle, n'est pas en cause");
    expect(txt).not.toContain('{module}');

    // L'adresse vient du SERVEUR (`upgrade_url`), elle n'est jamais inventée ici.
    const lien = vus[0].querySelector<HTMLAnchorElement>('a.output-module-banner-action')!;
    expect(lien).not.toBeNull();
    expect(lien.getAttribute('href')).toBe('https://mozaiklabs.fr/pricing');
    expect(lien.getAttribute('rel')).toContain('noopener');
    expect(lien.textContent?.trim()).toBe(fr['outputModule.notOwnedAction']);
  });

  it('code inconnu : Zones prévient quand même, et renvoie au diagnostic', async () => {
    // Le cas qui empêche de retomber dans le silence de #2392 si un serveur
    // plus récent nomme un troisième refus. Masquer est la faute déjà commise.
    const h = await ouvrirZones({
      account_linked: true,
      licensed_modules: [],
      providers: [
        {
          provider: 'diretta',
          required_module: 'diretta',
          devices: 0,
          refusal: { error: 'module_required', code: 'un_refus_de_demain', module: 'diretta' },
        },
      ],
    });
    const vus = bandeaux(h);
    expect(vus).toHaveLength(1);
    expect(vus[0].getAttribute('data-refus')).toBe(REFUS_INCONNU);

    const txt = texteDu(vus[0]);
    expect(txt).toContain('diretta');
    expect(txt).toContain(attendu('outputModule.unknownTitle', 'diretta'));
    expect(txt).toContain(fr['outputModule.unknownBody']);
    expect(txt).not.toContain('{module}');
    // Aucune action n'est proposée : on ne sait pas laquelle serait juste.
    expect(vus[0].querySelector('.output-module-banner-action')).toBeNull();
  });

  it('🔴 SE TAIT quand le serveur ne signale aucun refus', async () => {
    // Compte relié, module possédé, `devices: 0` : il cherche vraiment et ne
    // trouve rien. Ça ne se répare pas en reliant un compte, et l'envoyer vers
    // un écran de compte pour un défaut de réseau serait pire que se taire.
    expect(bandeaux(await ouvrirZones(TEMOIN_COMPTE_RELIE))).toHaveLength(0);
  });

  it('🔴 SE TAIT devant un serveur antérieur à #2392, et devant un instantané nul', async () => {
    // `output_providers` absent : aucun refus inventé.
    expect(bandeaux(await ouvrirZones(undefined))).toHaveLength(0);
    if (monte) unmount(monte);
    monte = null;
    hote!.innerHTML = '';
    // `output_providers: null` : le serveur répond, aucun fournisseur hors-arbre.
    expect(bandeaux(await ouvrirZones(null))).toHaveLength(0);
  });

  it('le bouton mène à Réglages ▸ Système ▸ Cloud', async () => {
    const h = await ouvrirZones(COMPTE_NON_RELIE_REEL);
    const bouton = h.querySelector<HTMLButtonElement>('button.output-module-banner-action')!;
    expect(bouton).not.toBeNull();
    expect(bouton.textContent?.trim()).toBe(fr['outputModule.notLinkedAction']);

    expect(get(v2SettingsTarget)).toBeNull();
    bouton.click();
    flushSync();

    // Le MÊME trajet que `OutputModulesPanel.ouvrirCompte()` en variante v2 :
    // deux boutons portant le même libellé ne doivent pas mener à deux endroits.
    expect(get(v2SettingsTarget)).toEqual({ tab: 'system', section: 'cloud' });
    expect(get(activeView)).toBe('settings');
  });

  it('deux fournisseurs refusés pour le même motif : UN bandeau, les deux modules nommés', async () => {
    const h = await ouvrirZones({
      account_linked: false,
      licensed_modules: [],
      providers: [
        { provider: 'diretta', required_module: 'diretta', devices: 0, refusal: { code: COMPTE_NON_RELIE, module: 'diretta' } },
        { provider: 'roon', required_module: 'roon', devices: 0, refusal: { code: COMPTE_NON_RELIE, module: 'roon' } },
      ],
    });
    const vus = bandeaux(h);
    expect(vus).toHaveLength(1);
    const txt = texteDu(vus[0]);
    expect(txt).toContain('diretta');
    expect(txt).toContain('roon');
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
