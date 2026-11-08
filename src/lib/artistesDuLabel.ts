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
import { activeView } from './stores/navigation';

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
 * D'où l'on vient quand on ouvre la page d'un label : le Retour de cette page
 * y ramène (fil 2705). Absent (Favoris, Recherche), il revient à la liste.
 */
export type OrigineLabel =
  | { genre: 'album'; id: number }
  | { genre: 'artiste'; id: number | string; nom: string };

/**
 * Ouvre la page du label dans la Bibliothèque — le chemin des Favoris et de
 * la Recherche (`tune:v2-facette`, écouté par `LibraryV2`).
 *
 * Depuis une fiche d'album de la Bibliothèque, c'est `LibraryV2` qui referme
 * la fiche (sur place, sans `history.back()` dont le `popstate` tardif
 * reposerait l'onglet Albums) : l'appelant ne la referme pas lui-même.
 */
export async function ouvrirLabelDansLaBibliotheque(nom: string, origine?: OrigineLabel): Promise<void> {
  const valeur = (nom ?? '').trim();
  if (!valeur) return;
  activeView.set('library');
  await tick();
  window.dispatchEvent(new CustomEvent('tune:v2-facette', {
    detail: origine ? { onglet: 'labels', valeur, retour: origine } : { onglet: 'labels', valeur },
  }));
}
