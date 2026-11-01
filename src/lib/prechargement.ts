/**
 * LE PRÉCHARGEMENT AU SURVOL — tune-server-rust#7619, volet L5.
 *
 * Une fiche d'album survolée assez longtemps pour être une intention (et non
 * un passage de souris) fait partir, en avance, les deux requêtes que la fiche
 * ouverte enverra : l'album et ses pistes. Quand l'utilisateur clique, la
 * fiche reprend ces requêtes déjà en vol ou déjà servies au lieu d'en lancer
 * de nouvelles (voir `prendrePrecharge` dans `api.ts`).
 *
 * ## La limitation de débit
 *
 * Survoler une grille en diagonale, c'est passer sur trente pochettes en une
 * seconde. Trois garde-fous :
 * - une INTENTION : la requête ne part qu'après `DELAI_INTENTION_MS` de
 *   survol continu de la même fiche ;
 * - un SEAU À JETONS : au plus `RAFALE` préchargements d'affilée, puis un
 *   toutes les `INTERVALLE_MS` ;
 * - une MÉMOIRE : un album déjà préchargé il y a moins de `DUREE_VIE_MS` ne se
 *   redemande pas.
 *
 * Pas de souris (écran tactile) : `pointerenter` d'un toucher arrive juste
 * avant le clic, le délai d'intention l'écarte. Rien ne change.
 */

export const DELAI_INTENTION_MS = 120;
export const RAFALE = 3;
export const INTERVALLE_MS = 400;
export const DUREE_VIE_MS = 30_000;

export interface Horloge {
  maintenant: () => number;
  differer: (f: () => void, ms: number) => unknown;
  annuler: (minuteur: unknown) => void;
}

const horlogeReelle: Horloge = {
  maintenant: () => Date.now(),
  differer: (f, ms) => setTimeout(f, ms),
  annuler: (m) => clearTimeout(m as ReturnType<typeof setTimeout>),
};

/**
 * Un limiteur : `survol(id)` à l'entrée sur une fiche, `fin()` à la sortie.
 * `charger(id)` n'est appelé que si l'intention tient et qu'un jeton reste.
 */
export function limiteur(charger: (id: number) => void, horloge: Horloge = horlogeReelle) {
  let jetons = RAFALE;
  let dernierRemplissage = horloge.maintenant();
  let minuteur: unknown = null;
  let enCours: number | null = null;
  const deja = new Map<number, number>();

  function remplir() {
    const t = horloge.maintenant();
    const gagnes = Math.floor((t - dernierRemplissage) / INTERVALLE_MS);
    if (gagnes > 0) {
      jetons = Math.min(RAFALE, jetons + gagnes);
      dernierRemplissage += gagnes * INTERVALLE_MS;
    }
  }

  function fin() {
    if (minuteur !== null) horloge.annuler(minuteur);
    minuteur = null;
    enCours = null;
  }

  function survol(id: number | null | undefined) {
    if (id == null || !Number.isFinite(id)) return;
    if (enCours === id) return;
    fin();
    enCours = id;
    minuteur = horloge.differer(() => {
      minuteur = null;
      enCours = null;
      const t = horloge.maintenant();
      const vu = deja.get(id);
      if (vu !== undefined && t - vu < DUREE_VIE_MS) return;
      remplir();
      if (jetons <= 0) return;
      jetons -= 1;
      deja.set(id, t);
      // La mémoire reste bornée : on oublie ce qui a expiré.
      if (deja.size > 200) {
        for (const [k, v] of deja) if (t - v >= DUREE_VIE_MS) deja.delete(k);
      }
      charger(id);
    }, DELAI_INTENTION_MS);
  }

  return { survol, fin };
}

/**
 * Action Svelte posée sur un conteneur : délégation sur les descendants qui
 * portent `data-album="<id>"`. Une seule écoute pour toute la grille, quelle
 * que soit la vue (grille, liste, carrousel).
 */
export function prechargementAuSurvol(el: HTMLElement, charger: (id: number) => void) {
  const l = limiteur(charger);
  const sur = (e: Event) => {
    const cible = (e.target as Element | null)?.closest?.('[data-album]') as HTMLElement | null;
    if (!cible || !el.contains(cible)) { l.fin(); return; }
    l.survol(Number(cible.dataset.album));
  };
  const hors = () => l.fin();
  el.addEventListener('pointerover', sur);
  el.addEventListener('pointerleave', hors);
  return {
    destroy() {
      el.removeEventListener('pointerover', sur);
      el.removeEventListener('pointerleave', hors);
      l.fin();
    },
  };
}
