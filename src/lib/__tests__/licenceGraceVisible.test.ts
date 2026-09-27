// @vitest-environment jsdom
//
// #1999 — la grâce hors ligne doit se VOIR.
//
// Le serveur accorde 14 jours de tolérance quand la vérification de licence ne
// peut pas aboutir (`tune-core/src/license.rs`, `GRACE_PERIOD_DAYS`). Didier
// (fil forum 1491) posait la question avant d'acheter : rien à l'écran n'y
// répondait, et le jour de la retombée les fonctions Premium disparaissaient
// sans un mot.
//
// 🔴 CE QUE CE FICHIER A LONGTEMPS OMIS. Il s'appelle « visible » et son
// en-tête promettait que la grâce « doit se VOIR ». Son témoin de rendu a
// disparu avec `SettingsView` (commit `d5ed7deb`, 19/09/2026, « Phase 5 :
// retirer l'ancienne interface ») et n'a jamais été rebasé sur `SettingsV2` :
// il ne restait que le magasin et les onze dictionnaires. Un test qui promet
// l'écran et ne le regarde pas est pire qu'absent — il rassure. Le premier
// banc ci-dessous MONTE donc l'écran Réglages, ouvre l'onglet Licence et lit
// le DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { licenseState, offlineGrace } from '../stores/license';
import type { LicenseOfflineGrace } from '../api';
import * as locales from './lesOnzeLangues';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'] as const;

const CLES = [
  'settings.licenseGraceTitle',
  'settings.licenseGraceBody',
  'settings.licenseGraceLapsedTitle',
  'settings.licenseGraceLapsedBody',
  'settings.licenseGraceNeverTitle',
  'settings.licenseGraceNeverBody',
  'settings.licenseGraceDayOne',
  'settings.licenseGraceDayOther',
  'settings.licenseOfflineRule',
] as const;

function poser(grace: unknown) {
  licenseState.update((s) => ({ ...s, loaded: true, offlineGrace: grace as never }));
}

/* =========================================================================
 * Les trois états, tels que le serveur les décrit.
 *
 * `tune-core/src/license.rs`, `offline_grace()` : l'état « jamais vérifiée »
 * n'est PAS une phase à lui — c'est `Expired` avec `since`/`until` nuls (la
 * branche `let Some(anchor) = anchor else`). L'écran doit donc distinguer les
 * deux `expired` par la présence de l'ancre, comme le faisait l'ancien.
 * ====================================================================== */

const EN_COURS: LicenseOfflineGrace = {
  phase: 'grace',
  source: 'key',
  since: '2026-08-15T10:00:00Z',
  until: '2026-08-29T10:00:00Z',
  days_remaining: 3,
  total_days: 14,
  days_since_validation: 11,
};

const ECOULEE: LicenseOfflineGrace = {
  phase: 'expired',
  source: 'account',
  since: '2026-08-01T10:00:00Z',
  until: '2026-08-15T10:00:00Z',
  days_remaining: 0,
  total_days: 14,
  days_since_validation: 27,
};

const JAMAIS: LicenseOfflineGrace = {
  phase: 'expired',
  source: 'key',
  since: null,
  until: null,
  days_remaining: 0,
  total_days: 14,
  days_since_validation: 0,
};

const FRAICHE: LicenseOfflineGrace = {
  phase: 'ok',
  source: 'key',
  since: '2026-08-27T10:00:00Z',
  until: '2026-09-10T10:00:00Z',
  days_remaining: 14,
  total_days: 14,
  days_since_validation: 0,
};

/* =========================================================================
 * Le témoin de RENDU : l'écran monté, l'onglet Licence ouvert, et ce qui
 * s'affiche vraiment.
 * ====================================================================== */

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const fetchSimule = vi.fn(async () => json({}));

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

/**
 * Monte les Réglages et ouvre l'onglet Licence — celui où `OutputModulesPanel`
 * envoie déjà par `v2SettingsTarget.set({ tab: 'license', … })`.
 */
async function ongletLicence(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} }) as Record<string, unknown>;
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tunePremiumLicense'],
  );
  expect(onglet, 'onglet Licence introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  return hote;
}

/** Le bandeau de grâce, reconnu par son marqueur — jamais par son texte. */
function bandeau(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('[data-grace]');
}

/** La ligne de règle chiffrée. */
function regle(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('[data-grace-rule]');
}

describe('grâce hors ligne — ce que l’écran AFFICHE (#1999)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
    vi.stubGlobal('fetch', fetchSimule);
    fetchSimule.mockClear();
    licenseState.set({
      loaded: true,
      tier: 'premium',
      licenseKey: 'ABCD-EFGH-IJKL',
      expiresAt: null,
      features: {},
      zoneLimit: null,
      hardwareFingerprint: null,
      sessionConflict: null,
      offlineGrace: null,
    });
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    if (hote) hote.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  it('fenêtre EN COURS : le titre, les deux bornes et le reste à courir sont à l’écran', async () => {
    poser(EN_COURS);
    const el = await ongletLicence();

    const b = bandeau(el);
    expect(b, 'aucun bandeau de grâce sur l’écran monté').not.toBeNull();
    expect(b!.dataset.grace).toBe('grace');
    expect(b!.textContent).toContain(fr['settings.licenseGraceTitle']);

    // Les dates viennent du champ, lues dans la langue de l'écran — pas un ISO
    // brut recraché à l'utilisateur.
    const depuis = new Date(EN_COURS.since!).toLocaleDateString('fr', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const jusqua = new Date(EN_COURS.until!).toLocaleDateString('fr', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    expect(b!.textContent, 'la date de dernière vérification n’est pas affichée').toContain(depuis);
    expect(b!.textContent, 'la fin de fenêtre n’est pas affichée').toContain(jusqua);
    expect(b!.textContent).not.toContain(EN_COURS.since!);
    expect(b!.textContent).not.toContain('{since}');
    expect(b!.textContent).not.toContain('{until}');
    expect(b!.textContent).not.toContain('{remaining}');

    // « encore 3 jours » — le pluriel, pas « 3 jour ».
    expect(b!.textContent).toContain(
      fr['settings.licenseGraceDayOther'].replace('{days}', '3'),
    );

    // Le cadre est celui qui rassure : la fenêtre court, le Premium est intact.
    expect(b!.classList.contains('okbox'), 'un cadre d’alerte sur une fenêtre qui court').toBe(true);
    expect(b!.classList.contains('warnbox')).toBe(false);
  });

  it('fenêtre en cours, DERNIER jour : le singulier est affiché', async () => {
    poser({ ...EN_COURS, days_remaining: 1 });
    const el = await ongletLicence();
    const b = bandeau(el)!;
    expect(b.textContent, 'le singulier n’est pas servi').toContain(
      fr['settings.licenseGraceDayOne'],
    );
    // Et pas la forme plurielle, qui donnerait « encore 1 jours ».
    expect(b.textContent).not.toContain(
      fr['settings.licenseGraceDayOther'].replace('{days}', '1'),
    );
  });

  it('fenêtre ÉCOULÉE : la mise en pause est dite, avec la durée du serveur', async () => {
    poser(ECOULEE);
    const el = await ongletLicence();
    const b = bandeau(el);
    expect(b, 'aucun bandeau quand la fenêtre est écoulée').not.toBeNull();
    expect(b!.dataset.grace).toBe('lapsed');
    expect(b!.textContent).toContain(fr['settings.licenseGraceLapsedTitle']);
    expect(b!.textContent).toContain(
      new Date(ECOULEE.since!).toLocaleDateString('fr', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    );
    expect(b!.textContent).not.toContain('{since}');
    expect(b!.textContent).not.toContain('{days}');
    expect(b!.classList.contains('warnbox')).toBe(true);
  });

  it('JAMAIS vérifiée : l’autre message, et aucune date inventée', async () => {
    poser(JAMAIS);
    const el = await ongletLicence();
    const b = bandeau(el);
    expect(b, 'aucun bandeau quand la licence n’a jamais été vérifiée').not.toBeNull();
    expect(b!.dataset.grace).toBe('never');
    expect(b!.textContent).toContain(fr['settings.licenseGraceNeverTitle']);
    expect(b!.textContent).toContain(fr['settings.licenseGraceNeverBody']);
    // `since` est nul : pas de « depuis le », pas d'Invalid Date, pas de 1970.
    expect(b!.textContent).not.toContain(fr['settings.licenseGraceLapsedTitle']);
    expect(b!.textContent).not.toContain('Invalid');
    expect(b!.textContent).not.toContain('1970');
  });

  it('🔴 se TAIT quand la vérification est fraîche (`phase === "ok"`)', async () => {
    // Un serveur qui a manqué un battement va très bien. Un bandeau là
    // transformerait une tolérance en inquiétude.
    poser(FRAICHE);
    const el = await ongletLicence();
    expect(bandeau(el), 'un bandeau s’affiche alors que tout va bien').toBeNull();
    for (const cle of [
      'settings.licenseGraceTitle',
      'settings.licenseGraceLapsedTitle',
      'settings.licenseGraceNeverTitle',
    ]) {
      expect(el.textContent, `${cle} affiché en phase ok`).not.toContain(fr[cle]);
    }
  });

  it('serveur qui ne connaît pas le champ : rien, ni bandeau ni règle', async () => {
    poser(null);
    const el = await ongletLicence();
    expect(bandeau(el)).toBeNull();
    expect(regle(el), 'une règle chiffrée sur un serveur qui n’envoie rien').toBeNull();
  });

  it('🔴 la règle chiffrée vient du CHAMP, jamais d’un « 14 » écrit en dur', async () => {
    // La fenêtre est déjà passée de 30 à 14 jours une fois. Le jour où elle
    // rebouge, l'écran doit suivre tout seul : on le prouve en servant une
    // valeur que personne n'aurait pu recopier.
    poser({ ...FRAICHE, total_days: 21 });
    const el = await ongletLicence();
    const r = regle(el);
    expect(r, 'la règle hors ligne n’est affichée nulle part').not.toBeNull();
    expect(r!.textContent).toContain(fr['settings.licenseOfflineRule'].replace('{days}', '21'));
    expect(r!.textContent, 'la durée est figée dans l’écran').not.toMatch(/\b14\b/);
    expect(r!.textContent).not.toContain('{days}');
  });

  it('la règle se lit AUSSI quand tout va bien : c’est la question d’avant l’achat', async () => {
    // « Et si je n'ai pas Internet ? » (Didier, fil 1491, avant son achat). La
    // réponse doit être lisible sans attendre la panne : la règle s'affiche donc
    // sur l'état BRUT, pendant que le bandeau, lui, se tait.
    poser(FRAICHE);
    const el = await ongletLicence();
    expect(bandeau(el)).toBeNull();
    expect(regle(el)!.textContent).toContain(
      fr['settings.licenseOfflineRule'].replace('{days}', '14'),
    );
  });
});

describe('grâce hors ligne — ce que le magasin annonce', () => {
  it('se tait quand la vérification est fraîche', () => {
    // Un serveur qui a manqué un battement va très bien. Afficher une bannière
    // là serait du bruit — et transformerait une tolérance en inquiétude.
    poser(FRAICHE);
    expect(get(offlineGrace)).toBeNull();
  });

  it('annonce la fenêtre en cours, avec ses deux bornes', () => {
    poser(EN_COURS);
    const g = get(offlineGrace);
    expect(g?.phase).toBe('grace');
    expect(g?.since).toBe('2026-08-15T10:00:00Z');
    expect(g?.until).toBe('2026-08-29T10:00:00Z');
    expect(g?.days_remaining).toBe(3);
    expect(g?.total_days).toBe(14);
  });

  it('annonce la retombée une fois la fenêtre écoulée', () => {
    poser(ECOULEE);
    expect(get(offlineGrace)?.phase).toBe('expired');
  });

  it('reste muet face à un serveur qui ne connaît pas le champ', () => {
    // Compatibilité descendante : sur une version antérieure du serveur le
    // champ est absent. L'interface doit se taire, pas afficher un compte à
    // rebours inventé.
    poser(null);
    expect(get(offlineGrace)).toBeNull();
  });
});

describe('grâce hors ligne — le message', () => {
  const dicts = locales as unknown as Record<string, Record<string, string>>;

  it('est traduit dans les onze langues', () => {
    for (const langue of LANGUES) {
      const dict = dicts[langue];
      expect(dict, `dictionnaire ${langue} absent`).toBeTruthy();
      for (const cle of CLES) {
        expect(dict[cle], `${langue} → ${cle}`).toBeTruthy();
      }
    }
  });

  it('garde les substitutions attendues dans chaque langue', () => {
    // Une traduction qui perd `{until}` affiche une phrase tronquée : le
    // testeur lit « actives jusqu'au . » et n'apprend rien.
    for (const langue of LANGUES) {
      const dict = dicts[langue];
      for (const jeton of ['{since}', '{until}', '{remaining}']) {
        expect(
          dict['settings.licenseGraceBody'].includes(jeton),
          `${langue} : ${jeton} manquant dans licenseGraceBody`,
        ).toBe(true);
      }
      for (const jeton of ['{since}', '{days}']) {
        expect(
          dict['settings.licenseGraceLapsedBody'].includes(jeton),
          `${langue} : ${jeton} manquant dans licenseGraceLapsedBody`,
        ).toBe(true);
      }
      expect(dict['settings.licenseOfflineRule'].includes('{days}')).toBe(true);
      expect(dict['settings.licenseGraceDayOther'].includes('{days}')).toBe(true);
    }
  });

  it("n'écrit jamais la durée en dur : le chiffre vient du serveur", () => {
    // La grâce est passée de 30 à 14 jours une fois déjà. Un « 14 » recopié
    // dans une traduction survivrait au prochain changement et mentirait.
    for (const langue of LANGUES) {
      const dict = dicts[langue];
      for (const cle of ['settings.licenseOfflineRule', 'settings.licenseGraceLapsedBody']) {
        expect(/\b14\b/.test(dict[cle]), `${langue} → ${cle} contient un 14 en dur`).toBe(false);
      }
    }
  });

  it('reste factuel : aucune formule alarmiste sur la fenêtre en cours', () => {
    // La tolérance existe justement pour couvrir une coupure réseau. Le
    // message qui l'annonce ne doit pas se lire comme une panne.
    const frDict = dicts.fr;
    expect(frDict['settings.licenseGraceTitle']).toBe('Hors ligne — votre Premium reste actif');
    expect(frDict['settings.licenseGraceBody']).toContain('restent actives');
    expect(frDict['settings.licenseGraceBody']).toContain("Vous n'avez rien à faire");
    for (const mot of ['erreur', 'échec', 'invalide', 'attention', 'urgent']) {
      expect(frDict['settings.licenseGraceTitle'].toLowerCase()).not.toContain(mot);
    }
  });
});
