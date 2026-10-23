/**
 * tune-server-rust#6411 (Dominique Pamingle, fil 2294) — la pochette d'un
 * album dont les disques portent chacun la leur.
 *
 * La liste de la Bibliothèque montrait celle du disque 6, Oxygen celle du
 * disque 1 : deux écrans, deux règles. Le serveur retient la jaquette
 * MAJORITAIRE des pistes (#5454) ; Oxygen prenait celle de la PREMIÈRE piste
 * chargée. Décision de Bertrand du 22/10/2026 : la pochette est la
 * majoritaire. Oxygen applique désormais la même règle aux pistes qu'il a.
 *
 * À égalité, la première rencontrée (l'ordre des pistes) ; aucune pochette :
 * `null`.
 */
export function pochetteMajoritaire(
  pistes: readonly ({ cover_path?: string | null } | null | undefined)[],
): string | null {
  const comptes = new Map<string, number>();
  for (const p of pistes) {
    const c = p?.cover_path?.trim();
    if (c) comptes.set(c, (comptes.get(c) ?? 0) + 1);
  }
  let meilleure: string | null = null;
  let n = 0;
  for (const [c, k] of comptes) {
    if (k > n) {
      meilleure = c;
      n = k;
    }
  }
  return meilleure;
}
