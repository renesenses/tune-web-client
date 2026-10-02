import type { Zone } from './types';

/**
 * #1876 — « Natif » réglé sur une sortie locale part en DoP : le serveur le
 * publie (`dsd_transport = "natif_servi_en_dop"`, `TransportDsd` côté
 * `tune-core`), l'écran doit le dire à côté du réglage.
 *
 * Rien n'est déduit ici du type de sortie : seul le champ du serveur fait foi
 * (absent = on ne sait pas = rien à dire). Le `dsd_mode` n'est regardé que
 * pour ne jamais afficher la mention sous un sélecteur qui ne dit plus
 * « Natif » (champ resté d'une réponse antérieure au changement de réglage).
 */
export const NATIF_SERVI_EN_DOP = 'natif_servi_en_dop';

export function natifServiEnDop(z: Pick<Zone, 'dsd_mode' | 'dsd_transport'> | null | undefined): boolean {
  return z?.dsd_transport === NATIF_SERVI_EN_DOP && z?.dsd_mode === 'native';
}
