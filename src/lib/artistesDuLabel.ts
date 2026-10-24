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
 * Ouvre la page du label dans la Bibliothèque — le chemin des Favoris et de
 * la Recherche (`tune:v2-facette`, écouté par `LibraryV2`).
 */
export async function ouvrirLabelDansLaBibliotheque(nom: string): Promise<void> {
  const valeur = nom.trim();
  if (!valeur) return;
  activeView.set('library');
  await tick();
  window.dispatchEvent(new CustomEvent('tune:v2-facette', { detail: { onglet: 'labels', valeur } }));
}
