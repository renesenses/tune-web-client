// @vitest-environment jsdom
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
  return reponse(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  dejaDansLaPlaylist = 0;
  pleine = false;
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

describe('ajout groupé — ce qui part', () => {
  it('une piste locale part par son seul track_id ; un titre de service par sa paire et sa description, sans pochette ni adresse', () => {
    expect(entreeDePiste(locale(812, 'So What'))).toEqual({ track_id: 812 });
    expect(entreeDePiste(qobuz('5966783', 'So What'))).toEqual({
      source: 'qobuz', source_id: '5966783', title: 'So What', artist_name: 'Miles Davis',
      album_title: 'Kind of Blue', duration_ms: 562000, isrc: 'USSM15900113',
    });
    expect(entreeDePiste(bandcamp('Ailleurs'))).toBeNull();
  });

  it("les entrées gardent l'ORDRE des pistes, et ce qui ne se référence pas est compté", () => {
    const { entrees, nonReferencables } = entreesDePistes([
      qobuz('q1', 'Un'), bandcamp('Deux'), locale(3, 'Trois'), { id: null, title: 'Radio', source: 'radio' } as unknown as Track,
    ]);
    expect(entrees.map((e) => ('track_id' in e ? e.track_id : e.source_id))).toEqual(['q1', 3]);
    expect(nonReferencables).toBe(2);
    expect(JSON.stringify(entrees)).not.toContain('/Users');
  });

  it('le bilan dit chaque compte : ajoutés, au-delà du plafond, sans référence, non envoyés', () => {
    const b = bilanAjoutGroupe({ added: 1997, over_limit: 103, unreferenceable: 2, not_sent: 4, interrupted: { status: 429 }, max_items: 2000 }, 1);
    const lignes = phrasesBilan(b, 'Dimanche', (k) => get(t)(k as any)).map((l) => l.texte);
    expect(lignes).toEqual([
      '1997 morceaux ajoutés à « Dimanche ».',
      'Plafond de 2000 morceaux atteint : 103 morceaux n\'ont pas été ajoutés.',
      '3 morceaux n\'ont pas été ajoutés : ils n\'ont aucune référence exploitable (radio, Bandcamp, fichier sans titre…).',
      'L\'ajout s\'est interrompu : 4 morceaux n\'ont pas été envoyés. Réessayez plus tard.',
    ]);
  });
});

describe('menus — les entrées de cercle', () => {
  const cles = (o: Parameters<typeof entreesObjet>[0]) => entreesObjet(o, (k) => k).map((e) => e.cle);

  it("album, playlist locale, intelligente et de service : « Ajouter à une playlist de cercle » ; « Partager avec un cercle » pour les playlists seules", () => {
    const album = cles(objetAlbum({ id: 12, title: 'Kind of Blue', artist_id: 3 }));
    expect(album).toContain('v2.circle.pl.addToCircle');
    expect(album).not.toContain('v2.circle.pl.shareWithCircle');
    for (const o of [
      objetPlaylist({ id: 4, name: 'Locale' }),
      objetPlaylistIntelligente({ id: 5, name: 'Intelligente' }),
      objetPlaylist({ source: 'qobuz', source_id: '777', name: 'Qobuz' }),
      objetPlaylist({ source: 'tidal', source_id: 'abc', name: 'Tidal' }),
      objetPlaylist({ source: 'deezer', source_id: '42', name: 'Deezer' }),
    ]) {
      const c = cles(o);
      expect(c, o.nom ?? '').toContain('v2.circle.pl.addToCircle');
      expect(c, o.nom ?? '').toContain('v2.circle.pl.shareWithCircle');
    }
  });

  it('sans le greffon, les entrées sont ABSENTES', () => {
    circlePlugin.set('absent');
    expect(cles(objetPlaylist({ id: 4, name: 'Locale' }))).not.toContain('v2.circle.pl.shareWithCircle');
    expect(cles(objetAlbum({ id: 12, title: 'X' }))).not.toContain('v2.circle.pl.addToCircle');
    // Une capacité sans geste n'a pas d'entrée non plus.
    expect(entreesPochette({ type: 'playlist', idBibliotheque: 4, greffonCercle: true }, {}, (k) => k).map((e) => e.cle))
      .not.toContain('v2.circle.pl.shareWithCircle');
  });

  it('le geste pose la demande ; les pistes ne sont lues qu\'au geste', async () => {
    const e = entreesObjet(objetPlaylist({ source: 'qobuz', source_id: '777', name: 'Qobuz du soir' }), (k) => k)
      .find((x) => x.cle === 'v2.circle.pl.shareWithCircle')!;
    const avant = appels.length;
    e.faire();
    const d = get(demandeCercle)!;
    expect(d.mode).toBe('partage');
    expect(d.nom).toBe('Qobuz du soir');
    expect(appels.length).toBe(avant);
  });
});

describe('la fenêtre — partager une playlist avec un cercle', () => {
  it('crée la playlist dans le cercle choisi, puis y ajoute la COPIE dans le même ordre, et dit le bilan', async () => {
    const pistes = vi.fn(async () => [qobuz('q1', 'Un'), bandcamp('Deux'), locale(3, 'Trois')]);
    const el = await poser({ mode: 'partage', nom: 'Qobuz du soir', pistes });
    expect(pistes).not.toHaveBeenCalled();
    expect((el.querySelector('[data-nom-partage]') as HTMLInputElement).value).toBe('Qobuz du soir');
    (el.querySelector('[data-partager]') as HTMLButtonElement).click();
    await laisserFaire();
    const [creation, ajout] = ecritures();
    expect(creation.url).toMatch(/\/ext\/circle\/playlists$/);
    expect(creation.body).toEqual({ circle_id: 7, name: 'Qobuz du soir' });
    expect(ajout.url).toMatch(/\/ext\/circle\/playlists\/pl-neuve\/bulk-items$/);
    expect(ajout.body.entries.map((e: any) => e.track_id ?? e.source_id)).toEqual(['q1', 3]);
    expect(JSON.stringify(ajout.body)).not.toMatch(/Users|bandcamp|cover|https/);
    expect([...el.querySelectorAll('[data-bilan-cercle] li')].map(texte)).toEqual([
      'Playlist « Qobuz du soir » créée dans le cercle avec 2 morceaux.',
      '1 morceaux n\'ont pas été ajoutés : ils n\'ont aucune référence exploitable (radio, Bandcamp, fichier sans titre…).',
    ]);
  });

  it('rien de référençable : la playlist de cercle n\'est PAS créée', async () => {
    const el = await poser({ mode: 'partage', nom: 'Bandcamp', pistes: async () => [bandcamp('A'), bandcamp('B')] });
    (el.querySelector('[data-partager]') as HTMLButtonElement).click();
    await laisserFaire();
    expect(ecritures()).toEqual([]);
    expect(texte(el.querySelector('[role="alert"]')!)).toBe('Aucun de ces morceaux n\'a de référence exploitable : rien n\'a été ajouté.');
  });

  it('sans cercle à moi : on le dit, rien ne part', async () => {
    cercles = [];
    const el = await poser({ mode: 'partage', nom: 'X', pistes: async () => [locale(1, 'A')] });
    expect(texte(el)).toContain('Vous n\'avez encore aucun cercle.');
    expect(el.querySelector('[data-partager]')).toBeNull();
  });
});

describe('la fenêtre — ajouter un album ou une playlist à une playlist de cercle', () => {
  it('au plafond, le compte de ce qui n\'a pas été ajouté est dit', async () => {
    dejaDansLaPlaylist = 1999;
    const el = await poser({ mode: 'ajout', nom: 'Kind of Blue', pistes: async () => [locale(1, 'A'), locale(2, 'B'), locale(3, 'C')] });
    (el.querySelector('button.choix-playlist') as HTMLButtonElement).click();
    await laisserFaire();
    const lignes = [...el.querySelectorAll('[data-bilan-cercle] li')].map(texte);
    expect(lignes).toEqual([
      '1 morceaux ajoutés à « Dimanche ».',
      'Plafond de 2000 morceaux atteint : 2 morceaux n\'ont pas été ajoutés.',
    ]);
  });

  it('une playlist pleine : le refus du greffon est dit avec le plafond', async () => {
    pleine = true;
    const el = await poser({ mode: 'ajout', nom: 'Kind of Blue', pistes: async () => [locale(1, 'A')] });
    (el.querySelector('button.choix-playlist') as HTMLButtonElement).click();
    await laisserFaire();
    expect(texte(el.querySelector('[role="alert"]')!)).toBe('Cette playlist compte déjà 2000 morceaux, le maximum.');
  });
});
