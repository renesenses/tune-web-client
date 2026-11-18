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
 * — et encore, prudemment : « des trous intermittents COMPATIBLES avec un
 * codec avec perte » (décision du 18/11, en attendant un calibrage sur de
 * vrais fichiers) ; une coupure seule (`coupure_spectrale`) dit « codec avec perte OU filtrage
 * au mastering ». L'ancien code `coupure_de_codec` (serveur d'avant #9035,
 * qui le déduisait de la seule fréquence) se lit comme `coupure_spectrale`.
 *
 * Décision de Bertrand du 18/11/2026 (fil 2902) : un album n'est « Hi-res
 * douteux » qu'à partir de la MOITIÉ de ses pistes mesurées. En dessous, le
 * badge dit « N pistes douteuses » (genre `pistes`), avec la raison et la
 * coupure au survol. Un serveur antérieur, qui rend l'album douteux dès une
 * piste, est corrigé ici quand ses `pistes` permettent de compter.
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
  sample_rate?: number | null;
  bits_declares?: number | null;
}

/**
 * tune-server-rust#9067 — le verdict EFFECTIF d'une piste : un fichier qui ne
 * se dit pas hi-res (16 bits, 48 kHz au plus) n'est jamais « Hi-Res douteux ».
 * Un serveur antérieur le rend encore douteux ; on le lit conforme, comme le
 * serveur à jour.
 */
export function verdictEffectif(p: PisteHiRes): string {
  if (p.verdict === 'douteux' && typeof p.sample_rate === 'number'
    && p.sample_rate <= 48000 && (p.bits_declares ?? 16) <= 16) return 'conforme';
  return p.verdict;
}

export interface VerdictHiRes {
  album_id?: number;
  verdict: string;
  raison?: string | null;
  /** #9035 — absents d'un serveur antérieur : recalculés depuis `pistes`. */
  pistes_douteuses?: number | null;
  pistes_mesurees?: number | null;
  /** #9035 — la raison la plus fréquente des pistes douteuses, l'album douteux ou non. */
  raison_pistes?: string | null;
  coupure_hz?: number | null;
  pistes?: PisteHiRes[];
}

export type BadgeHiRes = {
  /** `pistes` (#9035) : l'album n'est pas douteux, mais des pistes le sont. */
  genre: 'verifie' | 'douteux' | 'pistes';
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

/** #9035 — la règle de la moitié, la même que celle du serveur. */
export function albumMajoritairementDouteux(douteuses: number, mesurees: number): boolean {
  return douteuses > 0 && 2 * douteuses >= mesurees;
}

function raisonLaPlusFrequente(pistes: PisteHiRes[]): string | null {
  const comptes = new Map<string, number>();
  for (const p of pistes) {
    const r = p.verdict === 'douteux' ? raisonNormalisee(p.raison) : null;
    if (r) comptes.set(r, (comptes.get(r) ?? 0) + 1);
  }
  // Même départage que le serveur (`max_by_key` sur un ordre alphabétique) :
  // à égalité, la DERNIÈRE raison dans l'ordre alphabétique (octets).
  let meilleure: string | null = null;
  for (const [r, n] of [...comptes.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (meilleure == null || n >= (comptes.get(meilleure) ?? 0)) meilleure = r;
  }
  return meilleure;
}

/** Ce que la fiche montre, ou `null`. */
export function badgeHiRes(v: VerdictHiRes | null | undefined): BadgeHiRes {
  if (!v) return null;
  const pistes = (v.pistes ?? []).map((p) => ({ ...p, verdict: verdictEffectif(p) }));
  const douteuses = typeof v.pistes_douteuses === 'number'
    ? v.pistes_douteuses
    : pistes.length ? pistes.filter((p) => p.verdict === 'douteux').length : null;
  const mesurees = typeof v.pistes_mesurees === 'number'
    ? v.pistes_mesurees
    // #9067 — la moitié se compte sur les pistes qui se disent hi-res.
    : pistes.length ? pistes.filter((p) => p.verdict === 'verifie' || p.verdict === 'douteux').length : null;
  const comptes = douteuses != null && mesurees != null && douteuses > 0 && mesurees > 0
    ? { douteuses, mesurees }
    : null;
  // Douteux, sauf quand le compte dit moins de la moitié, ou plus aucune
  // piste douteuse une fois les CD lus conformes (serveur antérieur, #9067).
  const sansDouteuseEffective = v.verdict === 'douteux' && pistes.length > 0 && douteuses === 0;
  const albumDouteux = v.verdict === 'douteux' && !sansDouteuseEffective
    && (comptes == null || albumMajoritairementDouteux(comptes.douteuses, comptes.mesurees));
  const minorite = !albumDouteux && comptes != null
    && (v.verdict === 'douteux' || v.verdict === 'verifie' || v.verdict === 'conforme' || v.verdict === 'non_analyse');
  if (v.verdict === 'verifie' && !minorite) {
    return { genre: 'verifie', cle: 'v2.album.hiresVerified', cleRaison: null, coupureHz: null, pistes: null };
  }
  if (!albumDouteux && !minorite) return null;
  const raison = raisonNormalisee(v.raison_pistes)
    ?? (albumDouteux ? raisonNormalisee(v.raison) : null)
    ?? raisonLaPlusFrequente(pistes)
    ?? raisonNormalisee(v.raison);
  // La coupure : celle du serveur (#9035), sinon la médiane des pistes
  // douteuses qui portent cette raison (serveur antérieur).
  let coupureHz: number | null = null;
  if (raison && SPECTRALES.has(raison)) {
    coupureHz = typeof v.coupure_hz === 'number' && v.coupure_hz > 0
      ? v.coupure_hz
      : mediane(pistes
        .filter((p) => p.verdict === 'douteux' && raisonNormalisee(p.raison) === raison)
        .map((p) => p.coupure_hz)
        .filter((f): f is number => typeof f === 'number' && f > 0));
  }
  const cles = raison ? RAISONS[raison] : undefined;
  return {
    genre: albumDouteux ? 'douteux' : 'pistes',
    cle: albumDouteux
      ? 'v2.album.hiresDoubtful'
      : comptes!.douteuses === 1 ? 'v2.album.hiresDoubtfulTrack' : 'v2.album.hiresDoubtfulTracks',
    cleRaison: cles ? (coupureHz != null && cles.avec ? cles.avec : cles.sans) : null,
    coupureHz,
    pistes: comptes,
  };
}

/** Le texte du badge : « Hi-res douteux », ou « 2 pistes douteuses » (#9035). */
export function libelleBadgeHiRes(b: BadgeHiRes, tr: (cle: string) => string): string {
  if (!b) return '';
  return tr(b.cle).replace('{n}', String(b.pistes?.douteuses ?? ''));
}

/** Le compte court d'un album douteux : « 6/10 », ou rien (le badge `pistes` le dit déjà). */
export function compteBadgeHiRes(b: BadgeHiRes): string {
  return b?.genre === 'douteux' && b.pistes ? `${b.pistes.douteuses}/${b.pistes.mesurees}` : '';
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
  if (b.genre !== 'verifie' && b.pistes) {
    lignes.push(tr('v2.album.hiresTracks')
      .replace('{n}', String(b.pistes.douteuses))
      .replace('{total}', String(b.pistes.mesurees)));
  }
  return lignes.join('\n');
}
