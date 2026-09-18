/**
 * Les deux gestes que `lectureEnMasse` demande, pour une zone donnée.
 *
 * `lectureEnMasse` est volontairement pur : il compose un plan « tête et
 * reste » et le confie à deux fonctions. La paire qui les fournit était
 * recopiée à l'identique dans `FavoritesV2` et `StreamingV2` ; #1061 en
 * demande une troisième, une quatrième et une cinquième — « Lire à partir
 * d'ici » sur chaque liste de titres. Une seule copie, donc.
 */
import * as api from './api';
import { playAndSync } from './stores/zones';
import type { GestesLecture } from './lectureEnMasse';

/**
 * 🔴 Le type vient de `lectureEnMasse`, il n'est pas redéclaré ici.
 *
 * Une copie locale aurait compilé et divergé en silence : `enfiler` y prend un
 * `AddToQueueRequest`, pas un `Record<string, unknown>`. `svelte-check` l'a
 * dit sur les cinq écrans d'un coup.
 */
export function gestesDeZone(zid: number): GestesLecture {
  return {
    lire: (c: any) => playAndSync(zid, c),
    enfiler: (c: any) => api.addToQueue(zid, c),
  };
}
