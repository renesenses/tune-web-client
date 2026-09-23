import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * #4798 — une playlist INTELLIGENTE se met en favori et porte des étiquettes.
 *
 * Bertrand, 23/09/2026, onglet Smart playlists : « il manque 2 des 5 CTA sur
 * les pochettes (favori et tag icons) ». Ils manquaient à dessein (#1455) tant
 * que le serveur ne connaissait pas ce type d'objet ; il le sert depuis
 * renesenses/tune-server-rust#4798.
 *
 * ## Le piège que ces gardes ferment
 *
 * `playlists.id` et `smart_playlists.id` se RECOUVRENT : l'id 1 existe dans
 * les deux tables. Le type doit donc être distinct PARTOUT — champ de
 * référence, magasin, `item_type`, clé de liste, clé de raccourci — et jamais
 * déduit du numéro. C'est la leçon des collections, où l'id 1 est à la fois
 * « favorites » et « Audiophile ».
 *
 * ⚠️ Ces tests lisent la SOURCE : ils empêchent des régressions précises, ils
 * ne prouvent pas que le cœur s'allume à l'écran.
 */
const lire = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf-8');

describe('Playlist intelligente — le favori porte SON type', () => {
  it('la référence locale a son propre champ et son propre magasin', () => {
    const src = lire('lib/favorisLocaux.ts');
    expect(src).toContain('smartPlaylistId?: number | null');
    expect(src).toContain("champ: 'smart_playlist_id' as const");
    expect(src).toContain('store: favoriteSmartPlaylistIds');
    // La lecture réactive passe par un HUITIÈME ensemble, pas par celui des
    // playlists.
    expect(src).toContain('playlistsSmart: Set<number> = new Set()');
    expect(src).toContain('if (ref.smartPlaylistId) return playlistsSmart.has(ref.smartPlaylistId)');
  });

  it('le magasin existe et se remplit depuis les identifiants rendus par l’API', () => {
    const magasins = lire('lib/stores/profile.ts');
    expect(magasins).toContain('export const favoriteSmartPlaylistIds = writable<Set<number>>(new Set())');
    expect(magasins).toContain('favoriteSmartPlaylistIds.set(new Set(favs.smartPlaylistIds ?? []))');
    const api = lire('lib/api.ts');
    expect(api).toContain('smart_playlist_id?: number');
    expect(api).toContain("item_type: 'smart_playlist', item_id: p.smart_playlist_id");
    expect(api).toContain("smartPlaylistIds: lignes('smart_playlist').map((r) => r.item_id)");
  });

  it('la pochette lit ce magasin-là', () => {
    const src = lire('components/v2/PochetteActions.svelte');
    expect(src).toContain('$favoriteSmartPlaylistIds,');
  });

  it('l’onglet Smart playlists pose les DEUX gestes, sous leur type distinct', () => {
    const vue = lire('components/v2-heritage/SmartPlaylistsView.svelte');
    expect(vue).toContain('favori={{ smartPlaylistId: sp.id }}');
    expect(vue).toContain('etiquettes={cibleSmartPlaylist(sp.id)}');
    // JAMAIS `playlistId`/`playlist` avec le numéro d'une playlist intelligente.
    expect(vue).not.toContain('playlistId: sp.id');
    expect(vue).not.toContain("itemType: 'playlist'");
  });
});

describe('Playlist intelligente — l’étiquette porte SON type', () => {
  it('la cible est écrite UNE fois, avec le type smart_playlist', () => {
    const src = lire('lib/cibleEtiquette.ts');
    expect(src).toContain('export function cibleSmartPlaylist(id: number): CibleLocale');
    expect(src).toContain("return { itemType: 'smart_playlist', itemId: id }");
  });

  it('la lecture par étiquette a sa propre route', () => {
    const api = lire('lib/api.ts');
    expect(api).toContain('export function getTagSmartPlaylists(tagId: number)');
    const i = api.indexOf('export function getTagSmartPlaylists(');
    expect(api.slice(i, i + 400)).toContain('/tags/${tagId}/smart-playlists');
  });
});

describe('Écrans Favoris et Étiquettes — une playlist intelligente cliquable vers son détail', () => {
  const favoris = lire('components/v2/FavoritesV2.svelte');
  const etiquettes = lire('components/v2/EtiquettesV2.svelte');

  it('les Favoris lisent les identifiants et les apparient par la SORTE', () => {
    expect(favoris).toContain('f.smartPlaylistIds');
    expect(favoris).toContain('api.getSmartPlaylists()');
    expect(favoris).toContain('$favoriteSmartPlaylistIds.has(p.id)');
  });

  it('les Étiquettes lisent la cinquième route et marquent les lignes', () => {
    expect(etiquettes).toContain('api.getTagSmartPlaylists(tag.id!)');
    expect(etiquettes).toContain("(sp?.smart_playlists ?? []).map((x: any) => ({ ...x, smart: true }))");
  });

  it('la clé de liste porte la sorte : deux ids égaux ne se disputent pas la ligne', () => {
    expect(favoris).toContain('(pl.smart ? `s-${pl.id}` : clef(pl, i))');
    expect(etiquettes).toContain('(pl.smart ? `s-${pl.id}` : `p-${pl.id ?? pl.name}`)');
  });

  it('ouvrir mène à SON onglet, sous SA clé de raccourci', () => {
    // `smartplaylists:` et jamais `playlists:` — `SmartPlaylistsView`
    // n'écoute que son propre préfixe, et l'autre écran ouvrirait la playlist
    // ordinaire du même numéro.
    expect(favoris).toContain("ouvrirAilleurs('smartplaylists', `smartplaylists:${pl.id}`");
    expect(etiquettes).toContain('ouvrirSmartPlaylist(pl)');
    const brique = lire('lib/ouvrirParRaccourci.ts');
    expect(brique).toContain("ouvrirParRaccourci('smartplaylists', `smartplaylists:${sp.id}`");
    // Dans les Étiquettes, la ligne devient un BOUTON quand elle s'ouvre.
    expect(etiquettes).toContain("<svelte:element this={locale ? 'button' : 'div'} class=\"simple\"");
  });
});
