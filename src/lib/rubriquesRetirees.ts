/**
 * Les rubriques qu'un service de streaming a RETIRÉES à Tune.
 *
 * Spotify ferme des points d'accès aux applications personnelles (celle que
 * chaque utilisateur crée) : la sélection éditoriale depuis novembre 2024
 * (tune-server-rust#8399), puis en février 2026 les nouveautés, les genres
 * et les titres phares d'un artiste (#8485, #8578). Le serveur répond alors
 * une liste vide ET l'en-tête `x-tune-rubrique-retiree: 1`.
 *
 * Décision de Bertrand (12/11/2026) : ni rubrique vide, ni rubrique masquée,
 * mais une phrase claire, « Spotify ne fournit plus cette rubrique aux
 * applications personnelles. » Une liste vide SANS l'en-tête reste une liste
 * vide : on n'accuse pas le service à tort.
 */
import { writable, get } from 'svelte/store';

export type RubriqueRetirable = 'selection' | 'nouveautes' | 'genres' | 'titres-phares';

export const ENTETE_RUBRIQUE_RETIREE = 'x-tune-rubrique-retiree';

/** La phrase affichée à la place de la rubrique (`{s}` : le nom du service). */
export const CLE_RUBRIQUE_RETIREE = 'v2.svc.rubriqueRetiree';

const cle = (service: string, rubrique: RubriqueRetirable) => `${service}:${rubrique}`;

/** `service:rubrique` des rubriques retirées, tenu par les réponses du serveur. */
export const rubriquesRetirees = writable<ReadonlySet<string>>(new Set());

/** Lecteur d'en-têtes (`fetchJSON`, 5e argument) pour une rubrique. */
export function noterRetrait(service: string, rubrique: RubriqueRetirable): (h: Headers) => void {
  return (h) => {
    const retiree = h.get(ENTETE_RUBRIQUE_RETIREE) === '1';
    const k = cle(service, rubrique);
    rubriquesRetirees.update((s) => {
      if (s.has(k) === retiree) return s;
      const n = new Set(s);
      if (retiree) n.add(k); else n.delete(k);
      return n;
    });
  };
}

/** La dernière réponse de cette rubrique la disait-elle retirée ? */
export function estRetiree(service: string, rubrique: RubriqueRetirable, ensemble?: ReadonlySet<string>): boolean {
  return (ensemble ?? get(rubriquesRetirees)).has(cle(service, rubrique));
}

/** L'échec qu'un widget lève pour une rubrique retirée : `PageWidgets` le dit
 *  par la phrase, sans rouge ni bouton « Réessayer » (réessayer n'y changera
 *  rien). */
export class RubriqueRetiree extends Error {
  readonly retiree = true;
  constructor(readonly service: string, readonly rubrique: RubriqueRetirable) {
    super('rubrique_retiree');
  }
}

/** Une liste vide d'une rubrique retirée lève [`RubriqueRetiree`] ; sinon la liste. */
export function exigerNonRetiree<T>(liste: T[], service: string, rubrique: RubriqueRetirable): T[] {
  if (liste.length === 0 && estRetiree(service, rubrique)) throw new RubriqueRetiree(service, rubrique);
  return liste;
}

/** Le nom affiché du service (`spotify` → `Spotify`). */
export function nomDuService(service: string): string {
  return service ? service.charAt(0).toUpperCase() + service.slice(1) : '';
}

/** La phrase, dans la langue de l'interface, à partir de son gabarit traduit. */
export function phraseRetrait(gabarit: string, service: string): string {
  return gabarit.replace('{s}', nomDuService(service));
}
