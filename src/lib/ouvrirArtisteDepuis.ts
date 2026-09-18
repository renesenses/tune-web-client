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
