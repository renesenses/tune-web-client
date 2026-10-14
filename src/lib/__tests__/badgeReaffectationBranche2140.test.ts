// @vitest-environment jsdom
//
// web#2140 — « écrit mais pas branché » n'est pas livré : ce banc MONTE les deux
// écrans réels (fiche album, page Zones) et y cherche l'indicateur, le serveur
// répondant une règle armée sur la route de réaffectation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import ZonesV2 from '../../components/v2/ZonesV2.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import type { Album } from '../types';

vi.mock('../api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAlbumTracks: vi.fn(async () => []),
  getStreamingAlbumTracks: vi.fn(async () => []),
  bandcampAlbum: vi.fn(async () => ({ tracks: [] })),
  getAlbumExtendedMetadata: vi.fn(async () => ({})),
}));

const ARMEE = {
  key: 'x', saved: true,
  settings: { enabled: true, inputs: 4, outputs: 2, gains_db: [[0, null, -3, null], [null, 0, null, -3]], normalize: true },
  effective: { valid: true, identity: false },
  input_names: null, output_names: null,
};
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const respirer = () => new Promise((r) => setTimeout(r, 0));

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let armees: RegExp[] = [];

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/channel-remap\/(zones|albums)\/\d+$/.test(url)) {
      return armees.some((r) => r.test(url)) ? response(ARMEE) : response({ ...ARMEE, saved: false });
    }
    if (url.endsWith('/zones')) return response([{ id: 1, name: 'Salon', state: 'stopped', output_type: 'local' }, { id: 2, name: 'Bureau', state: 'stopped', output_type: 'local' }]);
    if (url.endsWith('/zones/stereo-pairs')) return response([]);
    if (url.includes('tune-tested.json')) return response({ version: 1, count: 0, devices: [] });
    if (url.endsWith('/system/diagnostics')) return response({ zones_doublons: [] });
    return response({});
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(async () => {
  if (monte) await unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  currentZoneId.set(null);
  armees = [];
  vi.unstubAllGlobals();
});

async function poser(c: any, props: Record<string, unknown>) {
  monte = mount(c, { target: hote!, props: props as any });
  for (let i = 0; i < 10; i++) { await respirer(); flushSync(); }
  return hote!;
}

describe('web#2140 — l’indicateur est branché sur les écrans réels', () => {
  it('🔴 fiche d’un album local à règle armée : l’indicateur est là', async () => {
    armees = [/\/channel-remap\/albums\/11049$/];
    const el = await poser(AlbumDetailV2, { album: { id: 11049, title: 'Quad', source: 'local' } as Album, onClose: () => {} });
    expect(el.querySelector('[data-reaffectation="album"]'), 'pas d’indicateur sur la fiche album').not.toBeNull();
  });

  it('fiche d’un album sans règle : rien', async () => {
    const el = await poser(AlbumDetailV2, { album: { id: 11050, title: 'Stéréo', source: 'local' } as Album, onClose: () => {} });
    expect(el.querySelector('[data-reaffectation]')).toBeNull();
  });

  it('🔴 page Zones : seule la zone à règle armée porte l’indicateur', async () => {
    armees = [/\/channel-remap\/zones\/2$/];
    zones.set([{ id: 1, name: 'Salon', state: 'stopped', output_type: 'local' }, { id: 2, name: 'Bureau', state: 'stopped', output_type: 'local' }] as never);
    currentZoneId.set(1);
    const el = await poser(ZonesV2, {});
    const badges = el.querySelectorAll('[data-reaffectation="zone"]');
    expect(badges.length, 'une zone armée, un indicateur').toBe(1);
    expect(badges[0].closest('.cpick, .pick')?.getAttribute('aria-label') ?? '').toMatch(/Bureau/);
  });
});
