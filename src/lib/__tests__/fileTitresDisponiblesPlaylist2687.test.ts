// @vitest-environment jsdom
//
// web#2687, volet PLAYLIST : « au lancement d'un album ou d'une playlist
// depuis le web, n'envoyer au serveur que les titres disponibles ». La fiche
// d'une playlist de service partait en `streaming_playlist_id` : le serveur
// mettait toute la liste en file. On MONTE la vraie fiche, on clique « Lire »
// et on lit les requêtes réellement parties (`fetch` bouchonné).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PlaylistDetailV2 from '../../components/v2/PlaylistDetailV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';

vi.setConfig({ testTimeout: 30_000 });

interface Requete { method: string; url: string; body: any }
let requetes: Requete[] = [];
let pistes: unknown[] = [];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
async function attendreQue(condition: () => boolean, quoi: string) {
  await vi.waitFor(() => { flushSync(); if (!condition()) throw new Error(`attente expirée : ${quoi}`); },
    { timeout: 25_000, interval: 10 });
}
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const q = (sid: string, titre: string, disponible?: boolean) =>
  ({ id: null, title: titre, artist_name: 'X', source: 'qobuz', source_id: sid, ...(disponible === undefined ? {} : { disponible }) });

beforeEach(() => {
  requetes = [];
  locale.set('fr');
  currentZoneId.set(1);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ method, url, body });
    const charge = url.includes('/streaming/qobuz/playlists/11/tracks') ? pistes
      : url.includes('/zones/1/play') ? { id: 1, name: 'Salon' } : {};
    return { ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge), json: async () => charge } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

async function lire() {
  monte = mount(PlaylistDetailV2, { target: hote!, props: {
    item: { kind: 'streaming', service: 'qobuz', pl: { source_id: '11', name: 'Soul', track_count: pistes.length } } as any,
    onClose: () => {} } });
  await attendreQue(() => (hote!.textContent ?? '').includes('Lovely Day'), 'les titres affichés');
  hote!.querySelector<HTMLButtonElement>('button.play')!.click();
}
const lectures = () => requetes.filter((r) => r.method === 'POST' && /\/zones\/1\/play(\?|$)/.test(r.url));
const ajouts = () => requetes.filter((r) => r.method === 'POST' && /\/zones\/1\/queue\/add(\?|$)/.test(r.url));

describe('web#2687 — la fiche d’une playlist de service mixte', () => {
  it('🔴 « Lire » : seuls les titres disponibles partent, avec le conteneur playlist', async () => {
    pistes = [q('a', 'Lovely Day', true), q('b', 'Grisé', false), q('c', 'Use Me')];
    await lire();
    await attendreQue(() => lectures().length === 1 && ajouts().length >= 1, 'la lecture et la suite parties');
    const tete = lectures()[0].body;
    expect(tete.streaming_playlist_id).toBeUndefined();
    expect(tete).toMatchObject({ source: 'qobuz', source_id: 'a', context_type: 'playlist', context_id: '11', context_source: 'qobuz' });
    const enfiles = ajouts().flatMap((r) => (r.body.tracks ?? []).map((t: any) => t.source_id));
    expect(enfiles).toEqual(['c']);
  });

  it('témoin : playlist entièrement disponible → `streaming_playlist_id`, comme avant', async () => {
    pistes = [q('a', 'Lovely Day', true), q('c', 'Use Me')];
    await lire();
    await attendreQue(() => lectures().length === 1, 'la lecture partie');
    expect(lectures()[0].body).toMatchObject({ streaming_playlist_id: '11', source: 'qobuz', start_index: 0 });
  });
});
