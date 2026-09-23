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
import { get } from 'svelte/store';
import {
  activeView,
  pendingLibraryArtist,
  pendingSearchQuery,
  vueDeRetour,
  type View,
} from './stores/navigation';
import { ficheArtisteService } from './stores/streaming';
import { trouverArtisteExact } from './libraryNavigation';
import { estDeBibliotheque } from './provenanceBibliotheque';
import { cleServeur } from './ongletsStreaming';
import { messageRepli, resoudreArtisteDeService, type ChercherArtistes } from './repliArtisteService';
import { notifications } from './stores/notifications';
import { setSearchCriteria } from './stores/shortcuts';
import { t } from './i18n';
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
 * Ouvrir la fiche d'un artiste de SERVICE, par identifiant ou par nom.
 *
 * ── D'où ça vient ─────────────────────────────────────────────────────────
 *
 * Cette résolution vivait DANS `ShellV2` (`ouvrirArtisteServiceParNom`), armée
 * dans `gestesNavigationService`. Elle en sort pour deux raisons, toutes deux
 * mesurées sur #1486 :
 *
 *  1. **Elle n'était pas exécutable par une garde.** Un témoin ne pouvait que
 *     lire le texte de la coquille, et un texte présent ne prouve pas qu'il
 *     s'exécute — le motif que `repliArtisteService` documente déjà. Ici la
 *     recherche est INJECTABLE : la garde la fournit et lit le service
 *     réellement interrogé.
 *  2. **Elle laissait sortir une clé d'ONGLET.** Voir juste en dessous.
 *
 * ── 🔴 `__bandcamp__` N'EST PAS UN SERVICE — #1486 ────────────────────────
 *
 * FabienM, 23/09/2026 : « Lien artiste sur un album de Qobuz ou Bandcamp ne
 * renvoie pas sur la page artiste ». La fiche d'un album Bandcamp porte
 * `source: '__bandcamp__'` — `BANDCAMP_EXT`, la clé de l'ONGLET, locale au
 * client. Elle partait telle quelle dans la recherche fédérée. Mesuré sur le
 * .18 le 23/09/2026, les deux requêtes côte à côte :
 *
 *     GET /search?q=Agnes Obel&limit=3&sources=bandcamp
 *       → services.bandcamp.artists[0] = {"id":"https://agnesobel.bandcamp.com",
 *                                         "name":"Agnes Obel"}
 *     GET /search?q=Agnes Obel&limit=3&sources=__bandcamp__
 *       → services: {}                                        ← RIEN
 *
 * Le service ne rendait aucun artiste, et on retombait sur le repli. Et la
 * fiche, elle, s'ouvre bien une fois la clé traduite :
 *
 *     GET /streaming/bandcamp/artists/https%3A%2F%2Fagnesobel.bandcamp.com
 *       → {"id":"https://agnesobel.bandcamp.com","name":""}          (200)
 *
 * `cleServeur` porte cette traduction depuis #1138 ; il ne manquait qu'à
 * l'appeler, ici, au seul endroit où la clé quitte le client.
 *
 * ── `depuis` ──────────────────────────────────────────────────────────────
 *
 * La coquille posait `vueDeRetour` sur `'nowplaying'`, EN DUR : le Retour de
 * la fiche artiste ramenait à « Lecture en cours » même quand on venait de
 * l'éditorial Qobuz. Même contrat que [`ouvrirArtisteDepuis`] au-dessus —
 * l'émetteur dit d'où il part, la fiche le lit (#3824).
 */
export async function ouvrirArtisteDeServiceParNom(
  cible: { service: string; nom: string; id?: string | null },
  depuis: View,
  options: { chercher?: ChercherArtistes } = {},
): Promise<void> {
  // La clé du SERVEUR, jamais celle de l'onglet — voir l'en-tête.
  const service = cleServeur(cible?.service);
  if (!service) return;
  const c = { service, nom: cible?.nom ?? '' };

  // #956 — l'identifiant du service est déjà là (album ou piste servis par le
  // service) : on ouvre la fiche sans rien deviner.
  if (cible?.id != null && String(cible.id).trim() !== '') {
    vueDeRetour.set(depuis);
    ficheArtisteService.set({ service: service as Source, id: String(cible.id).trim(), nom: c.nom });
    activeView.set('streamingartist');
    return;
  }

  const chercher: ChercherArtistes =
    options.chercher ??
    (async (nom, svc) => {
      const r = await api.federatedSearch(nom, [svc], 5);
      return r?.services?.[svc]?.artists ?? [];
    });

  const issue = await resoudreArtisteDeService(c, chercher);
  if (issue.type === 'repli') {
    /**
     * 🔴 #956 — LE REPLI PARLE. Sandro, fil 1769 : « l'interface tourne en
     * boucle et me renvoie simplement sur la grille des résultats de recherche
     * du début ». Le geste est le bon — un écran vide serait pire que la
     * recherche qu'il remplace — mais il était MUET, et un retour silencieux
     * au point de départ se lit comme une panne.
     *
     * `injoignable` garde sa trace : c'est la seule branche qui peut produire
     * son symptôme sans qu'aucune mesure ne l'explique.
     */
    if (issue.raison === 'injoignable') {
      console.warn('[artiste de service] la recherche a levé', service, c.nom, issue.erreur);
    }
    notifications.info(messageRepli(issue.raison, c, get(t)));
    setSearchCriteria({ q: c.nom, source: service });
    pendingSearchQuery.set(c.nom);
    activeView.set('search');
    return;
  }
  vueDeRetour.set(depuis);
  ficheArtisteService.set({ service: service as Source, id: issue.id, nom: c.nom });
  activeView.set('streamingartist');
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
