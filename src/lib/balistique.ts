/**
 * LA BALISTIQUE DES INSTRUMENTS, EN TEMPS ET NON EN IMAGES — fil 3025.
 *
 * François Mercier (25/11/2026, rc13) : « VU-mètres et aiguilles un peu en
 * retard », en sortie locale comme en UPnP, dans « Lecture en cours » comme
 * en Grand écran — et l'analyseur de spectre aussi.
 *
 * ## Ce qui était mesuré
 *
 * Côté serveur, une sortie LOCALE publie chaque trame quand son début SORT
 * de l'anneau (fil 1908, `attendre_que_la_sortie_joue`) : l'écart avec le
 * son tient dans le tampon du pilote, de l'ordre de 10 à 50 ms. Le client
 * garde la DERNIÈRE trame de chaque zone, sans file. Le retard visible
 * naissait donc ici, dans des coefficients appliqués à CHAQUE IMAGE :
 *
 * | instrument | coefficient | 30 i/s (défaut) | 15 i/s |
 * |---|---|---|---|
 * | aiguille, montée 0,25 | 99 % atteints en | 533 ms | 1,07 s |
 * | aiguille, retombée 0,08 | 99 % atteints en | 1,84 s | 3,7 s |
 * | spectre, retombée 0,12 | 90 % atteints en | 600 ms | 1,2 s |
 *
 * Un coefficient par image dépend de l'écran et du réglage de cadence (#1256)
 * : le Grand écran, en `requestAnimationFrame`, allait deux fois plus vite
 * que la barre de lecture à 30 i/s, et quatre fois sur un écran à 120 Hz.
 *
 * ## La règle
 *
 * Un lissage du premier ordre exprimé par sa CONSTANTE DE TEMPS :
 * `1 − exp(−dt/τ)` du chemin restant à chaque image, quel que soit l'écart
 * entre deux images. Même réponse à 15, 30, 60 ou 120 i/s.
 */

/**
 * Le VU normalisé (IEC 60268-17, ANSI C16.5) : 99 % de l'indication finale en
 * 300 ms, à la montée comme à la retombée. C'est le « temps d'intégration »
 * d'un VU ; un premier ordre l'atteint avec τ = 300 / ln(100) ≈ 65 ms.
 */
export const TEMPS_D_INTEGRATION_VU_MS = 300;
export const TAU_VU_MS = TEMPS_D_INTEGRATION_VU_MS / Math.log(100);

/**
 * Analyseur de spectre : attaque quasi immédiate (90 % en ~60 ms), retombée
 * qui laisse voir le transitoire sans traîner (90 % en ~250 ms).
 */
export const TAU_SPECTRE_ATTAQUE_MS = 25;
export const TAU_SPECTRE_RETOMBEE_MS = 110;

/**
 * Bargraphe du Grand écran : son repère de crête retombe de 21 dB/s, la
 * valeur que rendaient ses 0,35 dB par image à 60 Hz.
 */
export const CHUTE_REPERE_CRETE_DB_PAR_S = 21;

/**
 * Écart retenu entre deux images, en ms. Un écart négatif ou non fini (horloge
 * recalée, première image) ne fait rien bouger ; un très long écart (onglet
 * caché puis rendu) mène droit à la cible, ce qui est juste : le son, lui, a
 * continué.
 */
export function ecartDImage(precedentMs: number | null, maintenantMs: number): number {
  if (precedentMs == null) return 0;
  const dt = maintenantMs - precedentMs;
  return Number.isFinite(dt) && dt > 0 ? dt : 0;
}

/** La part du chemin restant parcourue en `dtMs` par un premier ordre de constante `tauMs`. */
export function partParcourue(dtMs: number, tauMs: number): number {
  if (!(dtMs > 0)) return 0;
  if (!(tauMs > 0)) return 1;
  return 1 - Math.exp(-dtMs / tauMs);
}

/** Un pas de lissage du premier ordre, asymétrique au besoin. */
export function lisser(
  actuelle: number,
  cible: number,
  dtMs: number,
  tauMonteeMs: number,
  tauRetombeeMs: number = tauMonteeMs,
): number {
  const tau = cible > actuelle ? tauMonteeMs : tauRetombeeMs;
  return actuelle + (cible - actuelle) * partParcourue(dtMs, tau);
}
