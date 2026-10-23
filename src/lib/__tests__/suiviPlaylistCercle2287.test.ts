// @vitest-environment jsdom
//
// web#2287, point 2 — « Partager avec un cercle » d'une playlist LOCALE :
// la playlist de cercle SUIT son originale (tune-server-rust#6694, décision de
// Bertrand du 21/10). Harnais repris de circleAjoutGroupe.test.ts.
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et la fenêtre ne lirait
// jamais `/ext/circle` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import AjoutGroupeCercleV2 from '../../components/v2/AjoutGroupeCercleV2.svelte';
import { preparerLocale, t } from '../i18n';
import { circlePlugin } from '../circle';
import {
  entreeDePiste, entreesDePistes, bilanAjoutGroupe, phrasesBilan, demandeCercle, MORCEAUX_MAX,
  type DemandeCercle,
} from '../circlePlaylists';
import { entreesPochette } from '../actionsPochette';
import { entreesObjet, objetAlbum, objetPlaylist, objetPlaylistIntelligente } from '../gestesObjet';
import type { Track } from '../types';
import { lireSuivi, cleAvertissement, ligneBadgeCercles, cerclesDePlaylist } from '../suiviCercle';
import { playlistCercle } from '../circlePlaylists';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Playlists de cercle — l'AJOUT GROUPÉ (un album, une sélection, une playlist
 * entière) et le PARTAGE d'une playlist avec un cercle (une copie par
 * références, dans le même ordre ; l'original ne bouge pas).
 *
 * Le faux greffon suit le contrat de `POST /playlists/{id}/bulk-items` :
 * `{ entries }` → `{ playlist, added, unreferenceable, over_limit, not_sent,
 * interrupted, max_items }`, et applique le plafond de 2 000 du cloud.
 */

const CHEMIN = '/Users/elise/Music/Miles/01 So What.flac';

const locale = (id: number, titre: string): Track =>
  ({ id, title: titre, source: 'local', source_id: CHEMIN, file_path: CHEMIN, artist_name: 'Miles Davis' }) as unknown as Track;
const qobuz = (sid: string, titre: string): Track =>
  ({
    id: null, title: titre, source: 'qobuz', source_id: sid, artist_name: 'Miles Davis', album_title: 'Kind of Blue',
    duration_ms: 562000, isrc: 'us-sm1-59-00113', cover_path: 'https://static.qobuz.com/c.jpg', url: 'https://x/stream',
  }) as unknown as Track;
const bandcamp = (titre: string): Track =>
  ({ id: null, title: titre, source: 'bandcamp', source_id: 'https://artiste.bandcamp.com/track/x' }) as unknown as Track;

type Appel = { url: string; method: string; body: any };
let appels: Appel[] = [];
let dejaDansLaPlaylist = 0;
let pleine = false;
let suiviAbsent = false;
let cercles: { id: number; name: string; member_ids: number[] }[] = [];

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function greffon(u: string, method: string, body: any): Response {
  const chemin = u.replace(/^.*\/api\/v1\/ext\/circle/, '');
  if (method === 'GET' && (chemin === '' || chemin === '/')) {
    return reponse(200, { members: [], sent: [], received: [], circles: cercles });
  }
  if (chemin === '/playlists' && method === 'GET') {
    return reponse(200, [{ id: 'pl-a', name: 'Dimanche', count: dejaDansLaPlaylist, version: 3, mine: false }]);
  }
  if (chemin === '/playlists' && method === 'POST') {
    return reponse(201, { id: 'pl-neuve', name: body.name, version: 1, mine: true, items: [] });
  }
  const m = chemin.match(/^\/playlists\/([^/]+)\/bulk-items$/);
  if (m && method === 'POST') {
    if (pleine) return reponse(422, { code: 'circle.playlist_full', max_items: 2000 });
    // Le greffon : `track_id` et les titres de service décrits se référencent.
    const refs = (body.entries as any[]).filter((e) => typeof e.track_id === 'number' || (e.source && e.title));
    const place = MORCEAUX_MAX - dejaDansLaPlaylist;
    const pris = refs.slice(0, place);
    return reponse(200, {
      ok: true,
      playlist: { id: m[1], name: 'x', version: 9, items: pris.map((r, k) => ({ item_id: `i${k}`, title: r.title ?? `Piste ${r.track_id}` })) },
      requested: body.entries.length, added: pris.length, unreferenceable: body.entries.length - refs.length,
      over_limit: refs.length - pris.length, max_items: 2000, not_sent: 0, interrupted: null,
    });
  }
  // web#2287 — le suivi (tune-server-rust#6694).
  const f = chemin.match(/^\/playlists\/([^/]+)\/follow$/);
  if (f && method === 'PUT') {
    if (suiviAbsent) return reponse(404, { error: 'not_found' });
    return reponse(200, { follow: { following: true, local_playlist_id: body.playlist_id, local_name: 'Locale', circle_id: body.circle_id, circle_name: body.circle_name, last_sync: '2026-10-22T20:00:00Z', pending: false, warning: null }, sync: {} });
  }
  return reponse(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  dejaDansLaPlaylist = 0;
  pleine = false;
  suiviAbsent = false;
  cercles = [{ id: 7, name: 'Famille', member_ids: [40] }];
  demandeCercle.set(null);
  circlePlugin.set({ name: 'circle', installed: true, enabled: true });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body != null ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, body });
    if (u.includes('/ext/circle')) return greffon(u, method, body);
    return reponse(200, []);
  }));
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  circlePlugin.set(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 12; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(demande: DemandeCercle): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AjoutGroupeCercleV2, { target: hote, props: { demande, onClose: () => {} } });
  flushSync();
  await laisserFaire();
  return hote;
}

const texte = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const ecritures = () => appels.filter((a) => a.method !== 'GET');


describe('web#2287 — le partage d’une playlist locale la fait suivre', () => {
  it('🔴 le geste d’une playlist locale porte son identifiant ; un service, non', () => {
    entreesObjet(objetPlaylist({ id: 4, name: 'Locale' }), (k) => k).find((x) => x.cle === 'v2.circle.pl.shareWithCircle')!.faire();
    expect(get(demandeCercle)!.playlistLocale).toBe(4);
    entreesObjet(objetPlaylist({ source: 'qobuz', source_id: '777', name: 'Q' }), (k) => k).find((x) => x.cle === 'v2.circle.pl.shareWithCircle')!.faire();
    expect(get(demandeCercle)!.playlistLocale).toBeNull();
  });

  it('🔴 après la création et l’ajout, la copie de cercle suit la playlist locale (PUT …/follow)', async () => {
    const el = await poser({ mode: 'partage', nom: 'Locale', pistes: async () => [locale(1, 'A')], playlistLocale: 4 });
    (el.querySelector('[data-partager]') as HTMLButtonElement).click();
    await laisserFaire();
    const suivi = ecritures().find((a) => /\/follow$/.test(a.url));
    expect(suivi, 'le suivi doit être demandé').toBeTruthy();
    expect(suivi!.method).toBe('PUT');
    expect(suivi!.url).toMatch(/\/ext\/circle\/playlists\/pl-neuve\/follow$/);
    expect(suivi!.body).toEqual({ playlist_id: 4, circle_id: 7, circle_name: 'Famille' });
    expect([...el.querySelectorAll('[data-bilan-cercle] li')].map(texte))
      .toContain('Elle suit désormais la playlist d’origine : vos changements y seront reportés.');
  });

  it('greffon d’avant le suivi (404) : la copie reste, et on le dit', async () => {
    suiviAbsent = true;
    const el = await poser({ mode: 'partage', nom: 'Locale', pistes: async () => [locale(1, 'A')], playlistLocale: 4 });
    (el.querySelector('[data-partager]') as HTMLButtonElement).click();
    await laisserFaire();
    expect(texte(el)).toContain('Ce serveur ne sait pas encore faire suivre la playlist d’origine');
  });

  it('une playlist de service : aucun suivi demandé', async () => {
    const el = await poser({ mode: 'partage', nom: 'Q', pistes: async () => [qobuz('q1', 'A')] });
    (el.querySelector('[data-partager]') as HTMLButtonElement).click();
    await laisserFaire();
    expect(ecritures().some((a) => /\/follow$/.test(a.url))).toBe(false);
  });
});

describe('web#2287 — la fiche et le badge lisent le suivi', () => {
  it('la fiche d’une playlist suivie porte `follow`', () => {
    const p = playlistCercle({ id: 'pl', name: 'x', version: 2, items: [], follow: { following: true, local_name: 'Locale', last_sync: '2026-10-22T20:00:00Z', pending: false, warning: { code: 'circle.follow_overwritten', at: 'x' } } });
    expect(p!.follow!.localName).toBe('Locale');
    expect(cleAvertissement(p!.follow)).toBe('v2.circle.follow.overwritten');
    expect(playlistCercle({ id: 'pl', name: 'x', version: 2, items: [] })!.follow).toBeNull();
    expect(lireSuivi({ following: false })).toBeNull();
    expect(lireSuivi({ following: false, stopped_at: 'x', local_name: 'L' })!.following).toBe(false);
  });

  it('le badge « Partagée avec un cercle » d’une playlist locale', () => {
    const tr = (k: string) => get(t)(k as any);
    expect(ligneBadgeCercles({ cercles: [{ id: 7, nom: 'Famille', suivi: true }, { id: 8, nom: 'Jazz', suivi: false }] }, tr))
      .toBe('Partagée avec un cercle : Famille, Jazz (suivi arrêté)');
    expect(ligneBadgeCercles({ cercles: [] }, tr)).toBeNull();
    expect(cerclesDePlaylist({})).toEqual([]);
  });

  it('les écrans sont branchés', () => {
    const lire = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');
    const fiche = lire('src/components/v2/PlaylistCercleV2.svelte');
    expect(fiche).toContain('data-suivi-origine');
    expect(fiche).toContain('synchroniserSuivi(playlist.id)');
    expect(fiche).toContain('nePlusSuivre(playlist.id)');
    expect(lire('src/components/v2/PlaylistDetailV2.svelte')).toContain('ligneBadgeCercles(item.pl,');
  });
});
