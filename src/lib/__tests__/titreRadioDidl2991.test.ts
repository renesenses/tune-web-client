// @vitest-environment jsdom
//
// renesenses/tune-server-rust#2991 — le sélecteur « Envoyer le titre radio par DLNA »
// dans les réglages par zone de la coquille v2 (`SettingsV2`, onglet Appareils, section « Réglages par zone »).
//
// Contrat : la zone rend `dlna_radio_title` (off/next/reload). Un vieux serveur ne
// l'a pas ⇒ le sélecteur N'APPARAÎT PAS (proposer un réglage que le serveur
// ignorerait serait mentir). Écriture : `PATCH /zones/{id}` avec
// `{"dlna_radio_title": "off"|"next"|"reload"}`. Proposé sur une zone DLNA seulement.
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
  return { id: 21, name: 'Bureau', output_type: 'dlna', volume: 1, state: 'stopped', ...over };
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
  // Témoin : la carte de la zone est bien rendue, sinon « masqué » ne prouve rien.
  expect(hote.querySelector('#zc-21'), 'carte de zone absente — témoin sans objet').not.toBeNull();
  return hote;
}

function selecteur(h: HTMLElement): HTMLSelectElement | null {
  return h.querySelector<HTMLSelectElement>('#zc-21 .radio-didl select');
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

describe('#2991 — sélecteur « titre radio par DLNA » par zone (v2)', () => {
  it('vieux serveur, champ absent : le sélecteur est MASQUÉ', { timeout: 60_000 }, async () => {
    const h = await poser(zone());
    expect(selecteur(h)).toBeNull();
  });

  it('zone non DLNA : le sélecteur est MASQUÉ même si le serveur publie le champ', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ output_type: 'local', dlna_radio_title: 'off' }));
    expect(selecteur(h)).toBeNull();
  });

  it('champ à off : affiché sur « Désactivé », avec son libellé et son aide', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ dlna_radio_title: 'off' }));
    const s = selecteur(h);
    expect(s, 'sélecteur absent alors que le serveur publie le champ').not.toBeNull();
    expect(s!.value).toBe('off');
    const bloc = h.querySelector('#zc-21 .radio-didl')!.closest('.radio-didl-bloc')!;
    expect(bloc.textContent).toContain(fr['radioDidl.label']);
    expect(bloc.textContent).toContain(fr['radioDidl.help']);
    expect(fr['radioDidl.label']).toBe("Envoyer le titre radio par DLNA (pour les lecteurs qui ignorent l'ICY)");
  });

  it('choisir « sans couper » envoie PATCH /zones/21 avec {"dlna_radio_title": "next"}', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ dlna_radio_title: 'off' }));
    const s = selecteur(h)!;
    s.value = 'next';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patches.length).toBeGreaterThan(0));
    const p = patches[patches.length - 1];
    expect(p.url).toMatch(/\/zones\/21$/);
    expect(p.corps).toEqual({ dlna_radio_title: 'next' });
  });

  it('revenir à « Désactivé » envoie {"dlna_radio_title": "off"}', { timeout: 60_000 }, async () => {
    const h = await poser(zone({ dlna_radio_title: 'reload' }));
    const s = selecteur(h)!;
    expect(s.value).toBe('reload');
    s.value = 'off';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(patches.length).toBeGreaterThan(0));
    expect(patches[patches.length - 1].corps).toEqual({ dlna_radio_title: 'off' });
  });
});
