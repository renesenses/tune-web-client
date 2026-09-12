// @vitest-environment jsdom
//
// #3822, moitié « lecture » — une playlist de service mise en favori doit
// RÉAPPARAÎTRE dans les Favoris de la nouvelle interface.
//
// Les PR qui posent le cœur sur les vignettes (#841, #843) écrivent bien la
// ligne : `streaming_favorites.item_type` est un `TEXT NOT NULL` sans
// énumération, et `streaming_favorites_repo.rs` fait transiter `item_type:
// &str` sans le valider. Mesuré.
//
// 🔴 MAIS `FavoritesV2` ne lisait que `f.playlists`, la bibliothèque. Le cœur
// se remplissait, la ligne s'écrivait, et la playlist n'apparaissait NULLE
// PART — exactement le défaut que ce fichier raconte avoir corrigé le
// 03/09/2026 pour les albums, les pistes et les artistes :
//
//   « Ils s'enregistraient donc bien et ne réapparaissaient nulle part :
//     mesure sur le .18, deux favoris de service rangés et zéro affiché ici. »
//
// ⚠️ CE TÉMOIN NE REFAIT PAS LE TRAVAIL DE `favoriPlaylistQobuz.test.ts`.
// `fusionnerPlaylistsFavorites` porte déjà 17 assertions sur la fusion
// elle-même. Ce qui manquait n'était pas la fonction — c'était son APPEL
// depuis `components/v2/`. C'est donc le branchement qu'on éprouve, en
// montant l'écran et en regardant ce qu'il rend.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';

const PL_SERVICE = {
  item_type: 'playlist', service: 'qobuz', service_id: '77',
  title: 'Jazz du dimanche', artist: null, album: null,
  cover_url: 'https://x/c.jpg', created_at: '2026-09-11T10:00:00Z',
};

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function corps(url: string): unknown {
  // 🔴 L'ordre compte : `/favorites/streaming` et `/favorites/facets`
  // contiennent tous deux `/favorites`.
  if (url.includes('/favorites/streaming')) return [PL_SERVICE];
  if (url.includes('/favorites/facets')) return [];
  // 🔴 `getFavorites` attend un TABLEAU de lignes `{item_type, item_id}` et
  // fait `rows.filter(...)` : un objet ici lève, et l'écran affiche « Favoris
  // indisponibles » — ce que le premier jet de ce témoin a montré.
  if (url.includes('/favorites')) return [];
  return [];
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps(String(url)), text: async () => JSON.stringify(corps(String(url))),
  } as unknown as Response)));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  currentProfileId.set(1);
  favoriteStreamingKeys.set(new Set([streamingFavKey('playlist', 'qobuz', '77')]));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

const poser = () => {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(FavoritesV2, { target: hote, props: {} as any });
  flushSync();
  return hote;
};
const respirer = (ms = 160) => new Promise((r) => setTimeout(r, ms));

describe('#3822 — une playlist de service réapparaît dans les Favoris', () => {
  it("l'écran APPELLE le fusionneur au lieu d'en écrire un second", async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/FavoritesV2.svelte'), 'utf-8');
    // La fonction existe depuis #2370 et porte 17 assertions : la dupliquer
    // aurait créé deux vérités sur la même fusion.
    expect(src).toContain('fusionnerPlaylistsFavorites(');
    expect(src, 'la ligne qui ne lisait que la bibliothèque est revenue')
      .not.toContain('playlists = f.playlists ?? [];');
  });

  it('elle est RENDUE dans l’onglet Playlists', async () => {
    const h = poser();
    await respirer();
    flushSync();
    // Les onglets se trouvent par leur libellé ; on ouvre « Playlists ».
    const onglets = Array.from(h.querySelectorAll<HTMLButtonElement>('button'));
    const ong = onglets.find((b) => /playlist/i.test(b.textContent ?? ''));
    if (ong) { ong.click(); flushSync(); await respirer(60); flushSync(); }
    expect(
      h.textContent,
      `« Jazz du dimanche » n'apparaît nulle part ; rendu : ${(h.textContent ?? '').slice(0, 200)}`,
    ).toContain('Jazz du dimanche');
  });

  it('🔴 elle n’est PAS cliquable — aucun écran n’accueille encore une playlist de service', async () => {
    const h = poser();
    await respirer();
    flushSync();
    const ong = Array.from(h.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => /playlist/i.test(b.textContent ?? ''));
    if (ong) { ong.click(); flushSync(); await respirer(60); flushSync(); }
    const ligne = Array.from(h.querySelectorAll('.simple'))
      .find((e) => (e.textContent ?? '').includes('Jazz du dimanche'));
    expect(ligne, 'la ligne n’est pas rendue — témoin sans objet').toBeTruthy();
    // Un lien mort serait pire que pas de lien : la ligne est un `div`, pas un
    // bouton, tant qu'il n'y a pas de destination.
    expect(ligne!.tagName.toLowerCase()).toBe('div');
    expect(ligne!.classList.contains('inerte')).toBe(true);
  });
});
