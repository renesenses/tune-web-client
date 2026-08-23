/**
 * Ouvrir un album, un artiste ou un onglet de la bibliothèque.
 *
 * Ces quatre gestes vivaient dans `HomeView`. Dès lors que les classements
 * partent au Tableau de bord, deux composants en ont besoin — et une deuxième
 * copie divergerait tôt ou tard, chacune réglant ses stores dans son ordre.
 *
 * Le cœur testable est `trouverArtisteExact` : c'est là que se prend une
 * décision, pas dans les affectations de stores.
 */
import { get } from 'svelte/store';
import { activeView } from './stores/navigation';
import {
  libraryTab,
  selectedAlbum,
  albumTracks,
  selectedArtist,
  artistAlbums,
  libraryLoading,
} from './stores/library';
import * as api from './api';

export type OngletBibliotheque = 'albums' | 'artists' | 'tracks';

/** Ouvre la bibliothèque sur un onglet donné. */
export function ouvrirBibliotheque(onglet: OngletBibliotheque): void {
  libraryTab.set(onglet);
  activeView.set('library');
}

/**
 * L'artiste dont le nom correspond EXACTEMENT, à la casse près.
 *
 * La recherche renvoie des approchants — chercher « Air » ramène « Airbourne »,
 * « Air France », « Fairground Attraction ». Ouvrir le premier venu enverrait
 * l'auditeur chez un artiste qu'il n'a pas demandé, ce qui est pire que de ne
 * rien ouvrir du tout : on ne saurait même pas qu'on s'est trompé.
 *
 * On ne replie donc PAS les accents ni la ponctuation : « Motorhead » et
 * « Motörhead » sont deux entrées distinctes de la bibliothèque, et les
 * confondre ferait ouvrir la mauvaise.
 */
export function trouverArtisteExact(
  artistes: readonly { id?: number | null; name?: string | null }[] | null | undefined,
  nom: string,
): number | null {
  if (!nom || !artistes) return null;
  const cible = nom.toLowerCase();
  const trouve = artistes.find((a) => (a?.name ?? '').toLowerCase() === cible);
  return typeof trouve?.id === 'number' ? trouve.id : null;
}

/** Ouvre la fiche d'un album, pistes comprises. */
export async function ouvrirAlbum(albumId: number): Promise<void> {
  selectedArtist.set(null);
  libraryLoading.set(true);
  try {
    const [album, tracks] = await Promise.all([
      api.getAlbum(albumId),
      api.getAlbumTracks(albumId),
    ]);
    selectedAlbum.set(album);
    albumTracks.set(tracks);
    libraryTab.set('albums');
    activeView.set('library');
  } catch (e) {
    console.error('Ouvrir album:', e);
  }
  libraryLoading.set(false);
}

/** Ouvre la fiche d'un artiste, albums compris. */
export async function ouvrirArtiste(artistId: number): Promise<void> {
  selectedAlbum.set(null);
  libraryLoading.set(true);
  try {
    const [artist, albums] = await Promise.all([
      api.getArtist(artistId),
      api.getArtistAlbums(artistId),
    ]);
    selectedArtist.set(artist);
    artistAlbums.set(albums);
    libraryTab.set('artists');
    activeView.set('library');
  } catch (e) {
    console.error('Ouvrir artiste:', e);
  }
  libraryLoading.set(false);
}

/**
 * Ouvre un artiste dont on n'a que le nom — le cas des classements, où une
 * écoute de streaming ne porte pas d'identifiant local.
 *
 * Sans correspondance exacte, on ouvre l'onglet Artistes plutôt qu'une fiche
 * arbitraire : l'auditeur voit qu'il doit chercher, au lieu de croire qu'il est
 * arrivé.
 */
export async function ouvrirArtisteParNom(nom: string): Promise<void> {
  if (!nom) return;
  try {
    const resultats = await api.searchLibrary(nom, 5);
    const id = trouverArtisteExact(resultats?.artists, nom);
    if (id !== null) {
      await ouvrirArtiste(id);
    } else {
      ouvrirBibliotheque('artists');
    }
  } catch (e) {
    console.error('Ouvrir artiste par nom:', e);
  }
}

/** Lecture seule de l'onglet courant — pratique pour les tests et les gardes. */
export function ongletCourant(): OngletBibliotheque {
  return get(libraryTab) as OngletBibliotheque;
}
