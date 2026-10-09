// @vitest-environment jsdom
//
// renesenses/tune-web-client#1866 — la nouvelle interface n'avait plus aucune
// bascule pour le partage communautaire.
//
// `community_sync_enabled` (« Partage communautaire des métadonnées ») vivait
// dans l'ancien `SettingsView` et est parti avec lui (d5ed7deb, phase 5) ;
// `community_contribution_enabled`, que le serveur publie tout prêt dans le
// bloc `community_contribution` de `GET /system/config`, n'avait jamais été
// affiché. L'opt-in était donc impossible sans `PATCH` à la main.
//
// Ce banc MONTE les Réglages au niveau DÉBUTANT, ouvre Système et regarde le
// DOM de la carte Cloud : les deux cases, leur état lu du serveur, le PATCH
// envoyé, et la mention « sans effet » quand la télémétrie est coupée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { contributionDepuisConfig, reglageVrai } from '../partageCommunautaire';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

const LIBELLE_SERVEUR = 'Partager mes métadonnées enrichies avec la communauté (serveur)';
const DESCRIPTION_SERVEUR = 'Ce qui part, dit par le serveur.';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let config: Record<string, unknown>;
let telemetrie: boolean;
let patchEchoue = false;
const patchs: Record<string, unknown>[] = [];

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ouvrirSysteme(): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabSystem'],
  );
  expect(onglet, 'onglet Système introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  flushSync();
  await attendre();
  // Témoin : la carte Cloud est rendue (la télémétrie y est), sinon
  // « absent » ne prouverait rien.
  expect(hote.textContent).toContain(fr['settings.telemetry']);
  return hote;
}

const caseSync = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>('input[type="checkbox"][data-cle="community_sync_enabled"]');
const caseContribution = (h: HTMLElement) =>
  h.querySelector<HTMLInputElement>('input[type="checkbox"][data-cle="community_contribution_enabled"]');

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  telemetrie = true;
  patchEchoue = false;
  patchs.length = 0;
  config = {
    music_dirs: [],
    community_contribution_enabled: false,
    community_contribution: {
      setting_key: 'community_contribution_enabled',
      enabled: false,
      effective: false,
      default: false,
      label: LIBELLE_SERVEUR,
      description: DESCRIPTION_SERVEUR,
    },
  };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH' && /\/system\/config(\?|$)/.test(u)) {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patchs.push(corps);
      if (patchEchoue) return json({ error: 'boom' }, 500);
      // Le serveur relit : `effective` = télémétrie ET choix.
      for (const [k, v] of Object.entries(corps)) {
        config[k] = v;
        if (k === 'community_contribution_enabled') {
          const b = config.community_contribution as Record<string, unknown>;
          b.enabled = v;
          b.effective = telemetrie && v === true;
        }
      }
      return json({ ok: true });
    }
    if (/\/system\/config(\?|$)/.test(u)) return json(config);
    if (/\/cloud\/telemetry\/status/.test(u)) return json({ enabled: telemetrie, env_override: false });
    if (/\/(zones|profiles|devices|playlists|shortcuts)(\?|$)/.test(u)) return json([]);
    return json({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#1866 — lecture des réglages', () => {
  it('lit les booléens comme le serveur (`consent::est_vrai`)', () => {
    for (const v of [true, 'true', '"true"', '1', 1, 'yes', 'on', ' TRUE ']) expect(reglageVrai(v), String(v)).toBe(true);
    for (const v of [false, 'false', undefined, null, '', 'oui', 0, 2, {}]) expect(reglageVrai(v), String(v)).toBe(false);
  });

  it('le bloc `community_contribution` est lu tel quel, et son absence ne fabrique pas de case', () => {
    expect(contributionDepuisConfig({})).toBeNull();
    const c = contributionDepuisConfig(config)!;
    expect(c).toEqual({
      cle: 'community_contribution_enabled', active: false, effective: false,
      libelle: LIBELLE_SERVEUR, description: DESCRIPTION_SERVEUR,
    });
  });

  it('les nouveaux libellés existent dans les onze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const k of ['settings.communitySync', 'settings.communitySyncHint', 'settings.communityContribution', 'settings.communityNeedsTelemetry']) {
        expect(d[k], `${code} : ${k}`).toBeTruthy();
      }
    }
  });
});

describe('#1866 — les deux bascules sont dans Réglages › Système › Cloud', () => {
  it('au niveau débutant, les deux cases sont rendues, décochées par défaut, avec le libellé du serveur', { timeout: 60_000 }, async () => {
    const h = await ouvrirSysteme();
    const s = caseSync(h);
    const c = caseContribution(h);
    expect(s, 'aucune bascule « Partage communautaire »').not.toBeNull();
    expect(c, 'aucune bascule de contribution').not.toBeNull();
    expect(s!.checked).toBe(false);
    expect(c!.checked).toBe(false);
    expect(h.textContent).toContain(fr['settings.communitySync']);
    expect(h.textContent).toContain(LIBELLE_SERVEUR);
    expect(h.textContent).toContain(DESCRIPTION_SERVEUR);
  });

  it('la valeur posée côté serveur est lue (chaîne "true")', { timeout: 60_000 }, async () => {
    config.community_sync_enabled = 'true';
    Object.assign(config.community_contribution as object, { enabled: true, effective: true });
    const h = await ouvrirSysteme();
    expect(caseSync(h)!.checked).toBe(true);
    expect(caseContribution(h)!.checked).toBe(true);
    expect(h.textContent).not.toContain(fr['settings.communityNeedsTelemetry']);
  });

  it('cocher envoie PATCH { community_sync_enabled: true } puis { community_contribution_enabled: true }', { timeout: 60_000 }, async () => {
    const h = await ouvrirSysteme();
    caseSync(h)!.click();
    await attendre();
    expect(patchs).toContainEqual({ community_sync_enabled: true });
    expect(caseSync(h)!.checked).toBe(true);
    caseContribution(h)!.click();
    await attendre();
    expect(patchs).toContainEqual({ community_contribution_enabled: true });
    expect(caseContribution(h)!.checked).toBe(true);
  });

  it('télémétrie coupée : le choix est dit « sans effet » (état `effective`)', { timeout: 60_000 }, async () => {
    telemetrie = false;
    config.community_sync_enabled = true;
    Object.assign(config.community_contribution as object, { enabled: true, effective: false });
    const h = await ouvrirSysteme();
    expect(caseSync(h)!.checked).toBe(true);
    expect(caseContribution(h)!.checked).toBe(true);
    const mentions = h.textContent!.split(fr['settings.communityNeedsTelemetry']).length - 1;
    expect(mentions, 'une mention par bascule sans effet').toBe(2);
  });

  it('🔴 un PATCH refusé remet la case dans son état et le dit', { timeout: 60_000 }, async () => {
    patchEchoue = true;
    const h = await ouvrirSysteme();
    caseSync(h)!.click();
    await attendre();
    expect(patchs).toContainEqual({ community_sync_enabled: true });
    expect(caseSync(h)!.checked).toBe(false);
    expect(h.textContent).toContain(fr['settings.errSaveFailed']);
  });
});
