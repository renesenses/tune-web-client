/**
 * Appareils absents — oublier les appareils partis du réseau
 * (tune-server-rust#9044, go de Bertrand le 18/11 pour la rc13).
 *
 * Chaque appareil vu reçoit une zone ; parti du réseau, il restait listé,
 * grisé, à vie, et supprimer sa zone ne faisait que la masquer. Le serveur
 * publie désormais :
 *
 * * `GET    /devices/absent`               — les appareils connus qui ne sont
 *   plus là, un par appareil, avec TOUTES les zones qu'un oubli emporterait ;
 * * `DELETE /devices/{id}?with_zone=true`  — oublier un appareil ET ses zones
 *   (suppression définitive : s'il revient, il revient comme neuf).
 *
 * En rc13 : un appareil à la fois, et SANS durée d'absence — le serveur ne
 * date pas encore le départ du réseau (l'oubli groupé et « absent depuis »
 * viendront ensemble, rc14).
 *
 * Ce module ne porte que la logique pure. Le rendu vit dans `SettingsV2`.
 */

/** Une zone qu'un oubli emporterait. */
export interface ZoneDeLAppareil {
  zone_id: number;
  zone_name: string;
  /** Déjà supprimée (masquée) par l'utilisateur. */
  zone_hidden: boolean;
}

/** Une ligne de `GET /devices/absent`. */
export interface AppareilAbsent {
  device_id: string;
  /** Nom de la zone qui le représente (une visible d'abord). */
  name: string;
  type: string | null;
  /** La zone qui le représente : clé stable de la ligne. */
  zone_id: number;
  zones: ZoneDeLAppareil[];
}

/** Les lignes reçues, débarrassées de ce qui ne peut pas être oublié. Un
 *  corps sans `items` (serveur antérieur à la route : 404) donne `[]`. */
export function lireAbsents(corps: unknown): AppareilAbsent[] {
  const items = (corps as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((i): i is AppareilAbsent => typeof i?.device_id === 'string' && i.device_id !== '' && typeof i?.zone_id === 'number')
    .map((i) => ({ ...i, zones: Array.isArray(i.zones) ? i.zones : [] }));
}

/** Le nom à montrer pour la ligne : celui de sa zone, sinon l'identifiant. */
export function libelleAbsent(i: AppareilAbsent): string {
  return (i.name ?? '').trim() || i.device_id;
}

/** L'appareil lui-même, nommé par son protocole et son identifiant — ce que
 *  la confirmation doit dire en plus des zones. */
export function libelleAppareil(i: AppareilAbsent, protocole: (type: string) => string): string {
  return i.type ? `${protocole(i.type)} · ${i.device_id}` : i.device_id;
}

/** Les zones qui partiront, nommées, celles déjà supprimées marquées. */
export function zonesNommees(i: AppareilAbsent, dejaSupprimee: string): string {
  return i.zones
    .map((z) => `« ${(z.zone_name ?? '').trim() || `#${z.zone_id}`} »${z.zone_hidden ? ` (${dejaSupprimee})` : ''}`)
    .join(', ');
}
