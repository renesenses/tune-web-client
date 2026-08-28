/**
 * Zone du mode kiosque désignée dans l'URL (renesenses/tune-server-rust#2274).
 *
 * Le mode kiosque (`?kiosk`) affiche la lecture en cours en plein écran sur un
 * périphérique fixe — TV, NSPanel, tablette murale. Jusqu'ici la zone affichée
 * venait du seul réglage global : deux écrans ne pouvaient pas montrer deux
 * zones différentes, ce qui est précisément l'usage demandé (fil forum 466).
 *
 * Deux formes sont acceptées :
 *   - `?kiosk&zone=<id>` — la forme principale, alignée sur le mode Grand écran
 *     qui lit déjà `#tv&zone=<id>` ;
 *   - `?kiosk=<id>` — le raccourci suggéré dans la demande, où la valeur du
 *     drapeau `kiosk` est elle-même le numéro de zone.
 * `zone=` l'emporte quand les deux sont présentes.
 *
 * Le contrat existant est préservé mot pour mot : sans paramètre de zone —
 * `?kiosk` nu, ou `?kiosk=true` tel que documenté dans `App.svelte` depuis
 * l'origine — la résolution rend `global` et l'appelant retombe sur la chaîne
 * de sélection habituelle (zone par défaut serveur, préférence locale, zone en
 * lecture, première zone). Rien n'est écrit dans le réglage global.
 *
 * Une zone inconnue ne pilote JAMAIS une autre zone en silence : `currentZoneId`
 * posé sur un identifiant absent ferait retomber le store dérivé `currentZone`
 * sur `zones[0]`, et l'écran commanderait le Salon en croyant commander la zone
 * demandée. On rend `unknown`, l'appelant journalise et retombe explicitement
 * sur le réglage global.
 */
export type KioskZoneResolution =
  /** Aucune zone demandée dans l'URL : repli sur le réglage global, à l'identique d'avant. */
  | { kind: 'global' }
  /** Zone demandée et bien présente dans la liste : elle prend le pas. */
  | { kind: 'pinned'; zoneId: number }
  /** Zone demandée mais introuvable ou invalide : repli explicite sur le réglage global. */
  | { kind: 'unknown'; requested: string };

/** Identifiants de zone : entiers positifs, tels que rendus par `GET /zones`. */
const ZONE_ID = /^\d+$/;

/**
 * Valeur brute de la zone demandée dans la chaîne de requête, ou `null` si
 * l'URL n'en demande aucune.
 *
 * `?kiosk=true` — la forme historique du drapeau — n'est pas une demande de
 * zone : sans ce filtre, toutes les URLs kiosque existantes basculeraient en
 * « zone inconnue » du jour au lendemain.
 */
function readZoneParam(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  const zone = params.get('zone');
  if (zone) return zone;

  const kiosk = params.get('kiosk');
  if (kiosk && ZONE_ID.test(kiosk)) return kiosk;

  return null;
}

/**
 * Résout la zone du mode kiosque à partir de l'URL, confrontée à la liste
 * réelle des zones.
 *
 * @param search chaîne de requête, avec ou sans le « ? » de tête
 * @param zoneList les zones telles que rendues par le serveur
 */
export function resolveKioskZone(
  search: string,
  zoneList: ReadonlyArray<{ id: number | null }>,
): KioskZoneResolution {
  const requested = readZoneParam(search);
  if (requested === null) return { kind: 'global' };

  if (!ZONE_ID.test(requested)) return { kind: 'unknown', requested };

  const zoneId = Number(requested);
  const exists = zoneList.some((z) => z.id === zoneId);
  return exists ? { kind: 'pinned', zoneId } : { kind: 'unknown', requested };
}
