/**
 * La DYNAMIQUE d'une piste et d'un album — tune-server-rust#9040 (go de
 * Bertrand du 18/11, forum fil 2902).
 *
 * Sonie intégrée (LUFS), plage de sonie EBU R128 (LRA, en LU), crête
 * d'échantillon (dBFS) et crête vraie (dBTP), mesurées par Tune. Le DR garde
 * sa propre section et son propre badge (#1388, #8160) : il n'est pas répété
 * ici. Informatif, jamais un verdict : aucun seuil, aucune couleur.
 *
 * Piste : section `dynamique` de `GET /library/tracks/{id}/fiche-technique`.
 * Album : `GET /library/albums/{id}/dynamique` ; un serveur antérieur rend 404
 * et rien ne s'affiche.
 */

export interface SectionDynamique {
  integree_lufs?: number | null;
  crete_echantillon_dbfs?: number | null;
  crete_vraie_dbtp?: number | null;
  lra_lu?: number | null;
  sonie_algo?: string | null;
  sonie_mesuree_le?: string | null;
  lra_algo?: string | null;
  lra_mesuree_le?: string | null;
}

export interface DynamiqueAlbum extends SectionDynamique {
  album_id: number;
  pistes: number;
  dr?: number | null;
  dr_du_tag_d_album?: boolean | null;
  /** Pistes dont la LRA est mesurée ; celle de l'album attend toutes les pistes. */
  lra_pistes_mesurees?: number;
}

export interface LigneDynamique {
  /** Clé i18n du libellé. */
  cle: string;
  /** Valeur et unité, déjà mises en forme. */
  texte: string;
}

/** Un dixième, dans la langue de l'interface ; `signe` : « +1,0 » au-dessus de 0. */
export function dixieme(v: number, langue: string, signe = false): string {
  try {
    return new Intl.NumberFormat(langue, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: signe ? 'exceptZero' : 'auto',
    }).format(v);
  } catch {
    return (signe && v > 0 ? '+' : '') + v.toFixed(1);
  }
}

const nombre = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Les lignes à afficher, dans l'ordre ; vide si rien n'est mesuré. */
export function lignesDynamique(d: SectionDynamique | null | undefined, langue: string): LigneDynamique[] {
  if (!d) return [];
  const l: LigneDynamique[] = [];
  if (nombre(d.integree_lufs)) l.push({ cle: 'fiche.dyn.loudness', texte: `${dixieme(d.integree_lufs, langue)} LUFS` });
  if (nombre(d.lra_lu)) l.push({ cle: 'fiche.dyn.lra', texte: `${dixieme(d.lra_lu, langue)} LU` });
  if (nombre(d.crete_echantillon_dbfs)) l.push({ cle: 'fiche.dyn.samplePeak', texte: `${dixieme(d.crete_echantillon_dbfs, langue, true)} dBFS` });
  if (nombre(d.crete_vraie_dbtp)) l.push({ cle: 'fiche.dyn.truePeak', texte: `${dixieme(d.crete_vraie_dbtp, langue, true)} dBTP` });
  return l;
}

/** La ligne compacte de l'en-tête d'album : « −14,0 LUFS · LRA 10,0 LU · +1,0 dBTP ». */
export function resumeDynamiqueAlbum(d: DynamiqueAlbum | null | undefined, langue: string): string | null {
  if (!d) return null;
  const p: string[] = [];
  if (nombre(d.integree_lufs)) p.push(`${dixieme(d.integree_lufs, langue)} LUFS`);
  if (nombre(d.lra_lu)) p.push(`LRA ${dixieme(d.lra_lu, langue)} LU`);
  if (nombre(d.crete_vraie_dbtp)) p.push(`${dixieme(d.crete_vraie_dbtp, langue, true)} dBTP`);
  return p.length ? p.join(' · ') : null;
}
