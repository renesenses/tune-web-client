/**
 * #1752 — une recherche qu'on peut ARRÊTER (Tades, fil 2023 : « Il faudrait
 * pouvoir arrêter la recherche des concerts pour pouvoir passer à un autre
 * onglet »).
 *
 * L'écran Concerts enchaîne jusqu'à deux appels au nuage (`/location` puis
 * `/upcoming`, 15 s de délai chacun côté serveur) sans rien pour les
 * interrompre, et `fetchJSON` n'a pas de délai côté client. Un seul
 * `AbortController` vivant à la fois :
 *
 *  - `nouveau()` ouvre une recherche et ABANDONNE la précédente — deux
 *    réponses qui se croisent ne peuvent plus s'écraser l'une l'autre ;
 *  - `arreter()` abandonne celle en cours (bouton « Arrêter », sortie de
 *    l'écran) ;
 *  - `estArret(e)` reconnaît l'erreur d'un abandon, qui n'est pas une panne :
 *    `fetchJSON` ne pose alors aucun bandeau réseau (#1788), et l'écran dit
 *    « Recherche arrêtée » au lieu de « indisponible ».
 *
 * ⚠️ Le blocage complet de l'écran décrit aux fils 2028 et 2047 (plus aucun
 * clic ne répond) avait une autre cause, une exception Svelte, suivie dans
 * #1856. Ce bouton répond à la demande distincte : écourter une attente longue.
 */
export interface Arret {
  nouveau(): AbortSignal;
  arreter(): boolean;
}

export function creerArret(): Arret {
  let ctrl: AbortController | null = null;
  return {
    nouveau() {
      ctrl?.abort();
      ctrl = new AbortController();
      return ctrl.signal;
    },
    /** `true` si une recherche était en cours et vient d'être abandonnée. */
    arreter() {
      if (!ctrl) return false;
      const etait = !ctrl.signal.aborted;
      ctrl.abort();
      ctrl = null;
      return etait;
    },
  };
}

/** L'erreur levée par un `fetch` abandonné (`DOMException` « AbortError »). */
export function estArret(e: unknown): boolean {
  return (e as { name?: unknown } | null)?.name === 'AbortError';
}
