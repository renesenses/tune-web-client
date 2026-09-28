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
  commencerFicheAlbum,
  poserPistesAlbum,
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
  nom: string | null | undefined,
): number | null {
  if (!nom || !artistes) return null;
  const cible = nom.toLowerCase();
  const trouve = artistes.find((a) => (a?.name ?? '').toLowerCase() === cible);
  return typeof trouve?.id === 'number' ? trouve.id : null;
}

/**
 * 🔴 COMBIEN DE RÉSULTATS DEMANDER POUR RETROUVER UN ARTISTE PAR SON NOM — #1696.
 *
 * Daniel LEVY, fil 2005, 27/09/2026, widget « Artistes les plus écoutés » :
 * « le clique sur un portrait renvoie a la page bibliothèque, dernier index
 * sélectionné ». Le classement ne porte QUE le nom de l'artiste
 * (`TopArtistEntry`, serveur `history_repo.rs:1419` : `artist_name`, `plays`,
 * `listening_ms`, `cover_path` — aucun identifiant) : le clic doit le
 * retrouver dans la bibliothèque, et sans correspondance EXACTE il retombait
 * sur `activeView.set('library')`, sans cible — la Bibliothèque se rouvre
 * alors dans son dernier état, très exactement le symptôme décrit.
 *
 * On demandait CINQ résultats, et c'est la première cause. MESURÉ le
 * 28/09/2026 sur le .18 (`GET /library/search`), les cinquante artistes du
 * classement sur 30 jours, un par un :
 *
 *     'Air'   limit=5  → 5 artistes, AUCUN exact
 *                        (Airto Moreira, Des Airs, Chairmen of the Board,
 *                         Fred Astaire, Jefferson Airplane)
 *     'Air'   limit=50 → 17 artistes, exact TROUVÉ : id 3671
 *
 * L'exemple de l'en-tête de `trouverArtisteExact` — « chercher Air ramène
 * Airbourne, Air France… » — était donc plus qu'une illustration : les
 * approchants OCCUPAIENT la fenêtre et cachaient l'entrée cherchée. Cinquante
 * est la valeur par défaut de `api.searchLibrary`, et au-delà la réponse ne
 * grossit plus (17 à 50 comme à 100).
 *
 * Ce n'est pas un assouplissement : la correspondance reste EXACTE. On élargit
 * la FENÊTRE de lecture, pas le critère.
 */
export const ARTISTES_A_LIRE = 50;

/**
 * Les noms sous lesquels chercher un artiste de classement, du plus fidèle au
 * moins — #1696, deuxième cause.
 *
 * `listen_history.artist_name` est l'artiste de la PISTE écoutée, pas celui
 * d'une fiche de `artists`. MESURÉ le 28/09/2026 sur le .18, sur les mêmes
 * cinquante artistes :
 *
 *     'Daft Punk feat. Pharrell Williams' → 0 artiste, à 5 comme à 100
 *     'Daft Punk'                        → exact TROUVÉ : id 3399
 *
 * La tête, avant le marqueur d'invité, EST l'artiste principal de la piste. On
 * la cherche donc en second, et toujours par égalité EXACTE — jamais un
 * approchant.
 *
 * 🔴 SEULEMENT `feat.` / `ft.` / `featuring`, ET RIEN D'AUTRE. Les deux
 * séparateurs qu'on aurait envie d'ajouter sont des pièges, et les mêmes
 * cinquante artistes les portent tous les deux :
 *
 * - `&` — « Daryl Hall & John Oates », « Polo & Pan » sont des noms de groupe,
 *   entiers dans la bibliothèque ; les couper chercherait « Daryl Hall » ;
 * - ` with ` — « Diving With Andy » est un nom de groupe, pas une invitation.
 *
 * Le marqueur doit être un MOT isolé : sans la limite de mot, « Software » ou
 * un artiste dont le nom finit par « ft » se ferait couper.
 */
export function nomsDeRechercheArtiste(nom: string | null | undefined): string[] {
  const entier = (nom ?? '').trim();
  if (!entier) return [];
  const tete = entier.split(/\s[([]?(?:feat|ft|featuring)\.?\s/i)[0]?.trim() ?? '';
  return tete && tete.toLowerCase() !== entier.toLowerCase() ? [entier, tete] : [entier];
}

/**
 * Ouvre la fiche d'un album, pistes comprises.
 *
 * Huitième écrivain d'`albumTracks` (#3178) : les classements de l'Accueil, du
 * Tableau de bord et des recommandations passent tous par ici. Sans la clé, la
 * fiche s'ouvrirait avec une liste VIDE, puisque l'écran ne rend les pistes que
 * si `albumTracksOwner` désigne l'album affiché.
 */
export async function ouvrirAlbum(albumId: number): Promise<void> {
  selectedArtist.set(null);
  libraryLoading.set(true);
  const id = commencerFicheAlbum(albumId);
  try {
    const [album, tracks] = await Promise.all([
      api.getAlbum(albumId),
      api.getAlbumTracks(albumId),
    ]);
    selectedAlbum.set(album);
    poserPistesAlbum(id, tracks);
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
export async function ouvrirArtisteParNom(nom: string | null | undefined): Promise<void> {
  // `string | null` et non `string` : les classements viennent de l'historique,
  // où une écoute de streaming peut n'avoir aucun nom d'artiste. La garde
  // existait déjà — c'est la signature qui ne le disait pas, et l'appelant
  // devait mentir au compilateur pour passer.
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
