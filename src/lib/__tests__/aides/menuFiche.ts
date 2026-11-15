/**
 * web#2736 — les gestes d'en-tête des fiches album, playlist et collection
 * vivent désormais dans un menu (« … », la flèche du bouton Lecture, « Trier ▾ »,
 * « + Nouvelle »). Les témoins qui cliquaient un bouton d'en-tête OUVRENT
 * d'abord le menu, puis cherchent l'entrée — par le même `data-*` ou le même
 * libellé qu'avant. Une entrée absente referme le menu et rend `null` : un
 * témoin d'absence garde son sens.
 *
 * Le menu est PORTÉ à la racine du document (`MenuPisteV2`, `use:portail`).
 */
import { flushSync } from 'svelte';

/** Le bouton « … » de la fiche album, de la fiche playlist, de la collection ouverte. */
export const MENU_PLUS = '[data-menu-album], [data-menu-playlist], [data-menu-collection]';
/** La flèche ▾ du bouton Lecture scindé. */
export const MENU_LECTURE = '[data-lecture-options]';

export const menuOuvert = (): HTMLElement | null =>
  document.body.querySelector<HTMLElement>('.menu[role="menu"]');

/** Referme le menu ouvert par son fond, comme un clic à côté. */
export function fermerMenu(): void {
  const m = menuOuvert();
  if (!m) return;
  (m.parentElement as HTMLElement | null)?.click();
  flushSync();
}

/** Ouvre le menu de `declencheur` dans `racine` et le rend (null : pas de bouton). */
export function ouvrirMenu(racine: ParentNode, declencheur: string = MENU_PLUS): HTMLElement | null {
  fermerMenu();
  const b = racine.querySelector<HTMLElement>(declencheur);
  if (!b) return null;
  b.click();
  flushSync();
  return menuOuvert();
}

/** Toutes les entrées du menu, ouvert pour l'occasion. */
export function entreesDuMenu(racine: ParentNode, declencheur: string = MENU_PLUS): HTMLElement[] {
  const m = ouvrirMenu(racine, declencheur);
  return m ? Array.from(m.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')) : [];
}

/** L'entrée qui répond à `selecteur`, le menu laissé OUVERT ; absente, il se referme. */
export function entreeDuMenu(racine: ParentNode, selecteur: string, declencheur: string = MENU_PLUS): HTMLElement | null {
  const m = ouvrirMenu(racine, declencheur);
  const e = m?.querySelector<HTMLElement>(selecteur) ?? null;
  if (!e) fermerMenu();
  return e;
}

/** L'entrée dont le libellé est `libelle` (ou le contient, `contient`). */
export function entreeParLibelle(
  racine: ParentNode, libelle: string, declencheur: string = MENU_PLUS, contient = false,
): HTMLElement | null {
  const e = entreesDuMenu(racine, declencheur).find((x) => {
    const texte = x.textContent?.trim() ?? '';
    return contient ? texte.includes(libelle) : texte === libelle;
  }) ?? null;
  if (!e) fermerMenu();
  return e;
}
