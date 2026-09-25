// @vitest-environment jsdom
//
// SIX WIDGETS DE FAVORIS PAR TYPE sur l'Accueil — Bertrand, 25/09/2026 :
// « Artistes favoris, Pistes favorites, Playlists favorites, Smart playlists
// favorites, Collections favorites, Smart collections favorites ».
//
// 🔴 CE TÉMOIN MONTE `PageWidgets` ET CLIQUE, il ne lit pas la source. C'est
// le BRANCHEMENT entre le chargeur, l'élément et le geste qui compte — la
// leçon de #1108 : une fabrique juste et un clic mort, c'est un widget mort.
//
// Le serveur est simulé à la route près, avec les formes mesurées sur le .18
// (v0.9.165) : `/profiles/{id}/favorites` rend des lignes `{item_type,
// item_id}`, `/favorites/streaming` des favoris de service `{item_type,
// service, service_id, title, artist, cover_url}`. L'id 1 existe à la fois
// comme collection et comme collection intelligente : la SORTE doit suivre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { WIDGETS, DISPOSITION_DEFAUT, widgetParId } from '../accueilWidgets';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const SIX = [
  ['favoris-artistes', 'v2.home.wFavArtists'],
  ['favoris-pistes', 'v2.home.wFavTracks'],
  ['favoris-playlists', 'v2.home.wFavPlaylists'],
  ['favoris-smart-playlists', 'v2.home.wFavSmartPlaylists'],
  ['favoris-collections', 'v2.home.wFavCollections'],
  ['favoris-smart-collections', 'v2.home.wFavSmartCollections'],
] as const;

const LOCALES: Record<string, Record<string, string>> = {
  de, en, es, fr, hu, it: it_, ja, ko, ro, sv, zh,
} as any;

/** Les favoris de la bibliothèque — une ligne par type. */
const LIGNES = [
  { item_type: 'artist', item_id: 7 },
  { item_type: 'track', item_id: 42 },
  { item_type: 'playlist', item_id: 5 },
  { item_type: 'smart_playlist', item_id: 3 },
  { item_type: 'collection', item_id: 1 },
  { item_type: 'smart_collection', item_id: 1 },
];

/** Les favoris de service, forme du .18. */
const SERVICES = [
  { id: 1, profile_id: 1, item_type: 'artist', service: 'qobuz', service_id: '36819', title: 'Daft Punk', artist: null, album: null, cover_url: '/q/dp.jpg' },
  { id: 2, profile_id: 1, item_type: 'track', service: 'qobuz', service_id: '9140031', title: 'Get Lucky', artist: 'Daft Punk', album: 'Random Access Memories', cover_url: '/q/ram.jpg' },
  { id: 3, profile_id: 1, item_type: 'playlist', service: 'qobuz', service_id: '69142842', title: 'Dimanche R&B', artist: null, album: null, cover_url: '/q/pl.jpg' },
];

let vide = false;
let appels: Array<{ url: string; corps: any }> = [];

function poserLeServeur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      appels.push({ url: u, corps: init?.body ? JSON.parse(init.body) : null });
      let corps: any = {};
      if (u.includes('facet')) corps = [];
      else if (u.includes('/favorites/streaming')) corps = vide ? [] : SERVICES;
      else if (u.includes('/profiles/1/favorites')) corps = vide ? [] : LIGNES;
      else if (u.includes('/library/artists/7')) corps = { id: 7, name: 'Nick Cave', image_path: '/a/7.jpg' };
      else if (u.includes('/library/tracks/42'))
        corps = { id: 42, title: 'Around the World', artist_name: 'Daft Punk', album_id: 12, cover_path: '/c/12.jpg' };
      else if (u.includes('/playlists/5/tracks'))
        corps = [{ title: 'A', cover_path: '/c/a.jpg' }, { title: 'B', cover_path: '/c/b.jpg' }];
      else if (u.includes('/playlists/5')) corps = { id: 5, name: 'Mes dimanches', track_count: 2 };
      else if (u.includes('/library/smart-playlists/3/tracks'))
        corps = [{ id: 9, title: 'X', cover_path: '/c/x.jpg' }];
      else if (u.includes('/library/smart-playlists'))
        corps = [{ id: 1, name: '50 Random Tracks' }, { id: 3, name: 'Jamais écoutés' }];
      else if (u.includes('/library/collections/1/albums')) corps = [{ title: 'C', cover_path: '/c/c1.jpg' }];
      else if (u.includes('/library/collections')) corps = [{ id: 1, name: 'Audiophile' }, { id: 2, name: 'Autre' }];
      else if (u.includes('/library/smart-collections/1/albums')) corps = [];
      else if (u.includes('/library/smart-collections'))
        corps = [{ id: 1, name: '2025', covers: ['/c/s1.jpg'] }, { id: 4, name: 'Hors favoris' }];
      else if (u.includes('/streaming/') && u.includes('/tracks')) corps = [];
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function poserLaPage(id: string) {
  const w = widgetParId(id);
  expect(w, `le widget « ${id} » n’est pas au catalogue`).toBeTruthy();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [w!], dispositionDefaut: [id], cle: 'home_widgets' },
  });
  flushSync();
  await souffler(150);
  flushSync();
  return hote;
}

const titres = (page: HTMLElement) =>
  Array.from(page.querySelectorAll('.carte .ct')).map((e) => e.textContent?.trim());

async function cliquerTitre(page: HTMLElement, rang: number) {
  const b = page.querySelectorAll<HTMLButtonElement>('.carte button.meta')[rang];
  expect(b, `pas de titre cliquable au rang ${rang}`).toBeTruthy();
  expect(b.disabled, 'le titre est désactivé : le clic ne ferait rien').toBe(false);
  b.click();
  await souffler(80);
  flushSync();
}

/** Les raccourcis émis vers un autre écran (`tune:shortcut-restore`). */
let raccourcis: string[] = [];
const ecouter = (e: Event) => raccourcis.push((e as CustomEvent).detail?.target?.key);

beforeEach(() => {
  vide = false;
  appels = [];
  raccourcis = [];
  poserLeServeur();
  currentProfileId.set(1);
  currentZoneId.set(1);
  activeView.set('home');
  window.addEventListener('tune:shortcut-restore', ecouter);
});

afterEach(() => {
  window.removeEventListener('tune:shortcut-restore', ecouter);
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Accueil — six widgets de favoris par type : le catalogue', () => {
  it('chacun est au catalogue, sous son titre, et traduit dans les 11 langues', () => {
    for (const [id, cle] of SIX) {
      const w = WIDGETS.find((x) => x.id === id);
      expect(w, id).toBeTruthy();
      expect(w!.cleTitre).toBe(cle);
      expect(w!.forme).toBe('bande');
      for (const [lang, table] of Object.entries(LOCALES)) {
        expect(table[cle], `${cle} manque en ${lang}`).toBeTruthy();
      }
    }
  });

  it('🔴 l’onglet Smart playlists pose le cœur qui REMPLIT le widget, sous son type', () => {
    // Sans ce cœur, « Smart playlists favorites » ne se remplirait que depuis
    // l'ancien écran des playlists intelligentes. Type distinct (#4798) :
    // jamais `playlistId` avec le numéro d'une règle.
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/PlaylistsV2.svelte'), 'utf-8');
    expect(src).toContain('favori={sp.id != null ? { smartPlaylistId: sp.id } : null}');
    expect(src).toContain('etiquettes={sp.id != null ? cibleSmartPlaylist(sp.id) : null}');
    expect(src).not.toContain('playlistId: sp.id }');
  });

  it('aucun ne s’impose à la disposition par défaut : on les AJOUTE', () => {
    for (const [id] of SIX) expect(DISPOSITION_DEFAUT).not.toContain(id);
  });
});

describe('Accueil — six widgets de favoris par type : montés, ils affichent et ouvrent', () => {
  it('« Artistes favoris » : bibliothèque ET service ; le clic ouvre la page artiste', async () => {
    const page = await poserLaPage('favoris-artistes');
    expect(titres(page)).toEqual(['Nick Cave', 'Daft Punk']);
    await cliquerTitre(page, 0);
    // La page artiste COMMUNE (#1494) pour un artiste de la bibliothèque.
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ service: null, id: '7', nom: 'Nick Cave' });
    await cliquerTitre(page, 1);
    // La fiche du SERVICE pour un artiste Qobuz — par son identifiant.
    expect(get(ficheArtisteService)).toMatchObject({ service: 'qobuz', id: '36819' });
  });

  it('« Pistes favorites » : le clic JOUE la piste, locale par `track_id`, de service par la paire', async () => {
    const page = await poserLaPage('favoris-pistes');
    expect(titres(page)).toEqual(['Around the World', 'Get Lucky']);
    await cliquerTitre(page, 0);
    const lectures = () => appels.filter((a) => a.url.includes('/zones/1/play')).map((a) => a.corps);
    expect(lectures().at(-1)).toEqual({ track_id: 42 });
    await cliquerTitre(page, 1);
    expect(lectures().at(-1)).toEqual({ source: 'qobuz', source_id: '9140031' });
  });

  it('« Playlists favorites » : locale en mosaïque, ouverte dans SON écran ; de service, sa fiche', async () => {
    const page = await poserLaPage('favoris-playlists');
    expect(titres(page)).toEqual(['Mes dimanches', 'Dimanche R&B']);
    // La mosaïque de la playlist locale, tirée de ses pistes APRÈS l'affichage.
    await souffler(80);
    flushSync();
    expect(page.querySelectorAll('.carte')[0].querySelector('.mos'), 'pas de mosaïque').toBeTruthy();
    await cliquerTitre(page, 0);
    expect(get(activeView)).toBe('playlists');
    expect(raccourcis).toEqual(['playlists:5']);
    await cliquerTitre(page, 1);
    expect(document.querySelector('.v2-pldetail'), 'la fiche de la playlist de service').toBeTruthy();
  });

  it('« Smart playlists favorites » : seule la favorite, ouverte sous `smartplaylists:`', async () => {
    const page = await poserLaPage('favoris-smart-playlists');
    expect(titres(page)).toEqual(['Jamais écoutés']);
    await cliquerTitre(page, 0);
    expect(get(activeView)).toBe('smartplaylists');
    expect(raccourcis).toEqual(['smartplaylists:3']);
  });

  it('« Collections favorites » : la collection 1, ouverte sous `collections:`', async () => {
    const page = await poserLaPage('favoris-collections');
    expect(titres(page)).toEqual(['Audiophile']);
    await cliquerTitre(page, 0);
    expect(get(activeView)).toBe('collections');
    expect(raccourcis).toEqual(['collections:1']);
  });

  it('« Smart collections favorites » : la MÊME id 1, mais sous `smartcollections:`', async () => {
    const page = await poserLaPage('favoris-smart-collections');
    expect(titres(page)).toEqual(['2025']);
    // `covers` rendu par le serveur : la mosaïque sans requête de plus.
    expect(page.querySelector('.carte .mos')).toBeTruthy();
    expect(appels.some((a) => a.url.includes('/smart-collections/1/albums'))).toBe(false);
    await cliquerTitre(page, 0);
    expect(get(activeView)).toBe('collections');
    expect(raccourcis).toEqual(['smartcollections:1']);
  });

  it.each(SIX.map(([id]) => id))('« %s » sans favori : un message, pas une bande vide', async (id) => {
    vide = true;
    const page = await poserLaPage(id);
    expect(page.querySelectorAll('.carte').length).toBe(0);
    expect(page.querySelector('.state.mince'), 'le message d’état vide').toBeTruthy();
  });

  it('cinquante éléments au plus par bande', async () => {
    const beaucoup = Array.from({ length: 70 }, (_, i) => ({
      id: i + 100, profile_id: 1, item_type: 'artist', service: 'qobuz', service_id: String(i + 1),
      title: `Artiste ${i}`, artist: null, album: null, cover_url: null,
    }));
    const avant = SERVICES.slice();
    SERVICES.splice(0, SERVICES.length, ...(beaucoup as any));
    try {
      const els = await widgetParId('favoris-artistes')!.charger({ profileId: 1, albums: [], zones: [] });
      expect(els.length).toBe(50);
    } finally {
      SERVICES.splice(0, SERVICES.length, ...avant);
    }
  });
});
