/**
 * tune-server-rust#6285 — le badge « hi-res vérifié / douteux » de la fiche
 * album, d'après `GET /library/albums/{id}/hires`.
 *
 * On n'affiche que deux verdicts : `verifie` et `douteux`. « Conforme »
 * (qualité CD sans rien de suspect), « non analysé » et « non concluant » ne
 * montrent RIEN : la passe serveur est désactivée par défaut, et l'absence de
 * mesure ne dit rien du disque. Un serveur antérieur (404) non plus.
 */
export interface VerdictHiRes {
  album_id?: number;
  verdict: string;
  raison?: string | null;
}

export type BadgeHiRes = { genre: 'verifie' | 'douteux'; cle: string; cleRaison: string | null } | null;

const RAISONS: Record<string, string> = {
  bits_de_remplissage: 'v2.album.hiresWhyBits',
  bande_de_cd: 'v2.album.hiresWhyCd',
  coupure_de_codec: 'v2.album.hiresWhyCodec',
};

/** Ce que la fiche montre, ou `null`. */
export function badgeHiRes(v: VerdictHiRes | null | undefined): BadgeHiRes {
  if (!v) return null;
  if (v.verdict === 'verifie') return { genre: 'verifie', cle: 'v2.album.hiresVerified', cleRaison: null };
  if (v.verdict === 'douteux') {
    return { genre: 'douteux', cle: 'v2.album.hiresDoubtful', cleRaison: (v.raison && RAISONS[v.raison]) || null };
  }
  return null;
}
