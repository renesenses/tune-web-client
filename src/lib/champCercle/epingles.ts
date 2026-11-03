/**
 * Tune Circle — les épingles posées au MÊME lieu (tune-web-client#2611).
 *
 * Une ville est arrondie à environ 50 km : deux contacts de la même ville ont
 * exactement les mêmes coordonnées, leurs épingles se dessinaient l'une sur
 * l'autre et leurs étiquettes (nom + ville) devenaient illisibles. On les
 * étage verticalement à l'écran, centrées sur le lieu, d'un écart qui laisse
 * la place à une étiquette de deux lignes. Fonction pure, sans DOM.
 */

/** Écart vertical, en pixels, entre deux épingles d'un même lieu. */
export const ECART_EPINGLES = 32;

export interface EpingleLieu {
  id: string;
  lat: number;
  lon: number;
  me?: boolean;
}

/** Deux lieux à moins d'environ 60 m l'un de l'autre sont le même lieu. */
const cleLieu = (p: EpingleLieu) => `${Math.round(p.lat * 1e5)}:${Math.round(p.lon * 1e5)}`;

/**
 * Le décalage [dx, dy] à l'écran de chaque épingle. Une épingle seule à son
 * lieu n'en a pas ; les épingles d'un même lieu s'étagent, la mienne en tête,
 * les autres dans l'ordre de leurs identifiants (stable d'une image à l'autre).
 */
export function decalagesEpingles(epingles: readonly EpingleLieu[], ecart = ECART_EPINGLES): Map<string, [number, number]> {
  const groupes = new Map<string, EpingleLieu[]>();
  for (const p of epingles) {
    const k = cleLieu(p);
    const g = groupes.get(k);
    if (g) g.push(p); else groupes.set(k, [p]);
  }
  const out = new Map<string, [number, number]>();
  for (const g of groupes.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (a.me ? -1 : b.me ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    g.forEach((p, i) => out.set(p.id, [0, (i - (g.length - 1) / 2) * ecart]));
  }
  return out;
}
