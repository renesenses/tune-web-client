/**
 * tune-server-rust#6285 — le badge « hi-res vérifié / douteux » de la fiche
 * album, d'après `GET /library/albums/{id}/hires`.
 *
 * On n'affiche que deux verdicts : `verifie` et `douteux`. « Conforme »
 * (qualité CD sans rien de suspect), « non analysé » et « non concluant » ne
 * montrent RIEN : la passe serveur est désactivée par défaut, et l'absence de
 * mesure ne dit rien du disque. Un serveur antérieur (404) non plus.
 *
 * tune-server-rust#9035 — la raison dit ce qui a été MESURÉ : la fréquence de
 * coupure, et combien de pistes de l'album sont en cause. « Codec avec perte »
 * ne s'écrit que si le serveur a mesuré sa signature (`signature_de_codec`) ;
 * une coupure seule (`coupure_spectrale`) dit « codec avec perte OU filtrage
 * au mastering ». L'ancien code `coupure_de_codec` (serveur d'avant #9035,
 * qui le déduisait de la seule fréquence) se lit comme `coupure_spectrale`.
 */

/** 16100 → « 16,1 kHz » (séparateur de la langue) — même écriture que la fiche technique. */
function frequenceLisible(hz: number, langue: string): string {
  let n: string;
  try {
    n = new Intl.NumberFormat(langue, { maximumFractionDigits: 1 }).format(hz / 1000);
  } catch {
    n = (Math.round(hz / 100) / 10).toString();
  }
  return `${n} kHz`;
}

export interface PisteHiRes {
  track_id?: number | null;
  verdict: string;
  raison?: string | null;
  coupure_hz?: number | null;
}

export interface VerdictHiRes {
  album_id?: number;
  verdict: string;
  raison?: string | null;
  /** #9035 — absents d'un serveur antérieur : recalculés depuis `pistes`. */
  pistes_douteuses?: number | null;
  pistes_mesurees?: number | null;
  coupure_hz?: number | null;
  pistes?: PisteHiRes[];
}

export type BadgeHiRes = {
  genre: 'verifie' | 'douteux';
  cle: string;
  /** La clé de la raison ; celle « avec fréquence » quand `coupureHz` est connue. */
  cleRaison: string | null;
  /** #9035 — la coupure mesurée de l'album, en Hz, quand la raison en a une. */
  coupureHz: number | null;
  /** #9035 — pistes douteuses / pistes mesurées, quand on le sait. */
  pistes: { douteuses: number; mesurees: number } | null;
} | null;

/** #9035 — l'ancien code se publie comme la coupure qu'il était. */
export function raisonNormalisee(raison: string | null | undefined): string | null {
  if (!raison) return null;
  return raison === 'coupure_de_codec' ? 'coupure_spectrale' : raison;
}

/** Les raisons : clé sans fréquence, et clé avec `{freq}` quand elle est mesurée. */
const RAISONS: Record<string, { sans: string; avec?: string }> = {
  bits_de_remplissage: { sans: 'v2.album.hiresWhyBits' },
  bande_de_cd: { sans: 'v2.album.hiresWhyCd', avec: 'v2.album.hiresWhyCdAt' },
  coupure_spectrale: { sans: 'v2.album.hiresWhyCutoffGeneric', avec: 'v2.album.hiresWhyCutoff' },
  signature_de_codec: { sans: 'v2.album.hiresWhyCodecSigGeneric', avec: 'v2.album.hiresWhyCodecSig' },
};

const SPECTRALES = new Set(['bande_de_cd', 'coupure_spectrale', 'signature_de_codec']);

function mediane(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Ce que la fiche montre, ou `null`. */
export function badgeHiRes(v: VerdictHiRes | null | undefined): BadgeHiRes {
  if (!v) return null;
  if (v.verdict === 'verifie') {
    return { genre: 'verifie', cle: 'v2.album.hiresVerified', cleRaison: null, coupureHz: null, pistes: null };
  }
  if (v.verdict !== 'douteux') return null;
  const raison = raisonNormalisee(v.raison);
  const pistes = v.pistes ?? [];
  // La coupure : celle du serveur (#9035), sinon la médiane des pistes
  // douteuses qui portent la raison de l'album (serveur antérieur).
  let coupureHz: number | null = null;
  if (raison && SPECTRALES.has(raison)) {
    coupureHz = typeof v.coupure_hz === 'number' && v.coupure_hz > 0
      ? v.coupure_hz
      : mediane(pistes
        .filter((p) => p.verdict === 'douteux' && raisonNormalisee(p.raison) === raison)
        .map((p) => p.coupure_hz)
        .filter((f): f is number => typeof f === 'number' && f > 0));
  }
  const douteuses = typeof v.pistes_douteuses === 'number'
    ? v.pistes_douteuses
    : pistes.length ? pistes.filter((p) => p.verdict === 'douteux').length : null;
  const mesurees = typeof v.pistes_mesurees === 'number'
    ? v.pistes_mesurees
    : pistes.length ? pistes.filter((p) => p.verdict !== 'non_concluant').length : null;
  const cles = raison ? RAISONS[raison] : undefined;
  return {
    genre: 'douteux',
    cle: 'v2.album.hiresDoubtful',
    cleRaison: cles ? (coupureHz != null && cles.avec ? cles.avec : cles.sans) : null,
    coupureHz,
    pistes: douteuses != null && mesurees != null && douteuses > 0 && mesurees > 0
      ? { douteuses, mesurees }
      : null,
  };
}

/** Le compte court du badge : « 3/10 », ou rien. */
export function compteBadgeHiRes(b: BadgeHiRes): string {
  return b?.pistes ? `${b.pistes.douteuses}/${b.pistes.mesurees}` : '';
}

/**
 * L'infobulle du badge : la raison (avec sa fréquence, dans la langue de
 * l'interface) puis, pour un douteux, combien de pistes sont en cause.
 */
export function infobulleHiRes(b: BadgeHiRes, tr: (cle: string) => string, langue: string): string {
  if (!b) return '';
  const lignes: string[] = [];
  const cle = b.cleRaison ?? (b.genre === 'verifie' ? 'v2.album.hiresVerifiedTip' : null);
  if (cle) {
    const freq = b.coupureHz != null ? frequenceLisible(b.coupureHz, langue) : '';
    lignes.push(tr(cle).replace('{freq}', freq));
  }
  if (b.genre === 'douteux' && b.pistes) {
    lignes.push(tr('v2.album.hiresTracks')
      .replace('{n}', String(b.pistes.douteuses))
      .replace('{total}', String(b.pistes.mesurees)));
  }
  return lignes.join('\n');
}
