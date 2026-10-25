/**
 * Tune Circle (rc8) — le budget de la scène animée. Fonction pure.
 *
 * Doctrine : la scène est un décor, l'audio passe avant. Trois règles :
 *
 * - `prefers-reduced-motion` (ou aucune animation possible) → IMAGE FIXE :
 *   une seule image dessinée, redessinée seulement quand la scène change ;
 * - lecture DANS LE NAVIGATEUR (zone « Desktop », Web Audio) → moins de
 *   particules, 30 images par seconde, densité d'écran 1 : le fil principal
 *   qui nourrit l'audio n'est jamais retenu par le décor ;
 * - petit écran (< 768 px) → moins de particules, densité plafonnée.
 *
 * Les zones servies par le serveur ne sont pas concernées : leur audio est
 * rendu par le serveur, pas par cet onglet.
 */

export interface EntreeBudget {
  /** Largeur de la fenêtre, en px CSS. */
  largeur: number;
  /** L'onglet joue lui-même de l'audio (zone navigateur). */
  lectureLocale: boolean;
  /** `prefers-reduced-motion: reduce`, ou animation impossible. */
  mouvementReduit: boolean;
  /** `navigator.hardwareConcurrency`, si connu : ≤ 4 cœurs = appareil modeste. */
  coeurs?: number | null;
}

export interface Budget {
  /** Faut-il une boucle d'animation ? `false` = image fixe. */
  anime: boolean;
  /** Facteur (0..1] appliqué à chaque famille de particules. */
  facteur: number;
  /** Images par seconde visées (0 = image fixe). */
  ips: number;
  /** Densité d'écran maximale du canevas. */
  dprMax: number;
}

/** Largeur sous laquelle l'écran est « petit » (contrat : mobile < 768 px). */
export const LARGEUR_PETIT_ECRAN = 768;

export function budgetScene(e: EntreeBudget): Budget {
  if (e.mouvementReduit) return { anime: false, facteur: 1, ips: 0, dprMax: 2 };
  const petit = e.largeur > 0 && e.largeur < LARGEUR_PETIT_ECRAN;
  const modeste = e.coeurs != null && e.coeurs > 0 && e.coeurs <= 4;
  let facteur = 1;
  if (petit) facteur *= 0.5;
  if (modeste) facteur *= 0.6;
  if (e.lectureLocale) facteur *= 0.4;
  const ips = e.lectureLocale || petit || modeste ? 30 : 60;
  const dprMax = e.lectureLocale ? 1 : petit || modeste ? 1.5 : 2;
  return { anime: true, facteur: Math.max(0.1, +facteur.toFixed(3)), ips, dprMax };
}

/** Nombre de particules d'une famille, une fois le budget appliqué (au moins 1). */
export function parBudget(nominal: number, b: Pick<Budget, 'facteur'>): number {
  return Math.max(1, Math.round(nominal * b.facteur));
}
