// @vitest-environment jsdom
//
// renesenses/tune-web-client#1826 : bug n°8 relevé par Bertrand le 30/09/2026,
// en réunion avec Yves Corbat, sur la 0.9.168.
//
//   « Dans la Recherche, un clic sur un artiste qui n'existe pas dans la
//     bibliothèque locale (résultat Qobuz, Tidal, Deezer…) n'ouvre pas la
//     fiche artiste. »
//
// ══════════════════════════════════════════════════════════════════════════
// 🔴 POURQUOI LES GARDES EXISTANTES ÉTAIENT VERTES
//
// Les fixtures de la Recherche (#3825, #1135, #1136…) donnent à l'artiste de
// service un `source_id: 'q1'`. LE SERVEUR N'EN REND PAS. `StreamArtist`
// (`tune-core/src/streaming/traits.rs`) sérialise `id`. Mesuré sur le .18
// (0.9.168) le 30/09/2026 avec `GET /api/v1/search?q=Leprous&limit=3` :
//
//   qobuz  [{"id":"610403","image_path":"https://static.qobuz.com/…","name":"Leprous"}]
//   tidal  [{"id":"3631982","image_path":"https://resources.tidal.com/…","name":"Leprous"}]
//
// Ce fichier donne donc à `fetch` la réponse du serveur TELLE QU'ELLE EST, sans
// `source_id`, et rejoue le geste complet : la coquille, la Recherche, le clic
// sur l'artiste, puis la fiche et les albums qu'elle demande au service.
//
// Contre-épreuve, faite à la main le 30/09 : sans la ligne de `federatedSearch`
// qui recopie `id` dans `source_id`, les cas « service » rougissent (la
// recherche repart sur « Leprous », aucune fiche n'est visée) et le cas
// « local » reste vert. Le dernier cas l'inscrit dans la suite : une ligne
// POURVUE d'un `source_id`, la forme des anciennes fixtures, s'ouvre avec ou
// sans correctif. C'est bien pour cela qu'elles ne mesuraient rien.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';

vi.setConfig({ testTimeout: 30_000 });

const REQUETE = 'Leprous';
const vide = { artists: [], albums: [], tracks: [], playlists: [] };

/** L'artiste de la BIBLIOTHÈQUE : un `id` entier, pas de source. */
const LOCAL = { ...vide, artists: [{ id: 42, name: 'Leprous Local Band', image_path: null }] };

/** Les artistes de SERVICE, à la forme exacte du .18. Pas de `source`, pas de `source_id`. */
function services(avecSourceId = false) {
  const qobuz: any = { id: '610403', image_path: null, name: 'Leprous' };
  const tidal: any = { id: '3631982', image_path: null, name: 'Soen' };
  if (avecSourceId) { qobuz.source_id = '610403'; tidal.source_id = '3631982'; }
  return { qobuz: { ...vide, artists: [qobuz] }, tidal: { ...vide, artists: [tidal] } };
}

/** Réponse de `/streaming/qobuz/artists/610403/albums`, forme du .18. */
const ALBUMS_QOBUZ = [
  { source_id: '0886447777777', artist_id: '610403', artist_name: 'Leprous', title: 'Aphelion', source: 'qobuz', year: 2021, cover_path: null },
];

let urls: string[] = [];
let avecSourceId = false;

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function corpsPour(u: string): unknown {
  if (/\/library\/search/.test(u)) return LOCAL;
  if (/\/api\/v1\/search\?/.test(u)) return { local: LOCAL, services: services(avecSourceId), radios: [] };
  if (u.includes('/streaming/qobuz/artists/610403/albums')) return ALBUMS_QOBUZ;
  if (u.includes('/streaming/qobuz/artists/610403/top-tracks')) return [];
  if (u.includes('/streaming/qobuz/artists/610403')) return { id: '610403', name: 'Leprous', image_path: null };
  if (/\/streaming\/services/.test(u)) {
    return {
      qobuz: { enabled: true, authenticated: true },
      tidal: { enabled: true, authenticated: true },
    };
  }
  return COLLECTIONS.test(u) ? [] : {};
}

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  urls = [];
  avecSourceId = false;
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    urls.push(u);
    return reponse(corpsPour(u));
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  ficheArtisteService.set(null);
  vueDeRetour.set(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  setSearchCriteria(null);
  activeView.set('home');
  vi.unstubAllGlobals();
});

/** La coquille, ouverte sur la Recherche, résultats locaux ET de service reçus. */
async function rechercher(): Promise<HTMLDivElement> {
  setSearchCriteria({ q: REQUETE });
  activeView.set('search');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  // La saisie est différée (~300 ms), puis le second temps interroge les services.
  await respirer(350);
  for (let i = 0; i < 20; i++) {
    await respirer(10);
    flushSync();
    if (tuile(hote, 'Leprous') && tuile(hote, 'Leprous Local Band')) break;
  }
  return hote;
}

function tuile(el: HTMLElement, nom: string): Element | null {
  return [...el.querySelectorAll('.arow .artile')]
    .find((t) => (t.querySelector('.an')?.textContent ?? '').trim() === nom) ?? null;
}

function cliquerNom(el: HTMLElement, nom: string) {
  const t = tuile(el, nom);
  expect(t, `la tuile « ${nom} » n'est pas rendue dans la rangée Artistes`).not.toBeNull();
  t!.querySelector<HTMLButtonElement>('button.meta')!.click();
  flushSync();
}

describe('#1826 : depuis la Recherche, un artiste s’ouvre sur sa fiche, local comme service', () => {
  it('un artiste LOCAL ouvre la page commune (témoin : ce cas marchait déjà)', async () => {
    const el = await rechercher();
    cliquerNom(el, 'Leprous Local Band');
    expect(get(ficheArtisteService)).toEqual({ service: null, id: '42', nom: 'Leprous Local Band' });
    expect(get(activeView)).toBe('streamingartist');
    expect(get(vueDeRetour)).toBe('search');
  });

  it('🔴 un artiste QOBUZ, à la forme réelle du serveur (id, sans source_id), ouvre SA fiche', async () => {
    const el = await rechercher();
    cliquerNom(el, 'Leprous');

    // Le défaut : la recherche repartait sur le nom et rien ne changeait de vue.
    expect(get(ficheArtisteService), 'aucune fiche visée : le clic est retombé sur `q = ar.name`')
      .toEqual({ service: 'qobuz', id: '610403', nom: 'Leprous' });
    expect(get(activeView)).toBe('streamingartist');
    expect(get(vueDeRetour)).toBe('search');
  });

  it('🔴 la fiche ouverte demande ses albums au SERVICE et les affiche, comme depuis un album Qobuz', async () => {
    const el = await rechercher();
    cliquerNom(el, 'Leprous');
    for (let i = 0; i < 20; i++) {
      await respirer(10);
      flushSync();
      if (el.textContent?.includes('Aphelion')) break;
    }
    expect(urls.some((u) => u.includes('/streaming/qobuz/artists/610403/albums')),
      'la fiche n’a pas interrogé /streaming/qobuz/artists/610403/albums').toBe(true);
    expect(el.textContent).toContain('Aphelion');
  });

  it('🔴 un artiste TIDAL aussi : la correction vaut pour tous les services', async () => {
    const el = await rechercher();
    cliquerNom(el, 'Soen');
    expect(get(ficheArtisteService)).toEqual({ service: 'tidal', id: '3631982', nom: 'Soen' });
    expect(get(activeView)).toBe('streamingartist');
  });

  it('la pastille de service mène à la même fiche', async () => {
    const el = await rechercher();
    const t = tuile(el, 'Leprous')!;
    t.querySelector<HTMLButtonElement>('.asrc .asrcb')!.click();
    flushSync();
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: '610403', nom: 'Leprous' });
  });

  it('contre-épreuve inscrite : une ligne qui porte DÉJÀ source_id s’ouvre avec ou sans correctif', async () => {
    // Forme des anciennes fixtures. Ce cas est vert même sans le correctif :
    // c'est pourquoi elles ne pouvaient pas voir le défaut.
    avecSourceId = true;
    const el = await rechercher();
    cliquerNom(el, 'Leprous');
    expect(get(ficheArtisteService)).toEqual({ service: 'qobuz', id: '610403', nom: 'Leprous' });
  });
});
