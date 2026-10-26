/**
 * tune-web-client#2417 — ce qu'un écran DOIT montrer d'un refus du serveur :
 * sa phrase traduite, visible ; le motif brut du serveur, présent mais
 * seulement dans un « Détails » REPLIÉ (`DetailsServeur.svelte`) ; et ce
 * motif nulle part ailleurs à l'écran.
 *
 * Aide partagée par les bancs des écrans qui affichent l'erreur dans la page.
 */
import { expect } from 'vitest';

/** Le texte d'un nœud, sans celui des « Détails » qu'il contient. */
export function texteHorsReplis(racine: Element): string {
  const copie = racine.cloneNode(true) as Element;
  for (const d of Array.from(copie.querySelectorAll('[data-details-serveur]'))) d.remove();
  return copie.textContent ?? '';
}

/**
 * `racine` : l'écran (ou la région) ; `phrase` : le texte traduit attendu,
 * visible ; `motif` : le texte brut du serveur.
 */
export function attendreDetailsReplie(racine: Element, phrase: string, motif: string): void {
  const visible = texteHorsReplis(racine);
  expect(visible, 'la phrase traduite n’est pas affichée').toContain(phrase);
  expect(visible, '#2417 : texte brut du serveur hors du « Détails » replié').not.toContain(motif);
  const replis = Array.from(racine.querySelectorAll<HTMLDetailsElement>('[data-details-serveur]'));
  const repli = replis.find((d) => (d.textContent ?? '').includes(motif));
  expect(repli, `le motif du serveur est perdu : aucun « Détails » ne contient « ${motif} »`).toBeTruthy();
  expect(repli!.open, 'le « Détails » doit être replié').toBe(false);
}
