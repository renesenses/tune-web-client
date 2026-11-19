/**
 * web#3258 (Rob, VIP, réunion du 18/11 ; go de Bertrand le 19/11) — la
 * sélection MULTIPLE d'albums dans les vues albums de la Bibliothèque.
 *
 * Les règles du geste, pures et testables hors de l'écran :
 * - un clic coche ou décoche UN album et devient l'ancre ;
 * - Maj+clic coche toute la PLAGE entre l'ancre et l'album cliqué, dans
 *   l'ordre affiché (pas l'ordre des identifiants) ;
 * - « Tout sélectionner » prend la vue filtrée entière.
 *
 * Toujours un nouvel ensemble, jamais une mutation : `$state` suit la
 * référence, et un `add` sur place ne repeindrait ni les cases ni le compteur.
 */

export interface SelectionAlbums {
  /** Les identifiants cochés. */
  ids: ReadonlySet<number>;
  /** Le dernier album cliqué sans Maj : l'origine de la prochaine plage. */
  ancre: number | null;
}

export const SELECTION_VIDE: SelectionAlbums = { ids: new Set(), ancre: null };

/**
 * Un clic sur l'album `id`. `ordre` : les identifiants de la vue, dans l'ordre
 * affiché. Avec `plage` (Maj enfoncée) et une ancre présente dans la vue, toute
 * la plage est COCHÉE (le geste des gestionnaires de fichiers) ; sinon l'album
 * bascule seul.
 */
export function cliquerAlbum(
  sel: SelectionAlbums,
  id: number,
  ordre: readonly number[],
  plage = false,
): SelectionAlbums {
  if (plage && sel.ancre != null) {
    const de = ordre.indexOf(sel.ancre);
    const a = ordre.indexOf(id);
    if (de >= 0 && a >= 0) {
      const [lo, hi] = de <= a ? [de, a] : [a, de];
      const ids = new Set(sel.ids);
      for (const x of ordre.slice(lo, hi + 1)) ids.add(x);
      // L'ancre ne bouge pas : un second Maj+clic redessine depuis elle.
      return { ids, ancre: sel.ancre };
    }
  }
  const ids = new Set(sel.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ids, ancre: id };
}

/** Toute la vue filtrée, en plus de ce qui était déjà coché. */
export function toutSelectionner(sel: SelectionAlbums, ordre: readonly number[]): SelectionAlbums {
  return { ids: new Set([...sel.ids, ...ordre]), ancre: sel.ancre };
}

/**
 * Les identifiants cochés, dans l'ORDRE AFFICHÉ — l'ordre dans lequel les
 * albums partent en file ou en playlist. Ceux qui ne sont plus dans la vue
 * (filtre changé après coup) restent sélectionnés et suivent, dans l'ordre où
 * ils ont été cochés.
 */
export function idsDansLOrdre(sel: SelectionAlbums, ordre: readonly number[]): number[] {
  const vus = ordre.filter((x) => sel.ids.has(x));
  const dedans = new Set(vus);
  return [...vus, ...[...sel.ids].filter((x) => !dedans.has(x))];
}

/** Les identifiants sélectionnables d'une liste d'albums : les albums de la
 *  bibliothèque (un favori de service n'a pas d'`id` local). */
export function idsSelectionnables(liste: ReadonlyArray<{ id?: number | null } | null | undefined>): number[] {
  const ids: number[] = [];
  for (const a of liste) if (a && Number.isInteger(a.id)) ids.push(a.id as number);
  return ids;
}

/** Les albums cochés qui ne sont plus dans la vue (filtre, recherche ou
 *  facette changés après coup) : ils restent sélectionnés (décision de
 *  Bertrand, relecture du 19/11) et le compteur les nomme. */
export function horsDeLaVue(sel: SelectionAlbums, ordre: readonly number[]): number {
  if (!sel.ids.size) return 0;
  const vue = new Set(ordre);
  let n = 0;
  for (const id of sel.ids) if (!vue.has(id)) n++;
  return n;
}

/** Ce qu'Échap doit faire au mode sélection. */
export type GesteEchap = 'rien' | 'panneau' | 'quitter';

/** Une fenêtre ou un dialogue est-il ouvert (au-dessus de la Bibliothèque) ? */
// `[role="menu"]` : un menu « … » d'album ouvert (`MenuObjetV2`) se ferme à
// Échap par son propre écouteur, posé APRÈS celui de l'écran — sans cette
// ligne, le même Échap refermait le menu ET quittait le mode.
const SELECTEUR_FENETRE = '.modal-backdrop, [aria-modal="true"], [role="dialog"], [role="alertdialog"], [role="menu"], dialog[open]';

function champDeSaisie(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * web#3258 (relecture du 19/11) — Échap ne quitte le mode sélection que s'il
 * n'y a RIEN d'autre à fermer :
 * - un autre écouteur l'a déjà consommé (`defaultPrevented`) ;
 * - une confirmation attend (`dialogs`), une fenêtre ou un menu est ouvert
 *   (« Ajouter à une playlist » ferme la sienne sans `preventDefault`) —
 *   Échap est pour eux ;
 * - un panneau de la barre est ouvert : Échap le ferme, lui seulement ;
 * - le focus est dans un champ de saisie (la recherche) : Échap y reste.
 */
export function gesteEchap(
  e: KeyboardEvent,
  etat: { panneauOuvert: boolean; dialoguesEnAttente: number },
  doc: Document = document,
): GesteEchap {
  if (e.defaultPrevented || etat.dialoguesEnAttente > 0) return 'rien';
  const cible = e.target instanceof Element ? e.target : null;
  if (cible?.closest(SELECTEUR_FENETRE) || doc.querySelector(SELECTEUR_FENETRE)) return 'rien';
  if (etat.panneauOuvert) return 'panneau';
  if (champDeSaisie(cible) || champDeSaisie(doc.activeElement)) return 'rien';
  return 'quitter';
}
