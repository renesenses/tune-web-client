/**
 * Banc d'essai des dépendances d'un `$effect`.
 *
 * Les runes ne se compilent que dans `.svelte` et `.svelte.ts` — ce fichier
 * existe pour ça, et rien d'autre. Le test qui s'en sert est un `.test.ts`
 * ordinaire.
 *
 * On y reproduit le mécanisme du bug de navigation Qobuz (Dominique COMET,
 * 0.9.66) : un effet qui appelle une fonction lisant un second store **avant
 * tout `await`** hérite de ce store comme dépendance, même si son commentaire
 * prétend ne réagir qu'au premier.
 *
 * ⚠️ `get(store)` NE crée PAS de dépendance : c'est une lecture ponctuelle.
 * Dans un composant, `$currentProfileId` est compilé en lecture réactive ;
 * hors composant, l'équivalent est `fromStore(...).current`. Utiliser `get`
 * ici donnerait un test toujours vert, qui ne prouverait rien.
 */
import { flushSync, untrack } from 'svelte';
import { fromStore, type Writable } from 'svelte/store';

export interface ResetProbe {
  /** Nombre d'exécutions du corps (la remise à zéro). */
  readonly bodyRuns: number;
  /** Arrête l'effet et libère la racine. */
  stop: () => void;
}

/** Forme fautive : le corps lit le second store à l'intérieur de l'effet. */
export function trackedReset(
  service: Writable<string | null>,
  profileId: Writable<number | null>,
): ResetProbe {
  const counts = { n: 0 };
  const stop = $effect.root(() => {
    const svc = fromStore(service);
    const pid = fromStore(profileId);
    $effect(() => {
      void svc.current;
      // équivalent de `loadLocalFavorites` : lecture réactive avant tout await
      void pid.current;
      counts.n++;
    });
  });
  flushSync();
  return {
    get bodyRuns() {
      return counts.n;
    },
    stop,
  };
}

/** Forme corrigée : même corps, enfermé dans `untrack`. */
export function untrackedReset(
  service: Writable<string | null>,
  profileId: Writable<number | null>,
): ResetProbe {
  const counts = { n: 0 };
  const stop = $effect.root(() => {
    const svc = fromStore(service);
    const pid = fromStore(profileId);
    $effect(() => {
      void svc.current;
      untrack(() => {
        void pid.current;
        counts.n++;
      });
    });
  });
  flushSync();
  return {
    get bodyRuns() {
      return counts.n;
    },
    stop,
  };
}

/** Force le traitement des effets en attente depuis un test ordinaire. */
export function flush(): void {
  flushSync();
}
