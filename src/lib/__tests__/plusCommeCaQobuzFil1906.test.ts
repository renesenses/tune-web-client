// @vitest-environment jsdom
//
// ══════════════════════════════════════════════════════════════════════════
// 🔴 Fil forum 1906 (FabienM, point 3) — « Plus comme ça » sur un titre QOBUZ.
//
// Le serveur expose `GET /streaming/{service}/tracks/{id}/similar` (Qobuz
// seul : la logique de la reprise automatique de fin de file, sortie en
// route). Un titre Qobuz gagne donc l'entrée ; Tidal, Bandcamp et les autres
// n'ont pas de similarité d'artiste et restent SANS — absent, pas grisé.
//
// Le geste doit être celui de la bibliothèque : les voisins, puis une lecture
// qui REMPLACE la file (`POST /zones/{id}/play`), le reste enfilé derrière —
// une liste de service n'a pas de `track_ids`.
//
// Cette garde MONTE les deux surfaces (barre v2 et menu du client actuel),
// ouvre leur menu et CLIQUE : une règle écrite mais pas branchée y serait
// rouge. Elle n'importe aucun module nouveau : sur la base (#1539), elle
// compile et rougit sur ses assertions.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import PisteActions from '../../components/v2/PisteActions.svelte';
import MenuPisteV1 from '../../components/partages/MenuPisteV1.svelte';
import { currentZoneId } from '../stores/zones';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';
import { entreesMenuPiste } from '../menuPiste';

vi.setConfig({ testTimeout: 30_000 });

const PLUS_COMME_CA = 'Plus comme ça';

const QOBUZ = {
  id: null, source: 'qobuz', source_id: '441078583', title: 'Second Song',
  artist_name: 'Neil Young', artist_id: '35865', album_title: 'Second Song',
  album_id: 'atua1kxxk4tis', duration_ms: 360000,
};
const service = (source: string, source_id = 'x-42') => ({ ...QOBUZ, source, source_id });
const BIBLIO = {
  id: 2450, source: 'local', title: 'Harvest', artist_name: 'Neil Young',
  artist_id: 125, album_id: 259, album_title: 'Harvest', duration_ms: 200000,
};

/** Ce que rend `GET /streaming/qobuz/tracks/441078583/similar` : des
 *  `StreamTrack`, SANS `source` — le service est dans l'URL. */
const VOISINS = [
  { source_id: 'q-a2', title: 'Heart of Gold', artist_name: 'Crosby', album_title: 'X', duration_ms: 180000 },
  { source_id: 'q-b1', title: 'Our House', artist_name: 'Nash', album_title: 'Y', duration_ms: 200000 },
];

interface Appel { url: string; methode: string; corps: any }
let appels: Appel[] = [];
let reponseSimilaires: { statut: number; corps: unknown } = { statut: 200, corps: VOISINS };
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
  return hote;
}

function menuV2(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(PisteActions, { piste });
  const plus = Array.from(el.querySelectorAll<HTMLButtonElement>('button.pa'))
    .find((b) => b.getAttribute('aria-haspopup') === 'menu');
  expect(plus, 'la barre n’a pas de « … »').toBeTruthy();
  plus!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.menu button.item'));
}

function menuV1(piste: Record<string, unknown>): HTMLButtonElement[] {
  const el = poser(MenuPisteV1, { piste });
  el.querySelector<HTMLButtonElement>('button.track-more-btn')!.click();
  flushSync();
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.track-menu-item'));
}

const libelles = (items: HTMLButtonElement[]) => items.map((b) => (b.textContent ?? '').trim());
const entree = (items: HTMLButtonElement[], l: string) =>
  items.find((b) => (b.textContent ?? '').includes(l));

const indexDe = (pred: (a: Appel) => boolean) => appels.findIndex(pred);
const estSimilaires = (a: Appel) => a.url.includes('/streaming/qobuz/tracks/441078583/similar');
const estLecture = (a: Appel) => a.methode === 'POST' && /\/zones\/1\/play$/.test(a.url);
const estFile = (a: Appel) => a.methode === 'POST' && /\/zones\/1\/queue\/add$/.test(a.url);

function reponse(statut: number, corps: unknown): Response {
  return {
    ok: statut >= 200 && statut < 300, status: statut, statusText: String(statut),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  } as unknown as Response;
}

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  appels = [];
  reponseSimilaires = { statut: 200, corps: VOISINS };
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.stubGlobal('fetch', vi.fn(async (entreeFetch: unknown, init?: RequestInit) => {
    const url = String(typeof entreeFetch === 'string' ? entreeFetch : (entreeFetch as Request)?.url ?? entreeFetch);
    const methode = (init?.method ?? 'GET').toUpperCase();
    let corps: any = null;
    try { corps = init?.body ? JSON.parse(String(init.body)) : null; } catch { corps = init?.body; }
    appels.push({ url, methode, corps });
    if (url.includes('/tracks/441078583/similar')) {
      return reponse(reponseSimilaires.statut, reponseSimilaires.corps);
    }
    if (url.includes('/library/tracks/2450/similar')) {
      return reponse(200, { seed_track_id: 2450, count: 2, items: [{ id: 11 }, { id: 12 }] });
    }
    if (/\/zones\/1\/play$/.test(url)) return reponse(200, { id: 1, name: 'Salon', state: 'playing' });
    if (/\/zones\/1\/queue\/add$/.test(url)) return reponse(200, { queue_length: 2 });
    return reponse(200, {});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('fil 1906 — `entreesMenuPiste` : la capacité de service', () => {
  it('« Plus comme ça » tient sur `similairesDeService`, sans identifiant de bibliothèque', () => {
    const avec = entreesMenuPiste(
      { jouable: true, idBibliotheque: null, artistId: null, albumId: null, similairesDeService: true } as any,
      { plusCommeCa: () => {} },
    ).map((e) => e.cle);
    expect(avec).toContain('library.playSimilar');
  });
});

describe('🔴 fil 1906 — barre v2 (`PisteActions`)', () => {
  it('titre Qobuz : « Plus comme ça » présent', () => {
    const items = menuV2(QOBUZ);
    expect(entree(items, PLUS_COMME_CA), libelles(items).join(' | ')).toBeTruthy();
  });

  for (const s of ['tidal', 'bandcamp', 'deezer', 'spotify', 'youtube', 'amazon']) {
    it(`titre ${s} : « Plus comme ça » absent`, () => {
      expect(entree(menuV2(service(s)), PLUS_COMME_CA)).toBeUndefined();
    });
  }

  it('clic sur un titre Qobuz : la route des voisins, PUIS la lecture qui remplace la file', async () => {
    entree(menuV2(QOBUZ), PLUS_COMME_CA)!.click();
    flushSync();
    await vi.waitFor(() => expect(indexDe(estFile)).toBeGreaterThan(-1));
    const iSim = indexDe(estSimilaires);
    const iLire = indexDe(estLecture);
    const iFile = indexDe(estFile);
    expect(iSim).toBeGreaterThan(-1);
    expect(iLire).toBeGreaterThan(iSim);
    expect(iFile).toBeGreaterThan(iLire);
    // La tête REMPLACE la file : `play`, désignée par la PAIRE source + id —
    // la source reposée par le client, le serveur ne l'écrit pas.
    expect(appels[iLire].corps).toMatchObject({ source: 'qobuz', source_id: 'q-a2', title: 'Heart of Gold' });
    // Le reste s'enfile derrière, en une requête.
    expect(appels[iFile].corps.tracks).toEqual([
      expect.objectContaining({ source: 'qobuz', source_id: 'q-b1' }),
    ]);
    // Aucune route de bibliothèque : un titre Qobuz n'a pas d'`i64`.
    expect(appels.some((a) => a.url.includes('/library/tracks/'))).toBe(false);
  });

  it('aucun voisin : on le DIT, sans rien lancer', async () => {
    reponseSimilaires = { statut: 200, corps: [] };
    entree(menuV2(QOBUZ), PLUS_COMME_CA)!.click();
    flushSync();
    await vi.waitFor(() => expect(
      get(notifications).some((n) => n.level === 'info' && n.message.includes('aucun titre voisin')),
    ).toBe(true));
    expect(appels.some(estSimilaires)).toBe(true);
    expect(appels.some(estLecture)).toBe(false);
  });

  it('refus du serveur : le message d’erreur de « Plus comme ça »', async () => {
    reponseSimilaires = { statut: 502, corps: 'amont en panne' };
    entree(menuV2(QOBUZ), PLUS_COMME_CA)!.click();
    flushSync();
    await vi.waitFor(() => expect(
      get(notifications).some((n) => n.message.includes('Impossible de récupérer les titres similaires')),
    ).toBe(true));
    expect(appels.some(estLecture)).toBe(false);
  });

  it('titre de bibliothèque : le geste d’origine est intact (`track_ids`)', async () => {
    entree(menuV2(BIBLIO), PLUS_COMME_CA)!.click();
    flushSync();
    await vi.waitFor(() => expect(indexDe(estLecture)).toBeGreaterThan(-1));
    expect(appels.some((a) => a.url.includes('/library/tracks/2450/similar'))).toBe(true);
    expect(appels[indexDe(estLecture)].corps).toEqual({ track_ids: [11, 12] });
    expect(appels.some(estSimilaires)).toBe(false);
  });
});

describe('🔴 fil 1906 — menu du client actuel (`MenuPisteV1`)', () => {
  it('titre Qobuz : « Plus comme ça » présent', () => {
    const items = menuV1(QOBUZ);
    expect(entree(items, PLUS_COMME_CA), libelles(items).join(' | ')).toBeTruthy();
  });

  for (const s of ['tidal', 'bandcamp']) {
    it(`titre ${s} : « Plus comme ça » absent`, () => {
      expect(entree(menuV1(service(s)), PLUS_COMME_CA)).toBeUndefined();
    });
  }

  it('clic sur un titre Qobuz : même geste que la barre v2', async () => {
    entree(menuV1(QOBUZ), PLUS_COMME_CA)!.click();
    flushSync();
    await vi.waitFor(() => expect(indexDe(estFile)).toBeGreaterThan(-1));
    expect(indexDe(estLecture)).toBeGreaterThan(indexDe(estSimilaires));
    expect(indexDe(estSimilaires)).toBeGreaterThan(-1);
    expect(appels[indexDe(estLecture)].corps).toMatchObject({ source: 'qobuz', source_id: 'q-a2' });
  });
});
