/**
 * tune-server-rust#6782 — découvrir les artistes du même label.
 *
 * Sur la page d'un label (Bibliothèque › Labels › un label) : les artistes
 * de la bibliothèque qui ont un album sous ce label, puis « À découvrir » —
 * les artistes du catalogue Qobuz du label qui ne sont pas dans la
 * bibliothèque (`GET /library/labels/{nom}/artists`). Depuis la fiche d'un
 * album ou d'un artiste : un lien « Autres artistes du label X ».
 */
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { activeView } from './stores/navigation';
import { apresLeRetourProgrammatique } from './historiqueNavigation';

/** Le label d'un album, espaces de bord retirés ; `null` sans label. */
export function labelDe(a: { label?: string | null } | null | undefined): string | null {
  const l = a?.label?.trim();
  return l ? l : null;
}

/**
 * Le label PRINCIPAL d'un artiste : celui qui porte le plus de ses albums.
 * À égalité, le premier rencontré (l'ordre de sa discographie). `null` si
 * aucun album n'a de label.
 */
export function labelPrincipal(albums: readonly ({ label?: string | null } | null | undefined)[]): string | null {
  const comptes = new Map<string, number>();
  for (const a of albums) {
    const l = labelDe(a);
    if (l) comptes.set(l, (comptes.get(l) ?? 0) + 1);
  }
  let meilleur: string | null = null;
  let n = 0;
  for (const [l, c] of comptes) {
    if (c > n) {
      meilleur = l;
      n = c;
    }
  }
  return meilleur;
}

/**
 * Ouvre la page du label dans la Bibliothèque — le chemin des Favoris et de
 * la Recherche (`tune:v2-facette`, écouté par `LibraryV2`).
 */
export async function ouvrirLabelDansLaBibliotheque(nom: string): Promise<void> {
  return ouvrirFacetteDansLaBibliotheque('labels', nom);
}

/**
 * web#2770 — le même chemin pour TOUTE facette de la Bibliothèque (genre,
 * label, année) : la vue d'abord, puis l'événement que `LibraryV2` écoute une
 * fois monté. Sans le `tick()`, l'événement partirait avant l'écouteur.
 */
export async function ouvrirFacetteDansLaBibliotheque(onglet: 'genres' | 'labels' | 'years', nom: string): Promise<void> {
  const valeur = nom.trim();
  if (!valeur) return;
  // tune-server-rust#8145 — la fiche d'album de la Bibliothèque se referme
  // EN RECULANT (`history.back()`) juste avant cet appel. Le `popstate` qui
  // suit repose l'onglet de l'entrée atteinte (Albums) : posé avant lui,
  // l'onglet Labels était aussitôt défait — « il ne se passe rien ».
  await apresLeRetourProgrammatique();
  // La vue d'où l'on vient : le Retour de la page du label y ramène (#8145,
  // second point), au lieu de la liste des labels.
  const depuis = get(activeView);
  activeView.set('library');
  await tick();
  window.dispatchEvent(
    new CustomEvent('tune:v2-facette', {
      detail: { onglet, valeur, ...(depuis !== 'library' ? { depuis } : {}) },
    }),
  );
}
