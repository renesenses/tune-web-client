/**
 * Les jours d'un réveil — #5669, fil forum 2111.
 *
 * ## Une seule convention : celle du serveur, 0 = lundi … 6 = dimanche
 *
 * Le planificateur (`tune-core/src/alarms.rs`) compte les jours depuis le
 * lundi et lit EN PRIORITÉ `days_of_week`, un masque de 7 caractères
 * `0`/`1` dans l'ordre lun..dim. Le champ `days` (liste « 0,1,2 ») n'est lu
 * qu'à défaut de masque — et la base pose `1111111` par défaut.
 *
 * L'écran Réveils v2 n'envoyait QUE `days`, et comptait 0 = dimanche : un
 * réveil « en semaine » partait avec le masque `1111111` et sonnait aussi
 * le samedi et le dimanche. On envoie désormais le masque, et `days` dans la
 * même convention que lui.
 *
 * ## Lire : le masque d'abord, comme le planificateur
 *
 * Un réveil créé avant ce correctif garde `days_of_week = 1111111` : il
 * s'affiche « Tous les jours », parce que c'est ce qu'il FAIT. Afficher
 * `days` montrerait ce que l'écran croyait avoir enregistré, pas ce qui
 * sonnera.
 */

/** Indices 0 = lundi … 6 = dimanche, triés, sans doublon. */
export type Jours = number[];

const MASQUE = /^[01]{7}$/;

export function masqueDepuisJours(jours: Jours): string {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => (jours.includes(d) ? '1' : '0')).join('');
}

export function joursDepuisMasque(masque: string): Jours {
  return [...masque].flatMap((c, i) => (c === '1' ? [i] : []));
}

/** `days` « 0,1,2 » (0 = lundi) — repli quand le masque manque. */
export function joursDepuisListe(liste: string | null | undefined): Jours {
  const v = (liste ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /^[0-6]$/.test(p))
    .map(Number);
  return [...new Set(v)].sort((a, b) => a - b);
}

/** Les jours où ce réveil sonnera, lus comme le planificateur les lit. */
export function joursDuReveil(r: { days?: string | null; days_of_week?: string | null }): Jours {
  if (r.days_of_week && MASQUE.test(r.days_of_week)) return joursDepuisMasque(r.days_of_week);
  return joursDepuisListe(r.days);
}

/** Les deux champs à envoyer, cohérents entre eux. */
export function champsJours(jours: Jours): { days: string; days_of_week: string } {
  const tries = [...new Set(jours)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  return { days: tries.join(','), days_of_week: masqueDepuisJours(tries) };
}

export const EN_SEMAINE: Jours = [0, 1, 2, 3, 4];
export const WEEK_END: Jours = [5, 6];
