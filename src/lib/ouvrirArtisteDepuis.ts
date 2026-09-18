/**
 * Ouvrir la fiche d'un artiste depuis un écran v2 — point 9 d'Yves Corbat
 * (17/09/2026) : « écran favoris, clic sur un artiste ne fait rien ».
 *
 * Deux défauts sous le même clic :
 * - un artiste de SERVICE posait `ficheArtisteService` sans jamais changer de
 *   vue — rien ne bougeait ;
 * - un artiste LOCAL passait par `libraryNavigation.ouvrirArtiste`, la
 *   navigation de l'ancienne coquille (`selectedArtist`), que `LibraryV2`
 *   n'écoute pas : on tombait sur la grille, pas sur la fiche.
 *
 * Même chemin que la Recherche (`SearchV2.ouvrirArtiste`) : `pendingLibraryArtist`
 * pour la bibliothèque, `streamingartist` pour un service, et `vueDeRetour`
 * pour que la fiche referme vers l'écran d'où l'on vient (#3824).
 */
import * as api from './api';
import { activeView, pendingLibraryArtist, vueDeRetour, type View } from './stores/navigation';
import { ficheArtisteService } from './stores/streaming';
import { trouverArtisteExact } from './libraryNavigation';
import { estDeBibliotheque } from './provenanceBibliotheque';
import type { Source } from './types';

export async function ouvrirArtisteDepuis(a: any, depuis: View): Promise<void> {
  if (!a) return;
  if (a.id != null && estDeBibliotheque(a)) {
    vueDeRetour.set(depuis);
    pendingLibraryArtist.set(a.id);
    activeView.set('library');
    return;
  }
  if (a.source && a.source_id) {
    vueDeRetour.set(depuis);
    ficheArtisteService.set({ service: a.source as Source, id: String(a.source_id), nom: a.name ?? '' });
    activeView.set('streamingartist');
    return;
  }
  if (!a.name) return;
  // Un nom seul : la fiche locale s'il y a une correspondance EXACTE, sinon
  // l'onglet Artistes — jamais un approchant.
  let id: number | null = null;
  try {
    id = trouverArtisteExact((await api.searchLibrary(a.name, 5))?.artists, a.name);
  } catch { /* repli ci-dessous */ }
  vueDeRetour.set(depuis);
  if (id !== null) pendingLibraryArtist.set(id);
  activeView.set('library');
}

/**
 * L'artiste d'une PISTE, prêt pour [`ouvrirArtisteDepuis`] — ou `null`.
 *
 * #1193 — FabienM, fil 1839, point 8 : « quand on est sur la page d'une
 * playlist avec les titres présentés en tableau, il faut que la colonne
 * Artiste soit cliquable et renvoie à la page de l'artiste ».
 *
 * Trois cas, et un seul geste :
 * - piste **locale** : `artist_id` est un identifiant de bibliothèque ;
 * - piste de **service** : `artist_id` est l'identifiant chez le service, et
 *   c'est `source` qui le dit — le confondre avec un id local ouvrirait un
 *   artiste au hasard ;
 * - **ni l'un ni l'autre** : il reste le nom, et la recherche EXACTE.
 *
 * `null` quand la piste ne porte même pas de nom d'artiste : la colonne reste
 * alors un texte, pas un bouton mort.
 */
export function artisteDePiste(p: any): any | null {
  const nom = p?.artist_name ?? null;
  const id = p?.artist_id ?? null;
  const src = p?.source ?? null;
  const estBibliotheque = !src || src === 'local' || src === 'upnp';
  if (id != null && estBibliotheque) return { id, name: nom, source: src ?? 'local' };
  if (id != null && src) return { name: nom, source: src, source_id: String(id) };
  return nom ? { name: nom } : null;
}

/**
 * Un artiste de SERVICE tel que les écrans le reçoivent, ramené à la forme que
 * [`ouvrirArtisteDepuis`] attend.
 *
 * #1194 — FabienM, fil 1839, point 9 : « les vignettes d'artiste ne sont pas
 * cliquables » dans Streaming ▸ Qobuz ▸ Favoris ▸ Artistes. Deux raisons de
 * ne pas appeler l'ouverture directement avec l'objet reçu :
 *
 * - **l'identifiant change de nom selon la route** : la recherche d'un service
 *   rend `id`, les favoris rendent `source_id` (mesuré sur le .18 le
 *   07/09/2026, d'où la même précaution sur le cœur de la vignette) ;
 * - **la source peut manquer** sur l'objet : un favori de la page Qobuz ne
 *   répète pas toujours son service, que l'écran connaît par ailleurs.
 *
 * Rend `null` quand il manque de quoi ouvrir quoi que ce soit — mieux vaut un
 * geste absent qu'un geste qui échoue.
 */
export function artisteDeService(ar: any, service: string | null | undefined): any | null {
  const id = ar?.source_id ?? ar?.id;
  const src = ar?.source ?? service;
  if (!ar?.name && !id) return null;
  if (!id || !src) return ar?.name ? { name: ar.name } : null;
  return { ...ar, source: src, source_id: String(id) };
}
