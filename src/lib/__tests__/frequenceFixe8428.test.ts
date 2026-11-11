// @vitest-environment jsdom
//
// renesenses/tune-server-rust#3973 — l'interrupteur « Bit-perfect strict »
// dans les réglages par zone de la coquille v2 (`SettingsV2`, onglet Appareils, section « Réglages par zone »).
//
// Contrat : la zone rend `strict_bitperfect` (booléen). Un vieux serveur ne
// l'a pas ⇒ l'interrupteur N'APPARAÎT PAS (proposer un réglage que le serveur
// ignorerait serait mentir). Écriture : `PATCH /zones/{id}` avec
// `{"strict_bitperfect": true|false}`.
//
// On regarde ce qui PART SUR LE RÉSEAU (le corps du PATCH), pas un appel de
// fonction simulé : un nom de champ mal orthographié passerait sinon au vert.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    // Ce que l'écran interroge au montage : réponses inertes.
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { zones } from '../stores/zones';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let patches: { url: string; corps: unknown }[] = [];
/** Ce que `GET /zones` rend : l'écran recharge la liste au montage, et une
 *  liste vide effacerait la zone posée dans le magasin. */
let zonesServeur: unknown[] = [];

function zone(over: Record<string, unknown> = {}) {
  return { id: 21, name: 'Bureau', output_type: 'local', volume: 1, state: 'stopped', ...over };
}

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function poser(z: Record<string, unknown>): Promise<HTMLDivElement> {
  zonesServeur = [z];
  zones.set([z] as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr['settings.tabDevices'],
  );
  expect(onglet, 'onglet Appareils introuvable').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  hote.querySelector<HTMLButtonElement>('button.ligne')?.click(); // web#2451 : les détails s'ouvrent au clic
  await attendre();
  // Témoin : la carte de la zone est bien rendue, sinon « masqué » ne prouve rien.
  expect(hote.querySelector('#zc-21'), 'carte de zone absente — témoin sans objet').not.toBeNull();
  return hote;
}

function interrupteur(h: HTMLElement): HTMLInputElement | null {
  return h.querySelector<HTMLInputElement>('#zc-21 .strict-bitperfect input[type="checkbox"]');
}

beforeEach(() => {
  patches = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const corps = JSON.parse(String(init.body ?? '{}'));
      patches.push({ url: String(url), corps });
      return new Response(JSON.stringify({ ...zone(), ...corps }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const u = String(url);
    const corps = /\/zones(\?|$)/.test(u) ? zonesServeur
      : /\/(profiles|devices|playlists|shortcuts)(\?|$)/.test(u) ? [] : {};
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#8428 — fréquence fixe', () => {
  it('masque le réglage sur un ancien serveur', async () => {
    const h = await poser(zone());
    expect(h.querySelector('[data-reglage="zone-frequence-fixe"]')).toBeNull();
  });
  it('envoie 48000 puis null, sans modifier le plafond', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ fixed_sample_rate: null }));
    const choix = h.querySelector<HTMLSelectElement>('[data-reglage="zone-frequence-fixe"] select');
    expect(choix, 'le réglage de fréquence fixe doit apparaître').not.toBeNull();
    choix!.value = '48000';
    choix!.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patches.at(-1)?.corps).toEqual({ fixed_sample_rate: 48000 }));
    choix!.value = '0';
    choix!.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patches.at(-1)?.corps).toEqual({ fixed_sample_rate: null }));
  });
});
