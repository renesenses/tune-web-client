/**
 * renesenses/tune-server-rust#6300 (Lulu, fil 2205) — retirer un album en
 * double EN ENTIER, au lieu de piste par piste dans Métadonnées › Doublons.
 *
 * Le serveur fait porter à chaque copie d'une paire son album (`album_id`,
 * `album_title`). On regroupe ici les paires par COUPLE d'albums distincts :
 * chaque groupe offre « garder cet album, retirer l'autre ». Les paires d'un
 * même album, ou sans album connu, restent dans la liste piste par piste.
 */
import type { PaireDoublonNommee } from './api';

export interface CoteAlbum { album_id: number; title: string }
export interface CoupleAlbums { cle: string; a: CoteAlbum; b: CoteAlbum; paires: number }

/** Les couples d'albums distincts, dans l'ordre de première apparition. */
export function grouperParAlbums(paires: PaireDoublonNommee[]): CoupleAlbums[] {
  const couples = new Map<string, CoupleAlbums>();
  for (const p of paires) {
    const ia = p.a.album_id;
    const ib = p.b.album_id;
    if (ia == null || ib == null || ia === ib) continue;
    // Le couple ne dépend pas du sens de la paire : (A, B) et (B, A) sont un.
    const [a, b] = ia < ib
      ? [{ album_id: ia, title: p.a.album_title ?? '' }, { album_id: ib, title: p.b.album_title ?? '' }]
      : [{ album_id: ib, title: p.b.album_title ?? '' }, { album_id: ia, title: p.a.album_title ?? '' }];
    const cle = `${a.album_id}:${b.album_id}`;
    const deja = couples.get(cle);
    if (deja) deja.paires += 1;
    else couples.set(cle, { cle, a, b, paires: 1 });
  }
  return [...couples.values()];
}

/** Le texte de la confirmation, à partir du plan rendu par le serveur. */
export function questionDeRetrait(
  modele: string,
  plan: { garde: { title: string }; retire: { title: string; pistes: number; pistes_sans_equivalent: number } },
): string {
  return modele
    .replace('{keep}', plan.garde.title)
    .replace('{remove}', plan.retire.title)
    .replace('{n}', String(plan.retire.pistes))
    .replace('{sans}', String(plan.retire.pistes_sans_equivalent));
}
