/**
 * Harmonisation rc14 — la barre de la Bibliothèque à sept commandes. La
 * bascule d'affichage (`.viewtog`), le curseur de taille, A–Z / Années et les
 * puces Source / Qualité vivent désormais dans des PANNEAUX (« Affichage »,
 * « Filtres »). Ces aides ouvrent le panneau, agissent, et le referment, pour
 * que les bancs gardent leur sens sans réécrire chacun ce parcours.
 */
import { flushSync } from 'svelte';

const clic = (b: Element | null | undefined) => {
  if (!b) throw new Error('commande introuvable dans la barre de la Bibliothèque');
  (b as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  flushSync();
};

/** Le bouton « Affichage » : il porte le mode courant (`data-vue`). */
export function boutonAffichage(el: ParentNode): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>('button[data-vue-ouvrir]');
}

/** Le mode d'affichage courant, lu sur le bouton. */
export function modeAffiche(el: ParentNode): string | undefined {
  return boutonAffichage(el)?.dataset.vue;
}

function avecPanneau<T>(el: ParentNode, ouvrir: string, panneau: string, f: () => T): T {
  const deja = el.querySelector(panneau) != null;
  if (!deja) clic(el.querySelector(ouvrir));
  try { return f(); } finally {
    if (el.querySelector(panneau)) clic(el.querySelector(ouvrir));
  }
}

/** Les mises en page offertes, dans l'ordre du panneau. */
export function modesOfferts(el: ParentNode): string[] {
  if (!boutonAffichage(el)) return [];
  return avecPanneau(el, 'button[data-vue-ouvrir]', '.panneau-vue', () =>
    [...el.querySelectorAll<HTMLElement>('[data-vue-choix]')].map((b) => b.dataset.vueChoix ?? ''));
}

/** Choisit une mise en page dans « Affichage ». */
export function choisirAffichage(el: ParentNode, mode: string): void {
  avecPanneau(el, 'button[data-vue-ouvrir]', '.panneau-vue', () =>
    clic(el.querySelector(`[data-vue-choix="${mode}"]`)));
}

/** L'ancienne bascule : passe au mode SUIVANT parmi ceux offerts. */
export function modeSuivant(el: ParentNode): void {
  const modes = modesOfferts(el);
  const i = modes.indexOf(modeAffiche(el) ?? '');
  choisirAffichage(el, modes[(i + 1) % modes.length]);
}

/** Le curseur de taille des pochettes, dans « Affichage » (panneau laissé OUVERT). */
export function curseurTaille(el: ParentNode): HTMLInputElement | null {
  if (!el.querySelector('.panneau-vue')) {
    const b = boutonAffichage(el);
    if (!b) return null;
    clic(b);
  }
  return el.querySelector<HTMLInputElement>('input[data-taille-pochettes]');
}

/** A–Z ou Années : le segment du panneau « Affichage » (ou de la ligne des années). */
export function choisirNavigation(el: ParentNode, nav: 'alpha' | 'years'): void {
  const direct = el.querySelector(`[data-ligne-annees] [data-nav="${nav}"]`);
  if (direct) { clic(direct); return; }
  avecPanneau(el, 'button[data-vue-ouvrir]', '.panneau-vue', () => clic(el.querySelector(`.panneau-vue [data-nav="${nav}"]`)));
}

/** Ouvre le panneau « Filtres » (il reste ouvert : les bascules ne le ferment pas). */
export function ouvrirFiltres(el: ParentNode): HTMLElement {
  if (!el.querySelector('[data-panneau-filtres] .panneau')) clic(el.querySelector('button[data-filtres-ouvrir]'));
  const p = el.querySelector<HTMLElement>('[data-panneau-filtres] .panneau');
  if (!p) throw new Error('le panneau « Filtres » ne s’ouvre pas');
  return p;
}

/** Referme le panneau « Filtres » s'il est ouvert. */
export function fermerFiltres(el: ParentNode): void {
  if (el.querySelector('[data-panneau-filtres] .panneau')) clic(el.querySelector('button[data-filtres-ouvrir]'));
}

/** Choisit une source dans « Filtres » (`null` : toutes les sources). */
export function choisirSource(el: ParentNode, cle: string | null): void {
  const p = ouvrirFiltres(el);
  const b = cle == null
    ? p.querySelector('[data-puce="provenance"] .pastille:not([data-provenance])')
    : p.querySelector(`[data-provenance="${cle}"]`);
  clic(b);
  fermerFiltres(el);
}

/** Les sources proposées par « Filtres » : libellés visibles, sans les comptes. */
export function sourcesProposees(el: ParentNode): string[] {
  const p = ouvrirFiltres(el);
  const l = [...p.querySelectorAll<HTMLElement>('[data-puce="provenance"] .pastille')]
    .map((b) => (b.firstChild?.textContent ?? b.textContent ?? '').trim());
  fermerFiltres(el);
  return l;
}

/** Le choix de l'année retenue : « Année : … », liste avec les comptes. */
export function choisirAnneeRetenue(el: ParentNode, mode: 'auto' | 'edition' | 'origine'): void {
  clic(el.querySelector('[data-annee-retenue] button'));
  clic(el.querySelector(`[data-mode-annee="${mode}"]`));
}
