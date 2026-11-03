/**
 * Le greffon Crosstalk est-il là ? — pour l'entrée STUDIO de la barre, et
 * traite-t-il une zone ? — pour l'EXCLUSION visible des écrans crossfeed
 * (web#2580).
 *
 * Même lecture que Crossfeed Pro (`stores/crossfeedPro`) : la seule route
 * ouverte à tous est le réglage d'une zone,
 * `GET /audio-plugins/crosstalk/zones/{zone}` — 404 `plugin_inconnu` quand le
 * greffon n'existe pas, `active` sinon.
 */
import { writable } from 'svelte/store';
import * as api from '../api';
import { presenceDepuis, type PresenceCrossfeedPro } from '../crossfeedPro';
import { CROSSTALK_ID, crosstalkTraite } from '../crosstalk';

export const presenceCrosstalk = writable<PresenceCrossfeedPro>('inconnue');

/** Interroge l'hôte. Une panne (`inconnue`) laisse l'état tel quel. */
export async function sonderCrosstalk(zoneId: number | null | undefined): Promise<PresenceCrossfeedPro> {
  let p: PresenceCrossfeedPro;
  try {
    p = presenceDepuis(await api.getReglageGreffonNatif(CROSSTALK_ID, zoneId ?? 0));
  } catch (e) {
    p = presenceDepuis(null, e);
  }
  if (p !== 'inconnue') presenceCrosstalk.set(p);
  return p;
}

/** Filtre des entrées STUDIO : `crosstalk` seulement quand le greffon est
 *  actif ; toute autre vue passe. */
export function entreesAvecCrosstalk<T extends { view: string }>(
  items: T[],
  presence: PresenceCrossfeedPro,
): T[] {
  return items.filter((it) => it.view !== 'crosstalk' || presence === 'actif');
}

/** Crosstalk traite-t-il cette zone ? Une panne, un greffon absent ou aucune
 *  zone rendent `false` : le crossfeed reste alors réglable, comme avant. */
export async function crosstalkTraiteLaZone(zoneId: number | null | undefined): Promise<boolean> {
  if (zoneId == null) return false;
  try {
    return crosstalkTraite(await api.getReglageGreffonNatif(CROSSTALK_ID, zoneId));
  } catch {
    return false;
  }
}
