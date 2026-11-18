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

/** Les unités, abrégées à l'écran ; leur nom complet est dans l'i18n. */
export type Unite = 'LUFS' | 'LU' | 'dBFS' | 'dBTP';

/** Clé i18n du nom complet d'une unité (`<abbr title>` et lecteurs d'écran). */
export function cleUnite(u: Unite): string {
  return `fiche.dyn.unit.${u}`;
}

export interface LigneDynamique {
  /** Clé i18n du libellé. */
  cle: string;
  /** Valeur mise en forme, sans unité. */
  valeur: string;
  unite: Unite;
}

/** Un morceau de la ligne d'album : « LRA » éventuel, valeur, unité. */
export interface MorceauResume {
  prefixe?: string;
  valeur: string;
  unite: Unite;
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
  if (nombre(d.integree_lufs)) l.push({ cle: 'fiche.dyn.loudness', valeur: dixieme(d.integree_lufs, langue), unite: 'LUFS' });
  if (nombre(d.lra_lu)) l.push({ cle: 'fiche.dyn.lra', valeur: dixieme(d.lra_lu, langue), unite: 'LU' });
  if (nombre(d.crete_echantillon_dbfs)) l.push({ cle: 'fiche.dyn.samplePeak', valeur: dixieme(d.crete_echantillon_dbfs, langue, true), unite: 'dBFS' });
  if (nombre(d.crete_vraie_dbtp)) l.push({ cle: 'fiche.dyn.truePeak', valeur: dixieme(d.crete_vraie_dbtp, langue, true), unite: 'dBTP' });
  return l;
}

/** La ligne compacte de l'en-tête d'album : « −14,0 LUFS · LRA 10,0 LU · +1,0 dBTP ».
 *  Vide quand rien n'est mesuré. */
export function resumeDynamiqueAlbum(d: DynamiqueAlbum | null | undefined, langue: string): MorceauResume[] {
  if (!d) return [];
  const p: MorceauResume[] = [];
  if (nombre(d.integree_lufs)) p.push({ valeur: dixieme(d.integree_lufs, langue), unite: 'LUFS' });
  if (nombre(d.lra_lu)) p.push({ prefixe: 'LRA', valeur: dixieme(d.lra_lu, langue), unite: 'LU' });
  if (nombre(d.crete_vraie_dbtp)) p.push({ valeur: dixieme(d.crete_vraie_dbtp, langue, true), unite: 'dBTP' });
  return p;
}

/** Le texte brut d'une ligne d'album (tests, lecture hors écran). */
export function texteResume(m: MorceauResume[]): string | null {
  return m.length ? m.map((x) => `${x.prefixe ? `${x.prefixe} ` : ''}${x.valeur} ${x.unite}`).join(' · ') : null;
}
