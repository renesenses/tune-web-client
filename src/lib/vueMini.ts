/**
 * La VUE MINI : le gabarit téléphone de la coquille, demandé par l'adresse.
 *
 * Bertrand, 31/10/2026 : le mini-lecteur de bureau doit être « juste la vue
 * restreinte de l'app », sur le modèle de la vue Android (maquette A
 * « télécommande », validée le même soir). L'écran Écouter occupe tout le
 * cadre ; une barre d'onglets est posée en bas ; la file et les zones s'ouvrent
 * en panneaux qui montent du bas ; hors de l'onglet Écouter, une mini-barre
 * de lecture reste au-dessus des onglets.
 *
 * ## Deux adresses, une seule vue
 *
 *   - `?vue=mini` est l'adresse nouvelle ;
 *   - `?mini=1` est celle que les widgets déjà installés chargent depuis
 *     la v0.9.64 (`navigate_unified` dans `tune-widget/src-tauri/src/main.rs`).
 *
 * 🔴 Depuis la phase 5 (19/09/2026, commit d5ed7debd), `?mini=1` n'était plus
 * lu par personne : `MiniPlayer.svelte` était parti avec l'ancienne coquille.
 * Le widget affichait donc l'interface COMPLÈTE dans une fenêtre de 380 px.
 * Lire les deux adresses ici répare ces widgets sans qu'ils soient mis à jour.
 *
 * ## Le widget et le navigateur
 *
 * `&hote=widget` dit que la page vit dans la fenêtre du mini-lecteur de
 * bureau. Les boutons natifs (épingle, replier, fenêtre complète) n'y sont
 * montrés QUE dans ce cas : ils naviguent vers `/__widget/<action>`, une
 * adresse que la fenêtre Tauri intercepte et n'ouvre jamais. Dans un
 * navigateur, la même adresse serait un 404 : on ne la propose donc pas.
 */
import { readable, writable } from 'svelte/store';
import type { View } from './stores/navigation';

/** La règle, isolée pour être éprouvée sans `window`. */
export function estVueMiniDans(search: string | null | undefined): boolean {
  const p = new URLSearchParams(search ?? '');
  return p.get('vue') === 'mini' || p.get('mini') === '1';
}

/** La page est-elle dans la fenêtre du widget de bureau ? */
export function estDansLeWidget(search: string | null | undefined): boolean {
  return estVueMiniDans(search) && new URLSearchParams(search ?? '').get('hote') === 'widget';
}

// `window.location` peut manquer là où `window` existe (un banc qui pose un
// `window` de fortune) : on retombe alors sur « pas de vue mini ».
function recherche(): string {
  return typeof window === 'undefined' ? '' : (window.location?.search ?? '');
}

/**
 * Relu à chaque appel — la coquille l'appelle une fois, à son montage. Elle
 * navigue par le fragment (`#vue`), jamais par la requête : `?vue=mini`
 * survit donc à toute la session et au rechargement.
 */
export function vueMiniActive(): boolean {
  return estVueMiniDans(recherche());
}
export function dansLeWidgetActif(): boolean {
  return estDansLeWidget(recherche());
}

/** Les quatre onglets qui mènent à un écran, plus « Plus » qui ouvre le menu. */
export type OngletMini = 'ecouter' | 'bibliotheque' | 'recherche' | 'favoris';

export const VUE_DE_L_ONGLET: Record<OngletMini, View> = {
  ecouter: 'nowplaying',
  bibliotheque: 'library',
  recherche: 'search',
  favoris: 'favorites',
};

/** L'onglet allumé pour une vue ; `null` = une vue atteinte par le menu. */
export function ongletDeLaVue(vue: View): OngletMini | null {
  for (const [onglet, v] of Object.entries(VUE_DE_L_ONGLET)) {
    if (v === vue) return onglet as OngletMini;
  }
  return null;
}

/** Le panneau ouvert par-dessus l'écran : la file, les zones, ou aucun. */
export type FeuilleMini = 'file' | 'zones';
export const feuilleMini = writable<FeuilleMini | null>(null);

/** Hauteur sous laquelle la fenêtre est « repliée » (maquette C, 360 × 140). */
export const SEUIL_REPLIE = 220;

export function estReplie(hauteur: number): boolean {
  return hauteur > 0 && hauteur < SEUIL_REPLIE;
}

/** Les gestes que la fenêtre du widget sait faire, et elle seule. */
export type ActionWidget = 'epingle' | 'replier' | 'deplier' | 'complet';

/** L'adresse qu'intercepte la fenêtre Tauri (`decider_navigation`). */
export function adresseAction(action: ActionWidget): string {
  return `/__widget/${action}`;
}

/** Demande un geste natif. Hors du widget, ne fait rien. */
export function actionWidget(action: ActionWidget): void {
  if (!dansLeWidgetActif() || typeof window === 'undefined') return;
  window.location.assign(adresseAction(action));
}

/**
 * La fenêtre est-elle repliée (maquette C) ? Lu sur la HAUTEUR de la fenêtre :
 * le widget la réduit à 140 px, la page suit d'elle-même. Même prudence que
 * `formatEcran` : un environnement sans `matchMedia` retombe sur `resize`.
 */
export const fenetreRepliee = readable<boolean>(
  typeof window === 'undefined' ? false : estReplie(window.innerHeight),
  (set) => {
    if (typeof window === 'undefined') return;
    const relire = () => set(estReplie(window.innerHeight));
    relire();
    if (typeof window.matchMedia !== 'function') {
      window.addEventListener('resize', relire);
      return () => window.removeEventListener('resize', relire);
    }
    const mq = window.matchMedia(`(max-height: ${SEUIL_REPLIE - 1}px)`);
    mq.addEventListener('change', relire);
    return () => mq.removeEventListener('change', relire);
  },
);

/**
 * Les filtres de l'écran courant, repliés en vue mini (Bertrand, 01/11/2026 :
 * six familles de filtres avant le premier album). Le bouton « Filtres » du
 * bandeau les ouvre en panneau du bas ; changer de vue les referme.
 */
export const filtresOuverts = writable(false);

/** Combien de filtres sont actifs dans un bloc `.filters` (hors « Tout »). */
export function filtresActifs(bloc: Element | null | undefined): number {
  if (!bloc) return 0;
  return bloc.querySelectorAll('.active:not(.count), [aria-pressed="true"]:not(.count)').length;
}
