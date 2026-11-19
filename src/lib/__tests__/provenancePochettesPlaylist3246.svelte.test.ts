// @vitest-environment jsdom
//
// web#3246 (Régis, fil 2941, validé par Bertrand le 19/11/2026) — en VUE
// POCHETTES d'une playlist (`PlaylistDetailV2`), chaque pochette dit d'où vient
// son titre : « LOCAL », « QOBUZ », « TIDAL »… par la puce partagée
// `ServiceBadge`.
//
// Avant : la pochette ne recevait la puce (par `AlbumArt`) que si la playlist
// n'était PAS mixte (`source={mixte ? null : p.source}`), et `AlbumArt` ne la
// pose jamais pour « local ». Dans une playlist mixte — là où l'information
// sert — aucune pochette ne disait sa provenance.
//
// Contre-épreuve : avec le composant de `main` (avant ce correctif), les deux
// premiers cas échouent — aucune `[data-provenance]`, aucune puce dans une
// playlist mixte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';

vi.setConfig({ testTimeout: 60_000 });

const MIXTE = [
  { id: 1, title: 'Un', album_id: 10, album_title: 'A', cover_path: 'c1', source: 'local', duration_ms: 1000 },
  { id: null, title: 'Deux', album_id: 'q9', album_title: 'B', cover_path: 'https://x/q.jpg', source: 'qobuz', source_id: '42', duration_ms: 1000 },
  { id: null, title: 'Trois', album_id: 't9', album_title: 'C', cover_path: 'https://x/t.jpg', source: 'tidal', source_id: '43', duration_ms: 1000 },
  // Source absente : aucune puce, jamais un « LOCAL » inventé.
  { id: 4, title: 'Quatre', album_id: 11, album_title: 'D', cover_path: null, duration_ms: 1000 },
];
const QOBUZ_SEUL = MIXTE.filter((p) => p.source === 'qobuz').concat([
  { id: null, title: 'Cinq', album_id: 'q8', album_title: 'E', cover_path: 'https://x/q2.jpg', source: 'qobuz', source_id: '44', duration_ms: 1000 },
]);

let pistes: unknown[] = MIXTE;
class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  currentZoneId.set(1);
  activeView.set('playlists');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(typeof url === 'string' ? url : url?.url ?? '');
    const c = /\/playlists\/\d+\/tracks/.test(u) ? pistes : [];
    return {
      ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function tourner(n = 8) { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } }
async function enPochettes(liste: unknown[]): Promise<HTMLDivElement> {
  pistes = liste;
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistDetailV2, {
    target: hote,
    props: { item: { kind: 'local', pl: { id: 30, name: 'Provenance', track_count: liste.length } }, onClose: () => {} } as any,
  });
  flushSync();
  await tourner();
  (hote.querySelector('[data-vue="pochettes"]') as HTMLElement).click();
  flushSync();
  return hote;
}
const vignettes = (h: HTMLElement) => [...h.querySelectorAll<HTMLElement>('[data-pgrille] [data-pvig]')];
const puces = (v: HTMLElement) => [...v.querySelectorAll<HTMLElement>('.service-badge')].map((b) => b.textContent?.trim());

describe('web#3246 — la provenance sur chaque pochette de la vue en pochettes', () => {
  it('🔴 playlist MIXTE : LOCAL, QOBUZ, TIDAL, chacune sur sa pochette', async () => {
    const h = await enPochettes(MIXTE);
    const v = vignettes(h);
    expect(v.length).toBe(MIXTE.length);
    expect(puces(v[0])).toEqual(['LOCAL']);
    expect(puces(v[1])).toEqual(['QOBUZ']);
    expect(puces(v[2])).toEqual(['TIDAL']);
    expect(v[0].querySelector('[data-provenance="local"]')).not.toBeNull();
    expect(v[1].querySelector('[data-provenance="qobuz"]')).not.toBeNull();
  });

  it('🔴 la puce est SUR la pochette (dans la vignette), pas sous la carte', async () => {
    const h = await enPochettes(MIXTE);
    const v = vignettes(h)[1];
    const p = v.querySelector<HTMLElement>('.psrc');
    expect(p, 'pas d’enveloppe de provenance dans la vignette').not.toBeNull();
    expect(p!.closest('[data-pvig]')).toBe(v);
  });

  it('source absente : aucune puce, jamais un « LOCAL » inventé', async () => {
    const h = await enPochettes(MIXTE);
    const v = vignettes(h)[3];
    expect(puces(v)).toEqual([]);
    expect(v.querySelector('[data-provenance]')).toBeNull();
  });

  it('playlist d’un SEUL service : une puce par pochette, pas deux', async () => {
    const h = await enPochettes(QOBUZ_SEUL);
    for (const v of vignettes(h)) expect(puces(v)).toEqual(['QOBUZ']);
  });

  it('la croix « retirer » reste sous la carte, hors de la pochette', async () => {
    const h = await enPochettes(MIXTE);
    for (const v of vignettes(h)) expect(v.querySelector('[data-retirer-titre]')).toBeNull();
    expect(h.querySelectorAll('[data-pgrille] .pact [data-retirer-titre]').length).toBe(MIXTE.length);
  });
});
