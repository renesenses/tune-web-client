/**
 * Plages MAC reconnues — renesenses/tune-web-client#2244, serveur
 * renesenses/tune-server-rust#6546.
 *
 * Tune reconnaît la marque d'un appareil audio par les trois premiers octets
 * de sa MAC (l'OUI). Le serveur publie, pour chaque appareil, la plage
 * reconnue (`mac_prefix`, `AA:BB:CC`) et la marque que sa table y associe
 * (`mac_vendor`), et la table entière par `GET /devices/oui-audio`.
 *
 * Ce module ne recopie pas la table : il lit ce que le serveur publie et le
 * met en forme. Un serveur antérieur ne publie ni les champs ni la route —
 * tout ce qui suit rend alors `null`, et l'écran n'affiche rien de plus
 * qu'avant.
 */

/** Ce que `GET /devices/oui-audio` rend. */
export interface MarqueOui {
  name: string;
  prefixes: string[];
}
export interface TableOuiAudio {
  vendors: MarqueOui[];
  total: number;
}

/** Les champs que le serveur ajoute à une entrée de `GET /devices`. */
export interface AvecPlageMac {
  mac_prefix?: string | null;
  mac_vendor?: string | null;
}

/**
 * Ce que l'écran dit de la MAC d'un appareil :
 * - `connue` : plage reconnue et marque ;
 * - `hors-table` : la MAC est lue, sa plage n'est pas dans la table ;
 * - `sans-mac` : le serveur n'a pas de MAC pour cet appareil.
 *
 * `null` : le serveur ne publie pas ces champs (serveur ancien) — rien à
 * afficher, et surtout pas « MAC inconnue », qui serait faux.
 */
export type EtatPlage =
  | { etat: 'connue'; plage: string; marque: string }
  | { etat: 'hors-table'; plage: string }
  | { etat: 'sans-mac' };

export function etatPlage(d: AvecPlageMac): EtatPlage | null {
  if (!('mac_prefix' in d)) return null;
  const plage = typeof d.mac_prefix === 'string' && d.mac_prefix.trim() ? d.mac_prefix.trim() : null;
  if (!plage) return { etat: 'sans-mac' };
  const marque = typeof d.mac_vendor === 'string' && d.mac_vendor.trim() ? d.mac_vendor.trim() : null;
  return marque ? { etat: 'connue', plage, marque } : { etat: 'hors-table', plage };
}

/** `70:B3:D5` → `70:B3:D5:xx:xx:xx` : la plage, jamais la MAC complète. */
export function plageAffichee(prefixe: string): string {
  return `${prefixe.toUpperCase()}:xx:xx:xx`;
}

/**
 * La réponse de la route, si elle a la forme attendue. Tout le reste —
 * 404 d'un serveur ancien, corps inattendu — rend `null`.
 */
export function lireTableOui(corps: unknown): TableOuiAudio | null {
  if (!corps || typeof corps !== 'object') return null;
  const c = corps as { vendors?: unknown; total?: unknown };
  if (!Array.isArray(c.vendors)) return null;
  const vendors: MarqueOui[] = [];
  for (const v of c.vendors) {
    if (!v || typeof v !== 'object') continue;
    const { name, prefixes } = v as { name?: unknown; prefixes?: unknown };
    if (typeof name !== 'string' || !Array.isArray(prefixes)) continue;
    vendors.push({ name, prefixes: prefixes.filter((p): p is string => typeof p === 'string') });
  }
  if (vendors.length === 0) return null;
  const total = typeof c.total === 'number'
    ? c.total
    : vendors.reduce((n, v) => n + v.prefixes.length, 0);
  return { vendors, total };
}

/** Les chiffres hexadécimaux seuls, en majuscules : `70-b3:d5` → `70B3D5`. */
function hexSeul(s: string): string {
  return s.replace(/[^0-9a-f]/gi, '').toUpperCase();
}

/**
 * La table filtrée par une recherche, par marque OU par préfixe.
 *
 * - Une marque dont le nom contient la recherche est gardée entière.
 * - Sinon, une recherche qui ressemble à un préfixe (`70:B3`, `70b3d5`,
 *   `70-B3-D5`, une MAC complète collée) ne garde que les plages qui
 *   commencent par elle — et une MAC complète trouve sa plage.
 *
 * Recherche vide : la table entière.
 */
export function filtrerTable(table: TableOuiAudio, recherche: string): MarqueOui[] {
  const q = recherche.trim();
  if (!q) return table.vendors;
  const qNom = q.toLocaleLowerCase();
  const qHex = /^[0-9a-f:\-.\s]+$/i.test(q) ? hexSeul(q) : '';
  const out: MarqueOui[] = [];
  for (const v of table.vendors) {
    if (v.name.toLocaleLowerCase().includes(qNom)) {
      out.push(v);
      continue;
    }
    if (!qHex) continue;
    const plages = v.prefixes.filter((p) => {
      const h = hexSeul(p);
      return qHex.length <= h.length ? h.startsWith(qHex) : qHex.startsWith(h);
    });
    if (plages.length) out.push({ name: v.name, prefixes: plages });
  }
  return out;
}
