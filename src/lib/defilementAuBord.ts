/**
 * web#2020 — DÉFILER PRÈS DES BORDS pendant le déplacement d'un widget.
 *
 * Alex Campbell, fil 2178 (Safari 18.6) : « When moving widgets around, the
 * page stops so you are required to place the widget anywhere before
 * scrolling the screen to the top and picking up the widget again ».
 *
 * L'accueil (`PageWidgets`) déplace ses widgets par glisser-déposer NATIF, et
 * la liste vit dans un conteneur défilant interne (`.scroll`). Rien ne le
 * faisait défiler pendant le glisser : le navigateur ne le fait pas toujours
 * de lui-même pour un conteneur interne (Safari ne le fait pas).
 *
 * Ce module suit le pointeur pendant le glisser (`dragover` sur le document,
 * pour le suivre aussi AU-DESSUS du conteneur, sur l'en-tête) et fait défiler
 * le conteneur, image après image, à une vitesse proportionnelle à la
 * proximité du bord — nulle au milieu, maximale au bord et au-delà.
 */

/** Hauteur de la bande sensible, en pixels, en haut comme en bas. */
export const MARGE_BORD = 64;
/** Vitesse au bord, en pixels par image (~60 images/s : ~1 100 px/s). */
export const VITESSE_MAX = 18;

/**
 * La vitesse de défilement pour un pointeur en `y`, dans un cadre
 * `[haut, bas]` : négative près du haut, positive près du bas, 0 ailleurs.
 * Au-delà du bord (pointeur sur l'en-tête), elle vaut le maximum.
 */
export function vitesseAuBord(
  y: number,
  cadre: { top: number; bottom: number },
  marge = MARGE_BORD,
  max = VITESSE_MAX,
): number {
  const hauteur = cadre.bottom - cadre.top;
  if (!(hauteur > 0) || !Number.isFinite(y)) return 0;
  // Un cadre plus petit que deux bandes : la bande se réduit au tiers, pour
  // garder un milieu où l'on dépose sans que la page bouge.
  const m = Math.min(marge, hauteur / 3);
  const versHaut = y - cadre.top;
  const versBas = cadre.bottom - y;
  if (versHaut < m) return -Math.round(max * Math.min(1, (m - versHaut) / m));
  if (versBas < m) return Math.round(max * Math.min(1, (m - versBas) / m));
  return 0;
}

export interface DefilementAuBord {
  /** Le glisser commence : suivre le pointeur. */
  demarrer(): void;
  /** Le glisser finit (dépôt, abandon, démontage) : tout arrêter. */
  arreter(): void;
}

/**
 * Le moteur, branché sur `zone()` (le conteneur qui défile). `raf`/`annuler`
 * sont injectables pour les tests ; `cible` est le document qui reçoit les
 * `dragover`.
 */
export function creerDefilementAuBord(
  zone: () => HTMLElement | null,
  options: {
    cible?: Pick<Document, 'addEventListener' | 'removeEventListener'>;
    raf?: (f: FrameRequestCallback) => number;
    annuler?: (id: number) => void;
  } = {},
): DefilementAuBord {
  const cible = options.cible ?? (typeof document !== 'undefined' ? document : null);
  const raf = options.raf ?? ((f: FrameRequestCallback) => requestAnimationFrame(f));
  const annuler = options.annuler ?? ((id: number) => cancelAnimationFrame(id));
  let vitesse = 0;
  let image: number | null = null;
  let actif = false;

  function boucle() {
    image = null;
    const el = zone();
    if (!actif || !el || vitesse === 0) return;
    const avant = el.scrollTop;
    el.scrollTop = avant + vitesse;
    // Arrivé en butée : inutile de tourner à vide jusqu'au prochain `dragover`.
    if (el.scrollTop === avant) return;
    image = raf(boucle);
  }

  function surDragover(e: Event) {
    const el = zone();
    if (!actif || !el) return;
    const y = (e as DragEvent).clientY;
    // Safari et Firefox rendent parfois 0/0 sur un évènement synthétique de
    // fin de glisser : un pointeur en (0, 0) n'est pas un pointeur en haut.
    if (y === 0 && (e as DragEvent).clientX === 0) return;
    vitesse = vitesseAuBord(y, el.getBoundingClientRect());
    if (vitesse !== 0 && image == null) image = raf(boucle);
  }

  return {
    demarrer() {
      if (actif || !cible) return;
      actif = true;
      vitesse = 0;
      cible.addEventListener('dragover', surDragover);
    },
    arreter() {
      if (!actif) return;
      actif = false;
      vitesse = 0;
      cible?.removeEventListener('dragover', surDragover);
      if (image != null) { annuler(image); image = null; }
    },
  };
}
