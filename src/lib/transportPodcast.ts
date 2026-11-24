/**
 * rc15 — fil forum 3009 (Fabien), go de Bertrand du 24/11/2026.
 *
 * Quand l'élément en cours est un ÉPISODE DE PODCAST :
 *
 * 1. Précédent et Suivant deviennent **Reculer** et **Avancer** d'un nombre
 *    de secondes réglable de 1 à 99 (défauts 15 s et 30 s, l'usage des
 *    lecteurs de podcasts : Apple Podcasts, Pocket Casts, Overcast). Le saut
 *    passe par `POST /zones/{id}/seek/relative` (tune-server-rust, rc15).
 * 2. La **vitesse de lecture** se règle de 0,4 à 1,6 par pas de 0,1, SANS
 *    changer la hauteur du son. Elle n'agit que sur la sortie NAVIGATEUR :
 *    l'élément `<audio>` sait étirer le temps en gardant la hauteur
 *    (`preservesPitch`, actif par défaut). Le serveur, lui, ne sait pas
 *    encore le faire sans toucher au flux des autres sorties : ailleurs, le
 *    réglage est grisé avec un message qui le dit.
 *
 * Pour tout autre contenu, rien ne change : un titre de musique garde
 * Précédent et Suivant (contre-épreuve : `transportPodcast.test.ts`).
 *
 * Les trois réglages vivent dans `ui_preferences`, donc PAR PROFIL et
 * synchronisés serveur, comme les autres choix de la barre de transport.
 * Une valeur abîmée (blob ancien, main humaine) retombe sur le défaut.
 */

export const RECULER_DEFAUT_S = 15;
export const AVANCER_DEFAUT_S = 30;
export const SAUT_MIN_S = 1;
export const SAUT_MAX_S = 99;

export const VITESSE_DEFAUT = 1;
export const VITESSE_MIN = 0.4;
export const VITESSE_MAX = 1.6;

/** Les crans offerts : 0,4 … 1,6 par pas de 0,1 (13 valeurs). */
export const VITESSES: readonly number[] = Array.from({ length: 13 }, (_, i) =>
  Math.round((VITESSE_MIN + i * 0.1) * 10) / 10,
);

/** L'élément en cours est-il un épisode de podcast ? */
export function estEpisodeDePodcast(piste: { source?: string | null } | null | undefined): boolean {
  return piste?.source === 'podcast';
}

/** Un nombre de secondes de saut, entier, borné à 1–99 ; sinon `defaut`. */
export function bornerSecondes(v: unknown, defaut: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return defaut;
  return Math.min(SAUT_MAX_S, Math.max(SAUT_MIN_S, Math.round(n)));
}

/** Une vitesse au cran de 0,1, bornée à 0,4–1,6 ; sinon 1. */
export function bornerVitesse(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return VITESSE_DEFAUT;
  const cran = Math.round(n * 10) / 10;
  return Math.min(VITESSE_MAX, Math.max(VITESSE_MIN, cran));
}

/** « 1,2× » / « 1.2× » selon la langue. */
export function libelleVitesse(v: number, langue = 'fr'): string {
  try {
    return `${new Intl.NumberFormat(langue, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}×`;
  } catch {
    return `${v.toFixed(1)}×`;
  }
}

export interface ReglagesPodcast {
  podcastReculerS?: unknown;
  podcastAvancerS?: unknown;
  podcastVitesse?: unknown;
}

/** Les deux sauts lus dans les préférences, bornés. */
export function sautsDuProfil(p: ReglagesPodcast | null | undefined): { reculer: number; avancer: number } {
  return {
    reculer: bornerSecondes(p?.podcastReculerS, RECULER_DEFAUT_S),
    avancer: bornerSecondes(p?.podcastAvancerS, AVANCER_DEFAUT_S),
  };
}

/**
 * Le geste que portent les deux boutons de la barre. `null` : Précédent et
 * Suivant, inchangés. Sinon le saut SIGNÉ, en millisecondes, de chacun.
 */
export function gesteDesBoutons(
  piste: { source?: string | null } | null | undefined,
  p: ReglagesPodcast | null | undefined,
): { reculerMs: number; avancerMs: number; reculerS: number; avancerS: number } | null {
  if (!estEpisodeDePodcast(piste)) return null;
  const { reculer, avancer } = sautsDuProfil(p);
  return { reculerMs: -reculer * 1000, avancerMs: avancer * 1000, reculerS: reculer, avancerS: avancer };
}

/**
 * La vitesse à poser sur l'élément `<audio>` : celle du profil pour un
 * épisode de podcast, 1 pour tout le reste (la musique n'est jamais
 * accélérée par ce réglage).
 */
export function vitesseAAppliquer(
  piste: { source?: string | null } | null | undefined,
  p: ReglagesPodcast | null | undefined,
): number {
  return estEpisodeDePodcast(piste) ? bornerVitesse(p?.podcastVitesse) : VITESSE_DEFAUT;
}
