/**
 * Favoris d'un objet LOCAL (album, piste, artiste) — le SEUL chemin.
 *
 * Le pendant de `streamingFavorites` pour la bibliothèque locale. Ce module
 * existe pour la même raison, et pour éviter la même panne : `HeartButton`
 * portait cette bascule dans son propre corps, si bien que toute autre surface
 * voulant un cœur devait la réécrire.
 *
 * C'est exactement ce qui avait produit le défaut #1478 côté streaming — deux
 * boutons, deux vérités, un cœur plein dans la barre et vide dans la liste.
 * Le chantier des cinq icônes sur la pochette ajoute une deuxième surface :
 * l'extraction se fait AVANT qu'elle diverge, pas après.
 *
 * ## Ce que fait la bascule
 *
 * Elle écrit d'abord dans le magasin, puis appelle l'API, et REVIENT en
 * arrière si l'appel échoue. L'inverse — attendre le serveur avant de bouger —
 * laisserait le cœur inerte le temps d'un aller-retour, et l'utilisateur
 * cliquerait deux fois.
 *
 * Les magasins sont des `Set` en mémoire, remplis une fois par profil : sans
 * eux, ouvrir la bibliothèque déclenchait un appel `/favorites/check` par
 * ligne — 30 000 requêtes, et Chrome refusait avec
 * `ERR_INSUFFICIENT_RESOURCES`.
 */
import { get } from 'svelte/store';
import * as api from './api';
import {
  currentProfileId,
  favoriteTrackIds,
  favoriteAlbumIds,
  favoriteArtistIds,
  loadProfiles,
} from './stores/profile';

/** Un objet local favorisable. Exactement UN champ est renseigné. */
export interface RefLocale {
  trackId?: number | null;
  albumId?: number | null;
  artistId?: number | null;
}

/** Le magasin concerné, ou `null` si la référence est vide. */
function magasin(ref: RefLocale) {
  if (ref.trackId) return { store: favoriteTrackIds, id: ref.trackId, champ: 'track_id' as const };
  if (ref.albumId) return { store: favoriteAlbumIds, id: ref.albumId, champ: 'album_id' as const };
  if (ref.artistId)
    return { store: favoriteArtistIds, id: ref.artistId, champ: 'artist_id' as const };
  return null;
}

/**
 * Cet objet est-il en favori ?
 *
 * Les trois ensembles sont passés par l'appelant, qui les lit avec `$` : c'est
 * ce qui rend la réponse RÉACTIVE. Les lire ici avec `get()` donnerait une
 * réponse juste une fois, puis figée.
 */
export function estFavoriLocal(
  ref: RefLocale,
  pistes: Set<number>,
  albums: Set<number>,
  artistes: Set<number>,
): boolean {
  if (ref.trackId) return pistes.has(ref.trackId);
  if (ref.albumId) return albums.has(ref.albumId);
  if (ref.artistId) return artistes.has(ref.artistId);
  return false;
}

/**
 * Bascule le favori. Rend le nouvel état, ou `null` si rien n'a pu être fait.
 *
 * Sans profil chargé, on en provoque un : `loadProfiles` crée « Default » s'il
 * n'en existe aucun. Sans cela, le cœur était un clic sans effet et sans
 * message — signalé par Elie.
 */
export async function basculerFavoriLocal(ref: RefLocale): Promise<boolean | null> {
  const m = magasin(ref);
  if (!m) return null;

  let pid = get(currentProfileId);
  if (!pid) {
    try {
      await loadProfiles();
    } catch {
      /* le profil reste absent : traité juste après */
    }
    pid = get(currentProfileId);
  }
  if (!pid) return null;

  const avant = get(m.store).has(m.id);
  const bascule = (ajouter: boolean) =>
    m.store.update((s) => {
      if (ajouter) s.add(m.id);
      else s.delete(m.id);
      return s;
    });

  bascule(!avant);
  try {
    const params = { [m.champ]: m.id } as {
      track_id?: number;
      album_id?: number;
      artist_id?: number;
    };
    if (avant) await api.removeFavorite(pid, params);
    else await api.addFavorite(pid, params);
    return !avant;
  } catch (e) {
    bascule(avant); // retour en arrière : le magasin ne doit pas mentir
    console.error('Bascule du favori local :', e);
    return avant;
  }
}
