// @vitest-environment jsdom
//
// #3224 (suite de relecture) — une fiche d'album qu'on ne sait charger nulle
// part (ni `id`, ni service, ni Bandcamp) ne reste plus sur « Chargement des
// pistes… » : elle s'affiche vide. Le correctif de l'appelant (EtiquettesV2)
// est dans web#3228 ; ceci est le filet de la fiche elle-même.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => '{}', json: async () => ({}),
  }) as unknown as Response));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

it('🔴 sans id ni service : pas de « Chargement des pistes… » éternel', async () => {
  const album = { id: null, title: 'Night Dreamer', artist_name: 'Seu Jorge', source: 'qobuz', source_id: '85939729' } as unknown as Album;
  monte = mount(AlbumDetailV2, { target: hote!, props: { album, onClose: () => {} } });
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
  expect(hote!.textContent ?? '').not.toContain(fr['v2.common.loadingTracks']);
});
