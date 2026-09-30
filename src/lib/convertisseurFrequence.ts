/**
 * La fréquence de sortie du Convertisseur (tune-server-rust#5481).
 *
 * Xavier Joly, 0.9.168 : « L'encodage en Hi-Res se fait en 24/96 ce qui n'est
 * pas précisé [...] ceux qui veulent convertir des DSD en Flac préféreraient
 * du 24/192. »
 *
 * Le serveur (≥ #5481) sort un DSD en 176,4 kHz par défaut — la classe 192 de
 * la famille 44,1, à rapport de décimation entier — et le dit dans
 * `/converter/presets` : `dsd_sample_rate` sur le préréglage Hi-Res, avec
 * `sample_rate_choices`, les fréquences que l'écran peut proposer à la place
 * de « Auto ». Après la conversion, `/status` rend `output_formats`, relus sur
 * les fichiers écrits.
 */

export interface PresetFrequence {
  format?: string | null;
  sample_rate?: string | number | null;
  dsd_sample_rate?: number | null;
  sample_rate_choices?: number[] | null;
}

export interface FormatEcrit {
  sample_rate?: number | null;
  bit_depth?: number | null;
}

/** Les fréquences proposées pour ce préréglage, ou `[]` s'il n'en propose
 *  pas (fréquence fixée, format avec perte, serveur antérieur à #5481). */
export function frequencesProposees(preset: PresetFrequence | null | undefined): number[] {
  if (!preset || (preset.sample_rate != null && preset.sample_rate !== '')) return [];
  const choix = Array.isArray(preset.sample_rate_choices) ? preset.sample_rate_choices : [];
  return [...new Set(choix.filter((f) => Number.isFinite(f) && f > 0))].sort((a, b) => a - b);
}

/** Le préréglage tel qu'il sera envoyé : la fréquence choisie remplace
 *  « Auto » quand ce préréglage la propose. */
export function presetEffectif<P extends PresetFrequence>(preset: P, choisie: number | null): P {
  if (choisie == null || !frequencesProposees(preset).includes(choisie)) return preset;
  return { ...preset, sample_rate: choisie };
}

/** « FLAC 24 bits · 176,4 kHz » — ce que le serveur a réellement écrit. Vide
 *  quand il ne l'a pas dit (serveur antérieur à #5481). */
export function ligneFormatsEcrits(
  format: string | null | undefined,
  formats: FormatEcrit[] | null | undefined,
  bits: string,
  kHz: (khz: number) => string,
): string {
  if (!formats?.length) return '';
  const parties = formats
    .filter((f) => f.sample_rate)
    .map((f) => [f.bit_depth ? bits.replace('{n}', String(f.bit_depth)) : '', `${kHz(f.sample_rate! / 1000)} kHz`]
      .filter(Boolean).join(' · '));
  const uniques = [...new Set(parties)];
  if (!uniques.length) return '';
  return [(format ?? '').toUpperCase(), uniques.join(' / ')].filter(Boolean).join(' ');
}
