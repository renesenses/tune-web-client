import { tick } from 'svelte';

export interface TrancheAlbums {
  debut: number;
  fin: number;
  avant: number;
  apres: number;
}

/** Fenêtre de lignes complètes : sa taille ne croît pas avec un saut A–Z. */
export function trancheAlbums(total: number, position: number, vue: number, colonnes: number, pas: number, espace: number): TrancheAlbums {
  if (total <= 600) return { debut: 0, fin: total, avant: 0, apres: 0 };
  const cols = Math.max(1, colonnes);
  const hauteur = Math.max(1, pas);
  const lignes = Math.ceil(total / cols);
  const visibles = Math.max(1, Math.ceil(vue / hauteur));
  const marge = Math.max(2, Math.ceil(100 / cols));
  const premiere = Math.min(lignes - 1, Math.max(0, Math.floor(position / hauteur)));
  const debut = Math.max(0, premiere - marge);
  const fin = Math.min(lignes, Math.max(debut + Math.ceil(200 / cols), premiere + visibles + marge));
  return {
    debut: debut * cols,
    fin: Math.min(total, fin * cols),
    // Les cales occupent une ligne/colonne : le gap adjacent existe déjà.
    avant: debut ? Math.max(0, debut * hauteur - espace) : 0,
    apres: fin < lignes ? Math.max(0, (lignes - fin) * hauteur - espace) : 0,
  };
}

interface Options {
  total: number;
  mode: string;
  surFenetre: (tranche: TrancheAlbums) => void;
  surPret: (aller: ((index: number) => Promise<void>) | undefined) => void;
}

/** Deux cales conservent la longueur du défilement ; seuls les albums proches sont montés. */
export function fenetreAlbumsPaginee(el: HTMLElement, options: Options) {
  let o = options;
  let detruit = false;
  let trame = 0;
  let cible: number | null = null;
  let revision = 0;
  let ancre: { index: number; decalage: number } | null = null;
  // Les cales restent des estimations. Une nouvelle première rangée peut
  // avoir une autre hauteur : conserver la carte visible, pas son ancien
  // scrollTop calculé avec une hauteur devenue différente.
  const lireAncre = (horizontal: boolean) => {
    const cadre = el.getBoundingClientRect();
    for (const carte of el.querySelectorAll<HTMLElement>('[data-i]')) {
      const rect = carte.getBoundingClientRect();
      const debut = horizontal ? rect.left - cadre.left : rect.top - cadre.top;
      const fin = horizontal ? rect.right - cadre.left : rect.bottom - cadre.top;
      const vue = horizontal ? cadre.width : cadre.height;
      if (fin > 0 && debut < vue) return { index: Number(carte.dataset.i), decalage: debut };
    }
    return null;
  };
  const mesurer = () => {
    const style = getComputedStyle(el);
    const horizontal = o.mode === 'carousel';
    const colonnes = o.mode === 'grid' ? Math.max(1, style.gridTemplateColumns.split(/\s+/).filter(Boolean).length) : 1;
    const carte = el.querySelector<HTMLElement>('[data-i]');
    const espace = parseFloat(horizontal ? style.columnGap : style.rowGap) || 0;
    const taille = horizontal ? (carte?.offsetWidth || 200) : (carte?.offsetHeight || (o.mode === 'list' ? 56 : 210));
    return { horizontal, colonnes, espace, pas: taille + espace,
      vue: (horizontal ? el.clientWidth : el.clientHeight) || 600 };
  };
  const calculer = () => {
    trame = 0;
    if (detruit) return;
    const g = mesurer();
    const tour = ++revision;
    if (cible == null && o.total > 600 && !g.horizontal) ancre ??= lireAncre(g.horizontal);
    const index = cible ?? ancre?.index;
    const position = index == null ? (g.horizontal ? el.scrollLeft : el.scrollTop) : Math.floor(index / g.colonnes) * g.pas;
    o.surFenetre(trancheAlbums(o.total, position, g.vue, g.colonnes, g.pas, g.espace));
    if (ancre && cible == null) void tick().then(() => {
      if (detruit || tour !== revision || !ancre || cible != null) return;
      const carte = el.querySelector<HTMLElement>(`[data-i="${ancre.index}"]`);
      if (carte) {
        const rect = carte.getBoundingClientRect();
        const cadre = el.getBoundingClientRect();
        const delta = (g.horizontal ? rect.left - cadre.left : rect.top - cadre.top) - ancre.decalage;
        if (Math.abs(delta) > 0.5) {
          if (g.horizontal) el.scrollLeft += delta; else el.scrollTop += delta;
        }
      }
      ancre = null;
    });
  };
  const planifier = () => {
    if (!trame && !detruit) trame = requestAnimationFrame(calculer);
  };
  const aller = async (index: number) => {
    ancre = null;
    cible = Math.max(0, Math.min(o.total - 1, index));
    calculer();
    await tick();
    if (detruit || cible == null) return;
    const g = mesurer();
    const carte = el.querySelector<HTMLElement>(`[data-i="${cible}"]`);
    const rect = carte?.getBoundingClientRect();
    const cadre = el.getBoundingClientRect();
    const position = rect && !g.horizontal
      ? (g.horizontal ? el.scrollLeft + rect.left - cadre.left : el.scrollTop + rect.top - cadre.top)
      : Math.floor(cible / g.colonnes) * g.pas;
    if (g.horizontal) el.scrollLeft = position; else el.scrollTop = position;
    cible = null;
  };
  const defiler = () => { ancre = null; planifier(); };
  o.surPret(aller);
  el.addEventListener('scroll', defiler, { passive: true });
  window.addEventListener('resize', planifier);
  const taille = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(planifier);
  taille?.observe(el);
  calculer();
  return {
    update(n: Options) {
      if (o.mode !== n.mode) ancre = null;
      o = n;
      // Les données peuvent grandir après un filtre ou l’arrivée des favoris.
      // Rendre leur nouvelle tranche dans ce cycle, sans attendre une frame.
      calculer();
      planifier();
    },
    destroy() {
      detruit = true;
      cancelAnimationFrame(trame);
      taille?.disconnect();
      el.removeEventListener('scroll', defiler);
      window.removeEventListener('resize', planifier);
      o.surPret(undefined);
    },
  };
}
