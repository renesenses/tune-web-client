/**
 * Le greffon Crossfeed Pro est-il là ? — pour l'entrée STUDIO de la barre.
 *
 * Un greffon natif TIERS n'apparaît pas dans `GET /plugins` (la liste qui
 * gouverne les autres entrées STUDIO, `greffonsStudio.ts`), et la liste des
 * greffons natifs (`GET /audio-plugins/`) est réservée à l'administrateur.
 * La seule lecture ouverte à tous est le réglage d'une zone :
 * `GET /audio-plugins/crossfeed-pro/zones/{zone}` rend 404 `plugin_inconnu`
 * quand le greffon n'existe pas, et `active` sinon.
 *
 * L'entrée n'apparaît que sur `actif` — installé, activé ET chargé : une
 * entrée qui mène à une porte fermée est pire que pas d'entrée (#1261).
 */
import { writable } from 'svelte/store';
import * as api from '../api';
import { CROSSFEED_PRO_ID, crossfeedProTraite, presenceDepuis, type PresenceCrossfeedPro } from '../crossfeedPro';

export const presenceCrossfeedPro = writable<PresenceCrossfeedPro>('inconnue');

/** Interroge l'hôte. Une panne (`inconnue`) laisse l'état tel quel. */
export async function sonderCrossfeedPro(zoneId: number | null | undefined): Promise<PresenceCrossfeedPro> {
  let p: PresenceCrossfeedPro;
  try {
    p = presenceDepuis(await api.getReglageGreffonNatif(CROSSFEED_PRO_ID, zoneId ?? 0));
  } catch (e) {
    p = presenceDepuis(null, e);
  }
  if (p !== 'inconnue') presenceCrossfeedPro.set(p);
  return p;
}

/** Filtre des entrées STUDIO : `crossfeedpro` seulement quand le greffon est
 *  actif ; toute autre vue passe. `inconnue` (pas encore su) ne montre rien. */
export function entreesAvecCrossfeedPro<T extends { view: string }>(
  items: T[],
  presence: PresenceCrossfeedPro,
): T[] {
  return items.filter((it) => it.view !== 'crossfeedpro' || presence === 'actif');
}

/** Crossfeed Pro traite-t-il cette zone (voir `crossfeedProTraite`) ? Une
 *  panne, un greffon absent ou aucune zone rendent `false` : le crossfeed
 *  intégré reste alors réglable, comme avant. */
export async function crossfeedProTraiteLaZone(zoneId: number | null | undefined): Promise<boolean> {
  if (zoneId == null) return false;
  try {
    return crossfeedProTraite(await api.getReglageGreffonNatif(CROSSFEED_PRO_ID, zoneId));
  } catch {
    return false;
  }
}
