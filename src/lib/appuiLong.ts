/**
 * Appui long au DOIGT — harmonisation de l'interface (rc14).
 *
 * Le bouton « Sélectionner » quitte la barre de la Bibliothèque : à la souris,
 * une case apparaît au survol de la pochette ; sans survol (tablette,
 * téléphone), c'est l'appui long sur l'album qui entre en sélection et le
 * coche.
 *
 * Seuls les pointeurs `touch` (et `pen`) déclenchent : à la souris, un clic
 * maintenu reste un clic. Le geste est annulé si le doigt bouge (défilement)
 * ou se lève avant le délai. Quand il a abouti, le clic qui suit le lâcher est
 * AVALÉ : sans cela, l'album s'ouvrirait sous le doigt qui vient de le cocher.
 */

export const DELAI_APPUI_LONG_MS = 500;
/** Au-delà de ce déplacement (px), c'est un défilement, pas un appui. */
export const TOLERANCE_APPUI_LONG_PX = 10;

export interface PointeurMin {
  pointerType: string;
  clientX: number;
  clientY: number;
}

export interface Minuterie {
  poser: (f: () => void, ms: number) => unknown;
  retirer: (id: unknown) => void;
}

const MINUTERIE_NAVIGATEUR: Minuterie = {
  poser: (f, ms) => setTimeout(f, ms),
  retirer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** Le moteur du geste, sans DOM : testable tel quel. */
export function moteurAppuiLong(surAppui: () => void, minuterie: Minuterie = MINUTERIE_NAVIGATEUR) {
  let minuteur: unknown = null;
  let depart: { x: number; y: number } | null = null;
  let abouti = false;

  function annuler() {
    if (minuteur != null) minuterie.retirer(minuteur);
    minuteur = null;
    depart = null;
  }

  return {
    baisser(e: PointeurMin) {
      abouti = false;
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      annuler();
      depart = { x: e.clientX, y: e.clientY };
      minuteur = minuterie.poser(() => {
        minuteur = null;
        depart = null;
        abouti = true;
        surAppui();
      }, DELAI_APPUI_LONG_MS);
    },
    bouger(e: PointeurMin) {
      if (!depart) return;
      if (Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > TOLERANCE_APPUI_LONG_PX) annuler();
    },
    lever() { annuler(); },
    /** Le clic qui suit un appui abouti doit-il être avalé ? (une seule fois) */
    avalerClic(): boolean {
      const r = abouti;
      abouti = false;
      return r;
    },
    /** Le menu contextuel du système suit l'appui long sur mobile : on le retient. */
    enCours(): boolean { return minuteur != null || abouti; },
  };
}

/**
 * Attachement Svelte (`{@attach appuiLong(() => …)}`) : branche le moteur sur
 * un élément. `actif` faux : rien n'est écouté (onglet sans sélection).
 */
export function appuiLong(surAppui: () => void, actif = true) {
  return (el: HTMLElement) => {
    if (!actif) return;
    const m = moteurAppuiLong(surAppui);
    const baisser = (e: PointerEvent) => m.baisser(e);
    const bouger = (e: PointerEvent) => m.bouger(e);
    const lever = () => m.lever();
    const clic = (e: MouseEvent) => {
      if (m.avalerClic()) { e.preventDefault(); e.stopPropagation(); }
    };
    const menu = (e: Event) => { if (m.enCours()) e.preventDefault(); };
    el.addEventListener('pointerdown', baisser);
    el.addEventListener('pointermove', bouger);
    el.addEventListener('pointerup', lever);
    el.addEventListener('pointercancel', lever);
    el.addEventListener('pointerleave', lever);
    el.addEventListener('click', clic, true);
    el.addEventListener('contextmenu', menu);
    return () => {
      m.lever();
      el.removeEventListener('pointerdown', baisser);
      el.removeEventListener('pointermove', bouger);
      el.removeEventListener('pointerup', lever);
      el.removeEventListener('pointercancel', lever);
      el.removeEventListener('pointerleave', lever);
      el.removeEventListener('click', clic, true);
      el.removeEventListener('contextmenu', menu);
    };
  };
}
