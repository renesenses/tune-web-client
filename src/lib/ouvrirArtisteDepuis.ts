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
    // #1494 — la PAGE COMMUNE, plus la fiche de la Bibliothèque : voir
    // `ouvrirFicheArtisteLocale` en bas de ce module.
    ouvrirFicheArtisteLocale(a.id, a.name ?? '', depuis);
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
  if (id !== null) {
    ouvrirFicheArtisteLocale(id, a.name, depuis);
    return;
  }
  vueDeRetour.set(depuis);
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

/** Un identifiant de service utilisable, ou `null` — voir la garde de #1178. */
function identifiantDeService(v: unknown): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (typeof v !== 'string') return null;
  return v.trim() ? v : null;
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
 *
 * 🔴 #1178 / serveur #3864 (JP Robbe, 18/09/2026) posait la même garde dans
 * `StreamingV2` avant que ce module n'existe. Elle est portée ici, sur trois
 * points que le test brut `!id` manquait :
 *
 * - **`id: 0`** est un identifiant valide et `!0` est vrai : la vignette
 *   « Identifiant zéro » partait chercher un artiste local au lieu d'ouvrir sa
 *   fiche de service ;
 * - un identifiant **blanc** (`'   '`) ou d'un **autre type** (un objet) n'est
 *   pas une route : `String(x)` en fabriquait une, morte ;
 * - un service **vide ou blanc** n'est pas un service.
 */
export function artisteDeService(ar: any, service: string | null | undefined): any | null {
  const id = identifiantDeService(ar?.source_id ?? ar?.id);
  const brutSrc = ar?.source ?? service;
  const src = typeof brutSrc === 'string' && brutSrc.trim() ? brutSrc : null;
  if (!ar?.name && !id) return null;
  if (!id || !src) return ar?.name ? { name: ar.name } : null;
  return { ...ar, source: src, source_id: id };
}

/**
 * Ouvrir la PAGE COMMUNE pour un artiste de la BIBLIOTHÈQUE — #1494.
 *
 * Bertrand, 23/09/2026 : « Écran Search : quand je clique sur l'artiste, je
 * veux ouvrir la vue artiste !! » — et, à « laquelle ? » : la page artiste
 * commune. Depuis #1485 (#1232, étapes 1 et 2), `ArtisteServiceV2` sait
 * montrer un artiste local : `service: null`, et `id` porte l'identifiant de
 * `/library/artists` en texte. Aucun clic n'y menait ; c'est ce que fait cette
 * fonction, et elle est le SEUL endroit qui pose cette forme.
 *
 * 🔴 LA BIFURCATION LOCAL / SERVICE VIT ICI, ET NULLE PART AILLEURS. Avant ce
 * lot, cinq écrans en recopiaient les deux branches à la main — `SearchV2`,
 * `AlbumDetailV2`, `PisteActions`, `MenuPisteV1`, `NowPlaying` — et faire
 * pointer la branche locale vers la page commune ici n'aurait changé que les
 * Favoris, « Vos tops » et la colonne Artiste : les quatre autres auraient
 * continué d'ouvrir l'ancienne fiche. Ils passent tous par
 * [`ouvrirArtisteDepuis`] désormais — `AlbumDetailV2` par #1489, qui le fait
 * au même moment —, et `vueArtisteUnique1494.test.ts` interdit toute nouvelle
 * recopie.
 *
 * UNE entrée d'historique par clic (#1142) : la page commune est une VUE, pas
 * un calque dans une vue — le changement de vue écrit son entrée, et il n'y a
 * plus de grille traversée ni de clé composée à tenir.
 *
 * La fiche de la Bibliothèque (`ArtistesV2`, `#library/artiste:<id>`) reste
 * en place pour l'instant : la retirer est hors tranche, à décider une fois
 * la page commune éprouvée depuis tous les points d'entrée.
 */
export function ouvrirFicheArtisteLocale(id: number | string, nom: string | null | undefined, depuis: View): void {
  vueDeRetour.set(depuis);
  ficheArtisteService.set({ service: null, id: String(id), nom: nom ?? '' });
  activeView.set('streamingartist');
}
