// @vitest-environment jsdom
/**
 * 🔴 #4581 — « (Unknown Album) / Unknown Artist » dans Bibliothèque › Albums.
 *
 * Le constat venait avec une hypothèse : la tuile lirait un champ qui n'existe
 * que pour un album local (un chemin de fichier, un identifiant de dossier), et
 * retomberait sur un repli pour un album UPnP. **Mesuré, c'est faux.**
 *
 * `GET /api/v1/library/albums` sur le .18 le 20/09/2026, 4 382 albums en trois
 * pages : 70 portent `source: "upnp"`, et 45 d'entre eux sont RÉELLEMENT
 * intitulés « (Unknown Album) » par le serveur, artiste « Unknown Artist »,
 * `cover_path: null`. La grille affiche donc exactement ce qu'on lui sert. Le
 * défaut est en amont — l'indexation UPnP fabriquait un album fantôme par
 * passe (44 des 45 n'ont AUCUNE piste), corrigé côté serveur.
 *
 * Ce témoin fige l'autre moitié du constat, celle qu'on ne veut jamais voir
 * régresser : un album UPnP qui A un titre, un artiste et une pochette les
 * affiche, sans repli, au même titre qu'un album local. La contre-épreuve est
 * de faire lire à la tuile un champ absent de la charge utile UPnP — elle
 * rougit alors sur les deux valeurs.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Library from '../../components/v2/LibraryV2.svelte';
import { albums, libraryFolderScope } from '../stores/library';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

/** Les trois lignes sont copiées de la réponse du .18, champ pour champ : un
 *  album UPnP n'a NI `path`, NI `file_path`, NI `folder_id` — seulement un
 *  `source_id` `<udn>|<condensat>`. C'est précisément ce que la tuile ne doit
 *  pas avoir besoin de lire. */
const catalogue: Album[] = [
  {
    id: 4399, title: 'Kino Music', artist_id: 2283, artist_name: 'Pierre Daven-Keller',
    source: 'upnp', source_id: 'uuid:258FC2D5-E2C3-B734-0-123456789abc|5cf94a9195326ae5',
    cover_path: '6b35af2e0b58cdf93faf9d6adc8941ee', track_count: 18, year: 2019, format: 'wav',
  },
  {
    id: 4389, title: 'El Dorado', artist_id: 2294, artist_name: 'Marcus King',
    source: 'upnp', source_id: 'uuid:258FC2D5-E2C3-B734-0-123456789abc|fd5aa55e3868a092',
    cover_path: '67cda2dc916b1e4af5ed424cdaf39f6d', track_count: 14, year: 2015, format: 'flac',
  },
  {
    id: 566, title: 'Toccata Electronica', artist_id: 232, artist_name: 'Kraftwerk',
    source: 'local', cover_path: '0eaddb282739c4fbccc806c6fe004a71', track_count: 14, year: 1995, format: 'flac',
  },
];

let instance: ReturnType<typeof mount>;
let target: HTMLDivElement;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); flushSync(); };
/** Le couple (titre, artiste) tel que la tuile le rend — jamais le texte de la
 *  page entière, qui contiendrait aussi les facettes et le rail. */
const tuiles = () => [...target.querySelectorAll('.body button.meta')].map(b => ({
  titre: b.querySelector('.ct')?.textContent?.trim(),
  artiste: b.querySelector('.ca')?.textContent?.trim(),
}));

beforeEach(async () => {
  localStorage.clear();
  libraryFolderScope.set(null); activeView.set('library'); currentZoneId.set(1);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const path = String(url);
    let data: unknown = {};
    if (path.includes('/network/media-servers')) {
      data = [{ id: 'uuid:258FC2D5-E2C3-B734-0-123456789abc', name: 'Asset UPnP: Mac-Studio-6', reachable: true, presence: 'present' }];
    } else if (path.includes('/network/library-sources')) {
      data = { items: [{ udn: 'uuid:258FC2D5-E2C3-B734-0-123456789abc' }] };
    } else if (path.includes('/library/stats')) data = { tracks: 0 };
    else if (/\/library\/(tracks|artists)/.test(path)) data = [];
    else if (/\/zones|\/playlists/.test(path)) data = [];
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  albums.set(catalogue);
  target = document.createElement('div'); document.body.appendChild(target);
  instance = mount(Library, { target }); await flush();
});
afterEach(async () => { await unmount(instance); target.remove(); vi.unstubAllGlobals(); libraryFolderScope.set(null); });

it('la grille affiche le titre et l’artiste d’un album UPnP, comme ceux d’un album local', () => {
  const rendues = tuiles();
  expect(rendues).toEqual(expect.arrayContaining([
    { titre: 'Kino Music', artiste: 'Pierre Daven-Keller' },
    { titre: 'El Dorado', artiste: 'Marcus King' },
    { titre: 'Toccata Electronica', artiste: 'Kraftwerk' },
  ]));
  // Aucun repli : ni « Unknown », ni une pastille de source à la place du nom.
  for (const { titre, artiste } of rendues) {
    expect(`${titre} ${artiste}`).not.toMatch(/unknown|inconnu|undefined/i);
  }
});

it('la pochette d’un album UPnP est servie par son cover_path, sans chemin de fichier', () => {
  const images = [...target.querySelectorAll<HTMLImageElement>('.body img')]
    .map(i => i.getAttribute('src') ?? '')
    .filter(Boolean);
  expect(images.some(src => src.includes('6b35af2e0b58cdf93faf9d6adc8941ee'))).toBe(true);
  expect(images.some(src => src.includes('67cda2dc916b1e4af5ed424cdaf39f6d'))).toBe(true);
});

it('le compteur « Tout » annonce exactement ce que la grille dessine', () => {
  expect(target.querySelector('.filters .chip.count')?.textContent).toContain(String(catalogue.length));
  expect(tuiles()).toHaveLength(catalogue.length);
});
