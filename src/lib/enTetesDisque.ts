/**
 * Les en-têtes « Disque N » d'une liste de pistes — #1431.
 *
 * Marco Polo, fil 1885 : les pistes d'un coffret réuni « s'enchaînent »
 * sans dire de quel disque elles viennent ; il demande un en-tête par disque,
 * comme le fait déjà la vue Oxygen (`OxygenView.discGroups`).
 *
 * ## On n'ordonne RIEN, on annonce
 *
 * La liste arrive déjà triée par disque puis par piste
 * (`track_repo::list_by_album`, `ORDER BY CAST(disc_number AS INTEGER), …`).
 * Regrouper ici — un `Map` par disque, comme Oxygen — pourrait déplacer des
 * lignes, et le rang d'une ligne est ce que la fiche passe à `playAlbum(i)` :
 * une ligne déplacée jouerait une autre piste. On se contente donc de dire,
 * pour chaque rang, s'il ouvre un nouveau disque.
 *
 * ## La règle de repli est celle d'Oxygen
 *
 * Un album d'UN seul disque sans sous-titre ne reçoit aucun en-tête : « Disque
 * 1 » au-dessus de dix pistes serait du bruit. Dès qu'il y a deux disques, ou
 * un sous-titre (DISCSUBTITLE), chaque disque est annoncé.
 *
 * Un `disc_number` absent vaut 1 : la colonne peut être nulle en base
 * (`COALESCE(t.disc_number, 1)` côté serveur).
 */
import type { Track } from './types';

export interface EnTeteDisque {
  disque: number;
  sousTitre: string | null;
}

const disqueDe = (p: Track): number => p.disc_number || 1;
const sousTitreDe = (p: Track): string | null => (p.disc_subtitle ?? '').trim() || null;

/**
 * Pour chaque rang, l'en-tête à poser AVANT la ligne, ou `null`.
 * Toujours de la même longueur que `pistes`.
 */
export function enTetesDisque(pistes: readonly Track[]): (EnTeteDisque | null)[] {
  const aucun = pistes.map(() => null);
  if (!pistes.length) return aucun;
  const disques = new Set(pistes.map(disqueDe));
  const unSousTitre = pistes.some((p) => sousTitreDe(p) != null);
  if (disques.size < 2 && !unSousTitre) return aucun;

  const out: (EnTeteDisque | null)[] = [];
  for (let i = 0; i < pistes.length; i++) {
    const d = disqueDe(pistes[i]);
    if (i > 0 && disqueDe(pistes[i - 1]) === d) { out.push(null); continue; }
    // Le sous-titre du disque : le premier que porte une de ses pistes.
    let sousTitre: string | null = null;
    for (let j = i; j < pistes.length && disqueDe(pistes[j]) === d; j++) {
      sousTitre = sousTitreDe(pistes[j]);
      if (sousTitre) break;
    }
    out.push({ disque: d, sousTitre });
  }
  return out;
}
