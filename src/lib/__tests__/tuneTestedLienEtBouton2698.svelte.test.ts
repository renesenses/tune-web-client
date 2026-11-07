// @vitest-environment jsdom
//
// web#2698 — Tune tested : (1) le badge mène à la fiche de L'APPAREIL, pas à la
// page générale ; (2) « Proposer pour Tune tested » est accessible à tout
// moment depuis Réglages › Appareils, et la fenêtre dit ce qui manque au lieu
// d'échouer en silence.
//
// Le faux serveur rend ce que rend le vrai `GET /zones/{id}/tune-tested`
// (tune-server-rust#7922) : `eligible`, `reason`, `remaining_seconds`, `preview`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import BadgeTuneTested from '../../components/v2/BadgeTuneTested.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { zones } from '../stores/zones';
import { oublierCatalogue, urlPageAppareil, URL_PAGE_PUBLIQUE, type AppareilTuneTested } from '../tuneTested';
import { entreesMenuZone } from '../menuZone';
import fr from '../locales/fr';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';
import type { Zone } from '../types';

const DELAI = 60_000;

const APPAREIL: AppareilTuneTested = {
  brand: 'Eversolo', model: 'DMP-A8', output_type: 'dlna',
  settings: {}, households: 3, validated_at: null, note: null,
};
const ZONE = { id: 7, name: 'Salon', output_type: 'dlna', output_device_id: 'dlna-1', brand: 'Eversolo', model: 'DMP-A8', volume: 0.3, state: 'stopped' } as unknown as Zone;

const APERCU = {
  schema_version: 1, device_key: 'a'.repeat(64), manufacturer: 'Eversolo', model: 'DMP-A8',
  commercial_name: null, output_type: 'dlna', formats: [], gapless_observed: true,
  error_free_seconds: 2400, tune_version: '1.0.0-rc11', platform: 'linux', instance_id: 'essai',
};

let etatServeur: () => Response;
let envois: unknown[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  envois = [];
  oublierCatalogue();
  etatServeur = () => json({
    eligible: false, seconds_without_error: 2400, threshold_seconds: 3600, remaining_seconds: 1200,
    already_proposed: false, reason: 'below_threshold', preview: APERCU,
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/tune-tested.json')) return json({ version: 1, count: 1, devices: [APPAREIL] });
    if (/\/zones\/7\/tune-tested/.test(u)) {
      if (init?.method === 'POST') { envois.push(JSON.parse(String(init.body))); return json({ status: 'ok', already_proposed: true }); }
      return etatServeur();
    }
    if (/\/zones(\?|$)/.test(u)) return json([ZONE]);
    return json(/\/(profiles|devices|playlists|shortcuts|groups)(\?|$)/.test(u) ? [] : {});
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  zones.set([ZONE]);
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  oublierCatalogue();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function carteZone(): Promise<HTMLElement> {
  v2SettingsTarget.set({ tab: 'devices', section: 'perZone' } as any);
  monte = mount(SettingsV2, { target: hote!, props: {} });
  flushSync();
  await attendre();
  if (!hote!.querySelector('#zc-7')) {
    hote!.querySelector<HTMLButtonElement>('button.ligne[data-zone="i:7"]')?.click();
    flushSync();
    await attendre();
  }
  const carte = hote!.querySelector<HTMLElement>('#zc-7');
  expect(carte, 'carte de la zone absente').not.toBeNull();
  return carte!;
}

const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe('#2698 point 1 — le lien du badge', () => {
  it('mène à l’appareil : marque, modèle et sortie dans l’adresse', () => {
    const u = new URL(urlPageAppareil(APPAREIL));
    expect(u.origin + u.pathname).toBe(URL_PAGE_PUBLIQUE);
    expect(u.searchParams.get('brand')).toBe('Eversolo');
    expect(u.searchParams.get('q')).toBe('DMP-A8');
    expect(u.searchParams.get('type')).toBe('dlna');
  });

  it('encode ce qui doit l’être, et la page du site relit exactement la marque et le modèle', () => {
    const url = urlPageAppareil({ brand: 'B&W', model: 'Zeppelin Wireless #2 é', output_type: null });
    expect(url).not.toContain(' ');
    expect(url).not.toMatch(/[&?]q=[^&]*&[^b]/);
    const p = new URL(url).searchParams;
    expect(p.get('brand')).toBe('B&W');
    expect(p.get('q')).toBe('Zeppelin Wireless #2 é');
    expect(p.has('type'), 'pas de type quand le catalogue n’en a pas').toBe(false);
  });

  it('sans appareil : la page générale', () => {
    expect(urlPageAppareil(null)).toBe(URL_PAGE_PUBLIQUE);
  });

  it('le badge monté porte ce lien', () => {
    monte = mount(BadgeTuneTested, { target: hote!, props: { appareil: APPAREIL } });
    flushSync();
    const a = hote!.querySelector('a')!;
    expect(a.getAttribute('href')).toBe(urlPageAppareil(APPAREIL));
    expect(a.getAttribute('href')).toContain('brand=Eversolo');
  });

  it('dans Réglages › Appareils, le badge de la zone mène à son appareil', { timeout: DELAI }, async () => {
    const carte = await carteZone();
    await attendre();
    const a = carte.querySelector<HTMLAnchorElement>('a.tt');
    expect(a, 'badge absent').not.toBeNull();
    expect(a!.getAttribute('href')).toBe(urlPageAppareil(APPAREIL));
  });
});

describe('#2698 point 2 — proposer à tout moment', () => {
  it('le bouton est dans la zone de Réglages › Appareils et ouvre la fenêtre', { timeout: DELAI }, async () => {
    const carte = await carteZone();
    const bouton = carte.querySelector<HTMLButtonElement>('[data-testid="proposer-tune-tested"]');
    expect(bouton, 'bouton « Proposer pour Tune tested » absent').not.toBeNull();
    expect(bouton!.textContent).toContain(fr['v2.zone.tuneTestedPropose']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    bouton!.click();
    await attendre();
    expect(document.querySelector('[role="dialog"]'), 'la fenêtre ne s’ouvre pas').not.toBeNull();
    expect(q('tt-proposer')).not.toBeNull();
  });

  it('conditions non remplies : la fenêtre dit ce qui manque et que Tune proposera de lui-même', { timeout: DELAI }, async () => {
    const carte = await carteZone();
    carte.querySelector<HTMLButtonElement>('[data-testid="proposer-tune-tested"]')!.click();
    await attendre();
    expect((q('tt-proposer') as HTMLButtonElement).disabled).toBe(true);
    expect(q('tt-raison')?.textContent).toContain('20 min');
    expect(q('tt-auto')?.textContent).toBe(fr['v2.tuneTestedPropose.auto']);
    expect(envois).toEqual([]);
  });

  it('sans appareil identifié : la raison est dite, jamais un bouton muet', { timeout: DELAI }, async () => {
    etatServeur = () => json({
      eligible: false, seconds_without_error: 4000, threshold_seconds: 3600, remaining_seconds: 0,
      already_proposed: false, reason: 'device_unidentified', preview: null,
    });
    const carte = await carteZone();
    carte.querySelector<HTMLButtonElement>('[data-testid="proposer-tune-tested"]')!.click();
    await attendre();
    expect(q('tt-raison')?.textContent).toBe(fr['v2.tuneTestedPropose.err.unidentified']);
    expect(q('tt-auto')).not.toBeNull();
  });

  it('serveur injoignable : la fenêtre le dit (pas de silence, pas de faux « envoi échoué »)', { timeout: DELAI }, async () => {
    etatServeur = () => json({ error: 'boom' }, 500);
    const carte = await carteZone();
    carte.querySelector<HTMLButtonElement>('[data-testid="proposer-tune-tested"]')!.click();
    await attendre();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(fr['v2.tuneTestedPropose.err.loadFailed']);
    expect(q('tt-auto')).toBeNull();
  });

  it('conditions remplies : aperçu, puis envoi une seule fois à la confirmation', { timeout: DELAI }, async () => {
    etatServeur = () => json({
      eligible: true, seconds_without_error: 3700, threshold_seconds: 3600, remaining_seconds: 0,
      already_proposed: false, reason: null, preview: APERCU,
    });
    const carte = await carteZone();
    carte.querySelector<HTMLButtonElement>('[data-testid="proposer-tune-tested"]')!.click();
    await attendre();
    expect(q('tt-auto'), 'rien à expliquer quand tout est prêt').toBeNull();
    (q('tt-proposer') as HTMLButtonElement).click();
    flushSync();
    expect(envois).toEqual([]);
    (q('tt-confirmer') as HTMLButtonElement).click();
    await attendre();
    expect(envois).toEqual([{ preview: APERCU }]);
    expect(q('tt-envoye')).not.toBeNull();
  });

  it('le menu de la zone porte l’entrée, sans condition de durée', () => {
    const entrees = entreesMenuZone(
      { expert: false, appairable: false, jumelle: null, rattachable: false } as any,
      { renommer() {}, image() {}, reglages() {}, correction() {}, tuneTested() {} } as any,
    );
    expect(entrees.some((e) => e.cle === 'v2.zone.tuneTestedPropose')).toBe(true);
  });

  it('les deux nouveaux textes existent dans les 15 langues', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const cle of ['v2.tuneTestedPropose.auto', 'v2.tuneTestedPropose.err.loadFailed']) {
        expect(d[cle], `${l} : ${cle}`).toBeTruthy();
      }
    }
  });
});
