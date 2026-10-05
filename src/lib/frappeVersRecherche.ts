import { TOUCHES_RACCOURCIS } from './keyboard';

/**
 * #1872 — dans la Bibliothèque, taper au clavier écrit dans la recherche.
 *
 * Levente Toth, fil forum 2102 (01/10/2026) : « the keyboard could
 * automatically type in the search field, instead of click in the search
 * field and type after ». Le champ n'avait ni `autofocus` ni capture de
 * frappe : il fallait cliquer avant de taper.
 *
 * La règle, quand AUCUN champ n'a le focus :
 * - une frappe imprimable qui n'est pas un raccourci de lecture
 *   (`TOUCHES_RACCOURCIS` de `keyboard.ts`) donne le focus au champ et y
 *   ajoute le caractère ;
 * - « / » donne le focus sans rien insérer — c'est la porte d'entrée pour
 *   une recherche qui commence par une lettre réservée (« Pink Floyd »
 *   commence par P, piste précédente) ;
 * - Échap, dans le champ, rend le focus à l'élément qui l'avait avant.
 *
 * Les raccourcis gardent leur sens : Espace, S, N, P, M et les flèches ne
 * sont JAMAIS redirigés. Tab, Entrée et les touches de navigation ne sont
 * pas imprimables et passent donc intacts : la navigation au clavier et les
 * lecteurs d'écran (qui, en mode navigation, consomment eux-mêmes les
 * lettres avant la page) ne voient aucun changement.
 *
 * Aucun focus automatique à l'arrivée sur l'écran : sur tablette, il ferait
 * surgir le clavier virtuel à chaque ouverture.
 */
export type DecisionFrappe = 'inserer' | 'focus' | null;

/** Un élément qui reçoit lui-même la frappe : n'y touchons pas. */
export function estChampDeSaisie(el: EventTarget | null | undefined): boolean {
  const h = el as HTMLElement | null | undefined;
  if (!h || typeof h.tagName !== 'string') return false;
  const tag = h.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || h.isContentEditable === true;
}

/**
 * Les widgets qui ont leur propre lecture des lettres (saisie anticipée d'un
 * menu ou d'une liste), et les boîtes de dialogue : la frappe leur appartient.
 */
const WIDGETS_A_LETTRES = '[role="menu"], [role="menubar"], [role="listbox"], [role="combobox"], [role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog';

function dansUnWidgetALettres(el: EventTarget | null | undefined): boolean {
  const h = el as Element | null | undefined;
  return !!h && typeof h.closest === 'function' && h.closest(WIDGETS_A_LETTRES) !== null;
}

/** Que faire de cette frappe ? `null` : la laisser vivre sa vie. */
export function decisionFrappe(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'target' | 'defaultPrevented' | 'isComposing' | 'metaKey' | 'ctrlKey' | 'altKey'>
    & Partial<Pick<KeyboardEvent, 'getModifierState'>>,
  actif: Element | null = typeof document !== 'undefined' ? document.activeElement : null,
): DecisionFrappe {
  if (e.defaultPrevented || e.isComposing) return null;
  // Cmd/Ctrl/Alt + lettre est un raccourci du navigateur ou du système.
  // AltGr (Ctrl+Alt sous Windows/Linux) compose en revanche un caractère
  // ordinaire — « @ », « # » sur un clavier AZERTY : il doit s'écrire.
  if (e.metaKey) return null;
  const altGr = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph');
  if ((e.ctrlKey || e.altKey) && !altGr) return null;
  if (estChampDeSaisie(e.target) || estChampDeSaisie(actif)) return null;
  if (dansUnWidgetALettres(e.target) || dansUnWidgetALettres(actif)) return null;
  if (TOUCHES_RACCOURCIS.includes(e.code)) return null;
  if (e.key === '/') return 'focus';
  // Imprimable : UN caractère (« Enter », « Tab », « Dead » en ont plusieurs ;
  // le spread compte un emoji pour un).
  if (typeof e.key !== 'string' || [...e.key].length !== 1 || e.key.trim() === '') return null;
  return 'inserer';
}

export interface OptionsFrappe {
  /** Le champ de recherche, s'il est affiché. */
  champ: () => HTMLInputElement | null | undefined;
  /** Faux quand un calque (fiche d'album, édition, menu) recouvre l'écran. */
  disponible: () => boolean;
}

/**
 * Le gestionnaire `keydown` à poser sur `window` tant que la Bibliothèque
 * est montée. Il retourne la décision prise (utile aux bancs).
 */
export function gestionnaireFrappeVersRecherche(opts: OptionsFrappe) {
  let precedent: HTMLElement | null = null;

  return function surFrappe(e: KeyboardEvent): DecisionFrappe | 'rendu' {
    const champ = opts.champ();
    if (!champ || !champ.isConnected) return null;
    const actif = champ.ownerDocument.activeElement;

    if (e.key === 'Escape') {
      if (actif !== champ || e.defaultPrevented) return null;
      const cible = precedent;
      precedent = null;
      if (cible && cible.isConnected && cible !== champ) cible.focus();
      else champ.blur();
      return 'rendu';
    }

    if (!opts.disponible()) return null;
    const d = decisionFrappe(e, actif);
    if (!d) return null;

    e.preventDefault();
    precedent = actif instanceof HTMLElement && actif !== champ.ownerDocument.body ? actif : null;
    if (d === 'inserer') {
      champ.value += e.key;
      // `bind:value` de Svelte écoute `input` : sans cet événement, la
      // variable `q` ne saurait rien de la lettre et la grille ne filtrerait pas.
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    }
    champ.focus();
    const fin = champ.value.length;
    try { champ.setSelectionRange(fin, fin); } catch { /* type sans sélection */ }
    return d;
  };
}
