// @vitest-environment jsdom
//
// renesenses/tune-server-rust#8869 — le réglage « Silence au changement de
// format » dans les réglages par zone de la coquille v2 (`SettingsV2`, onglet
// Appareils).
//
// Contrat : la zone rend `silence_verrouillage_ms` (nombre). Un vieux serveur
// ne l'a pas ⇒ le champ N'APPARAÎT PAS. Sorties locales seulement. Écriture :
// `PATCH /zones/{id}` avec `{"silence_verrouillage_ms": n}`, borné à 0..2000.
//
// On regarde le corps du PATCH qui part sur le réseau.
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

function champ(h: HTMLElement): HTMLInputElement | null {
  return h.querySelector<HTMLInputElement>('#zc-21 .silence-verrouillage input[type="number"]');
}

async function saisir(h: HTMLElement, valeur: string) {
  const avant = patches.length;
  const c = champ(h)!;
  c.value = valeur;
  c.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(patches.length).toBeGreaterThan(avant));
  return patches[patches.length - 1];
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

describe('#8869 — silence de verrouillage par zone (v2)', () => {
  it('vieux serveur, champ absent : MASQUÉ', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    expect(champ(h)).toBeNull();
  });

  it('zone réseau : MASQUÉ (sorties locales seulement)', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ output_type: 'dlna', silence_verrouillage_ms: 0 }));
    expect(champ(h)).toBeNull();
  });

  it('zone locale : affiché à la valeur publiée, avec sa ligne d’aide', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ silence_verrouillage_ms: 250 }));
    const c = champ(h);
    expect(c, 'champ absent alors que le serveur publie la valeur').not.toBeNull();
    expect(c!.value).toBe('250');
    const bloc = h.querySelector('#zc-21 .silence-verrouillage')!;
    expect(bloc.textContent).toContain(fr['settings.lockSilence']);
    expect(bloc.textContent).toContain(fr['settings.lockSilenceHelp']);
  });

  it('saisir 500 envoie PATCH /zones/21 avec {"silence_verrouillage_ms": 500}', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ silence_verrouillage_ms: 0 }));
    const p = await saisir(h, '500');
    expect(p.url).toMatch(/\/zones\/21(?:\?lang=[a-z]{2})?$/);
    expect(p.corps).toEqual({ silence_verrouillage_ms: 500 });
  });

  it('au-delà de 2000 ou négatif : borné avant l’envoi', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ silence_verrouillage_ms: 0 }));
    expect((await saisir(h, '9000')).corps).toEqual({ silence_verrouillage_ms: 2000 });
    expect((await saisir(h, '-20')).corps).toEqual({ silence_verrouillage_ms: 0 });
  });
});
