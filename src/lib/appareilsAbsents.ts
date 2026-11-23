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
 * rc14 (décision de Bertrand, 23/11) :
 *
 * * le serveur DATE le départ (`absent_since`) et oublie tout seul un
 *   appareil absent depuis la durée réglée (`/devices/forget-policy`, 30 j
 *   par défaut, 0 = jamais) ;
 * * oublier (à la main ou tout seul) ne supprime JAMAIS la zone : elle reste,
 *   hors ligne, marquée « appareil oublié », avec ses réglages ;
 * * la supprimer est un second geste (`?with_zone=true`), confirmé dans la
 *   page, qui nomme la zone et dit que ses réglages partent avec elle.
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
  /** Départ daté par le serveur (RFC 3339), `null` : pas encore vu partir. */
  absent_since?: string | null;
  /** Oublié : sa zone est restée, marquée « appareil oublié ». */
  forgotten?: boolean;
  forgotten_at?: string | null;
  /** Oublié par le serveur, au bout de la durée réglée. */
  forgotten_auto?: boolean;
}

/** La règle d'oubli automatique (`GET /devices/forget-policy`). */
export interface RegleOubli {
  /** 0 : jamais. */
  after_days: number;
  default_days: number;
  max_days: number;
}

/** Les durées proposées (jours) ; 0 = jamais. La valeur du serveur s'y
 *  ajoute si elle n'y est pas (réglée ailleurs). */
export const DUREES_D_OUBLI = [0, 7, 14, 30, 60, 90, 180];

export function dureesProposees(actuelle: number): number[] {
  return DUREES_D_OUBLI.includes(actuelle) ? DUREES_D_OUBLI : [...DUREES_D_OUBLI, actuelle].sort((a, b) => a - b);
}

/** La règle reçue, ou `null` (serveur antérieur, corps illisible). */
export function lireRegle(corps: unknown): RegleOubli | null {
  const c = corps as Partial<RegleOubli> | null;
  if (typeof c?.after_days !== 'number' || c.after_days < 0) return null;
  return {
    after_days: c.after_days,
    default_days: typeof c.default_days === 'number' ? c.default_days : 30,
    max_days: typeof c.max_days === 'number' ? c.max_days : 365,
  };
}

/** Jours entiers écoulés depuis `iso`, `null` si la date manque ou est
 *  illisible (jamais une durée inventée). */
export function joursDepuis(iso: string | null | undefined, maintenant: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((maintenant - t) / 86_400_000));
}

/** Les absents à oublier d'un côté, les oubliés (zone restée) de l'autre. */
export function separer(items: AppareilAbsent[]): { absents: AppareilAbsent[]; oublies: AppareilAbsent[] } {
  return {
    absents: items.filter((i) => !i.forgotten),
    oublies: items.filter((i) => i.forgotten === true),
  };
}

/** Les zones visibles de l'appareil : celles qu'un oubli garde, et que
 *  « Supprimer la zone » emporterait. */
export function zonesVisibles(i: AppareilAbsent): ZoneDeLAppareil[] {
  return i.zones.filter((z) => !z.zone_hidden);
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
