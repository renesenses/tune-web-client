/**
 * Appareils absents — oublier les appareils partis du réseau
 * (tune-server-rust#9044, go de Bertrand le 18/11 pour la rc13).
 *
 * Chaque appareil vu reçoit une zone ; parti du réseau, il restait listé,
 * grisé, à vie, et supprimer sa zone ne faisait que la masquer. Le serveur
 * publie désormais :
 *
 * * `GET    /devices/absent`                       — les appareils connus
 *   (par leur zone) qui ne sont plus là, avec leur dernière réponse ;
 * * `DELETE /devices/{id}?with_zone=true`          — oublier un appareil ET
 *   sa zone (suppression définitive : s'il revient, il revient comme neuf) ;
 * * `POST   /devices/absent/forget?older_than_days=N` — oublier ceux qui
 *   sont absents depuis plus de N jours (7 par défaut).
 *
 * Ce module ne porte que la logique pure : libellé de durée, sélection des
 * appareils visés par l'oubli groupé. Le rendu vit dans `SettingsV2`.
 */

/** Une ligne de `GET /devices/absent`. */
export interface AppareilAbsent {
  device_id: string;
  name: string;
  type: string | null;
  zone_id: number;
  zone_name: string;
  /** La zone avait déjà été supprimée (masquée) par l'utilisateur. */
  zone_hidden: boolean;
  /** Dernière réponse (ISO 8601 UTC), `null` : jamais vue depuis la pose
   *  de la colonne côté serveur. */
  last_seen_at: string | null;
  /** Âge de `last_seen_at` en secondes, calculé par le serveur. */
  absent_for_s: number | null;
}

export interface ReponseAbsents {
  total: number;
  default_older_than_days?: number;
  items: AppareilAbsent[];
}

/** Seuil par défaut de « Oublier les appareils absents ». */
export const JOURS_PAR_DEFAUT = 7;

/** Les lignes reçues, débarrassées de ce qui ne peut pas être oublié (pas
 *  d'identifiant d'appareil). Tolère un corps absent ou malformé : un
 *  serveur antérieur à la route rend 404, l'écran montre alors une liste
 *  vide. */
export function lireAbsents(corps: unknown): AppareilAbsent[] {
  const items = (corps as ReponseAbsents | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.filter((i): i is AppareilAbsent => typeof i?.device_id === 'string' && i.device_id !== '');
}

type Traduire = (cle: string) => string;

/**
 * « absent depuis 3 jours », « absent depuis 5 h », « absent depuis
 * quelques minutes », ou « absent, date inconnue » — dans la langue de
 * l'interface.
 */
export function libelleAbsence(secondes: number | null | undefined, t: Traduire): string {
  if (secondes == null || !Number.isFinite(secondes)) return t('settings.absentSinceUnknown');
  const s = Math.max(0, secondes);
  if (s >= 86_400) {
    const jours = Math.floor(s / 86_400);
    return t(jours === 1 ? 'settings.absentSinceDay' : 'settings.absentSinceDays').replace('{n}', String(jours));
  }
  if (s >= 3600) return t('settings.absentSinceHours').replace('{n}', String(Math.floor(s / 3600)));
  return t('settings.absentSinceMinutes');
}

/** Les appareils que l'oubli groupé emportera : absents depuis au moins
 *  `jours` jours, et DATÉS — même règle que le serveur, qui ne compte pas
 *  une absence dont il ignore le début. Un appareil n'est compté qu'une fois. */
export function absentsAOublier(items: readonly AppareilAbsent[], jours = JOURS_PAR_DEFAUT): AppareilAbsent[] {
  const seuil = Math.max(0, jours) * 86_400;
  const vus = new Set<string>();
  return items.filter((i) => {
    if (i.absent_for_s == null || i.absent_for_s < seuil || vus.has(i.device_id)) return false;
    vus.add(i.device_id);
    return true;
  });
}

/** Le nom à montrer : celui de la zone, sinon l'identifiant. */
export function libelleAbsent(i: AppareilAbsent): string {
  return (i.zone_name ?? '').trim() || (i.name ?? '').trim() || i.device_id;
}
