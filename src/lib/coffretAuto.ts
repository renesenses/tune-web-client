/**
 * Qui a composé un coffret ? — GO de Bertrand du 25/09/2026 : le bouton
 * « Défaire le coffret » n'existe que sur un coffret AUTOMATIQUE.
 *
 * Le serveur (tune-server-rust#5012) pose, dans le magasin clé-valeur de
 * l'album (`GET /library/albums/{id}/metadata`), la clé `coffret` : un JSON
 * `{"origine":"auto"|"manuel", …}`. Un coffret composé à la main n'a pas été
 * deviné — il n'y a rien à désavouer, et sa route répond 409.
 *
 * Rend `null` pour tout le reste : pas de clé (album ordinaire, serveur
 * antérieur), valeur illisible, origine inconnue. Ne rien montrer vaut mieux
 * qu'un bouton qui échoue.
 */
export type OrigineCoffret = 'auto' | 'manuel';

export function origineDuCoffret(valeur: string | null | undefined): OrigineCoffret | null {
  if (!valeur) return null;
  try {
    const o = (JSON.parse(valeur) as { origine?: unknown })?.origine;
    return o === 'auto' || o === 'manuel' ? o : null;
  } catch {
    return null;
  }
}

/** L'évènement qui dit aux vues ouvertes qu'un coffret vient d'être défait. */
export const EVT_COFFRET_DEFAIT = 'tune:coffret-defait';
