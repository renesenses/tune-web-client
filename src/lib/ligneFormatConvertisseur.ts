/**
 * La ligne d'information du format de sortie, sous les pastilles du
 * Convertisseur (#1804).
 *
 * Elle valait `{format} · {sample_rate} · {bit_depth}`, recopiés tels quels du
 * préréglage. Or `/converter/presets` sert `sample_rate: null` pour « Hi-Res
 * (FLAC 24-bit, original sample rate) », et `null` pour la fréquence ET la
 * profondeur des MP3 et des Opus. D'où « FLAC · · 24 » et « MP3 ·  · » —
 * Xavier Joly, 0.9.168 : « les infos de formats ne sont visibles que pour CD
 * Quality, WAV et ALAC ».
 *
 * Désormais la ligne ne contient QUE des morceaux qui disent quelque chose :
 *  - la fréquence quand le préréglage la fixe, sinon « fréquence d'origine »
 *    pour un format sans perte ;
 *  - depuis du DSD, la fréquence RÉELLE de sortie : une source 1 bit n'a pas
 *    de fréquence PCM « d'origine », le serveur en choisit une ;
 *  - la profondeur quand elle est fixée ;
 *  - le débit pour les formats avec perte.
 * Aucun morceau vide, donc aucun séparateur orphelin.
 */
import { estDuDSD } from './utils';

export interface PresetConvertisseur {
  format?: string | null;
  quality?: string | number | null;
  sample_rate?: string | number | null;
  bit_depth?: string | number | null;
  /** Fréquence de sortie d'une source DSD, annoncée par le serveur ≥ #5481
   *  sur le préréglage Hi-Res (176 400). Absente d'un serveur antérieur. */
  dsd_sample_rate?: number | null;
}

/** Ce qu'il faut savoir des albums retenus : leur format et leur fréquence. */
export interface SourceConvertisseur {
  format?: string | null;
  sample_rate?: number | null;
}

export interface TextesLigneFormat {
  /** « fréquence d'origine » */
  originalRate: string;
  /** « DSD → {rate} » */
  fromDsd: string;
  /** « {n} bits » */
  bits: string;
}

const SANS_PERTE = new Set(['flac', 'wav', 'alac', 'aiff']);

function nombre(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * La fréquence PCM que le serveur produit depuis une fréquence DSD.
 *
 * Recopie de `choose_output_rate` (`tune-core/src/audio/dsd_to_pcm.rs`) :
 * 176,4 kHz pour le DSD64, 352,8 kHz à partir du DSD128. Mesurée de bout en
 * bout côté serveur par `le_hi_res_depuis_un_dsd64_sort_en_flac_24_bits_176_4_khz`
 * (renesenses/tune-server-rust#5480) : si le serveur change de règle, ce test-là
 * rougit, et cette fonction doit suivre.
 */
export function frequenceDeSortieDSD(frequenceDSD: number | null | undefined, annoncee?: number | null): number {
  // tune-server-rust#5481 : le serveur annonce désormais SA règle
  // (`dsd_sample_rate`, 176,4 kHz pour tous les rangs DSD) ; on la lit plutôt
  // que de la recopier. La recopie ci-dessous ne sert plus qu'aux serveurs
  // antérieurs, qui ne l'annoncent pas.
  if (annoncee != null && Number.isFinite(annoncee) && annoncee > 0) return annoncee;
  return (frequenceDSD ?? 0) >= 5_000_000 ? 352_800 : 176_400;
}

/**
 * Les morceaux de la ligne, dans l'ordre. `kHz` met en forme une fréquence en
 * kilohertz selon la langue (« 44,1 » / « 44.1 »).
 */
export function morceauxLigneFormat(
  preset: PresetConvertisseur | null | undefined,
  sources: SourceConvertisseur[],
  textes: TextesLigneFormat,
  kHz: (khz: number) => string,
): string[] {
  if (!preset) return [];
  const format = (preset.format ?? '').toLowerCase();
  const morceaux: string[] = [];
  if (format) morceaux.push(format.toUpperCase());

  const frequence = nombre(preset.sample_rate);
  if (frequence != null) {
    morceaux.push(`${kHz(frequence / 1000)} kHz`);
  } else if (SANS_PERTE.has(format)) {
    const dsd = sources.filter((s) => estDuDSD(s.format));
    const sorties = [...new Set(dsd.map((s) => frequenceDeSortieDSD(s.sample_rate, preset.dsd_sample_rate)))].sort((a, b) => a - b);
    // Tout ce qui n'est pas du DSD garde sa fréquence : on le dit. Rien de
    // retenu encore : même chose, c'est ce que le préréglage promet.
    if (dsd.length < sources.length || sources.length === 0) morceaux.push(textes.originalRate);
    if (sorties.length) {
      morceaux.push(textes.fromDsd.replace('{rate}', sorties.map((r) => `${kHz(r / 1000)} kHz`).join(' / ')));
    }
  }

  const profondeur = nombre(preset.bit_depth);
  if (profondeur != null) morceaux.push(textes.bits.replace('{n}', String(profondeur)));

  const qualite = preset.quality == null ? '' : String(preset.quality).toLowerCase();
  if (!SANS_PERTE.has(format) && qualite) {
    if (/^v\d$/.test(qualite)) morceaux.push(`VBR ${qualite.toUpperCase()}`);
    else if (nombre(qualite) != null) morceaux.push(`${format === 'mp3' ? 'CBR ' : ''}${qualite} kbps`);
  }
  return morceaux;
}

export function ligneFormat(...args: Parameters<typeof morceauxLigneFormat>): string {
  return morceauxLigneFormat(...args).join(' · ');
}
