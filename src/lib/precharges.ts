/**
 * Le registre des requêtes préchargées — tune-server-rust#7619, volet L5.
 *
 * `api.prechargerAlbum` y dépose une requête lancée au survol d'une fiche ;
 * `api.getAlbum` et `api.getAlbumTracks` l'y reprennent, UNE fois, tant
 * qu'elle a moins de `DUREE_PRECHARGE_MS`. Une modification de la
 * bibliothèque vide le registre (`oublierPrecharges`, appelé par
 * `invaliderBibliotheque`).
 *
 * Module sans dépendance : le magasin paginé l'importe sans tirer `api.ts`.
 */
export const DUREE_PRECHARGE_MS = 30_000;
export const PLAFOND_PRECHARGES = 40;

const precharges = new Map<string, { p: Promise<unknown>; t: number }>();

/** Lance `charger()` et range sa promesse sous `url`, si rien n'y est déjà. */
export function deposerPrecharge(url: string, charger: () => Promise<unknown>, maintenant = Date.now()): void {
  const deja = precharges.get(url);
  if (deja && maintenant - deja.t <= DUREE_PRECHARGE_MS) return;
  const p = charger();
  p.catch(() => { /* rendu à l'appelant par `retirerPrecharge` */ });
  precharges.delete(url);
  precharges.set(url, { p, t: maintenant });
  while (precharges.size > PLAFOND_PRECHARGES) {
    const plusVieille = precharges.keys().next().value;
    if (plusVieille === undefined) break;
    precharges.delete(plusVieille);
  }
}

/** La promesse préchargée pour `url`, retirée du registre ; `null` si absente ou trop vieille. */
export function retirerPrecharge<T>(url: string, maintenant = Date.now()): Promise<T> | null {
  const e = precharges.get(url);
  if (!e) return null;
  precharges.delete(url);
  if (maintenant - e.t > DUREE_PRECHARGE_MS) return null;
  return e.p as Promise<T>;
}

/** La bibliothèque a changé : ce qui a été préchargé ne vaut plus. */
export function oublierPrecharges(): void {
  precharges.clear();
}
