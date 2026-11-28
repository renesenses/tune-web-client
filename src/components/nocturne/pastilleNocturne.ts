/**
 * Pastille haute résolution des tuiles Nocturne (décision du 26/11/2026) :
 * un texte court posé sur la pochette, SEULEMENT quand la source dépasse
 * 16 bits / 48 kHz — ou qu'elle est en DSD.
 *
 *  - DSD : « DSD64 », « DSD128 »… (multiple de 44,1 kHz), « DSD » sans fréquence ;
 *  - PCM : « 24/96 », « 24/192 », « 24/44 » (bits / kHz, kHz tronqués comme
 *    dans les lignes de pistes) ;
 *  - palier Hi-Res sans résolution connue : « Hi-Res ».
 *
 * Un codec avec perte, ou indéterminé, n'en porte jamais (règle de palier
 * commune à Tune : `getQualityTier`).
 */
import { getQualityTier } from '../../lib/utils';

export interface SourceAudio {
  format?: string | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
  source?: string | null;
}

export interface Pastille {
  texte: string;
  dsd: boolean;
}

export function pastilleHauteResolution(a: SourceAudio | null | undefined): Pastille | null {
  if (!a) return null;
  const palier = getQualityTier(a);
  const sr = a.sample_rate ?? 0;
  const bd = a.bit_depth ?? 0;
  if (palier === 'dsd') {
    const multiple = Math.round(sr / 44100);
    return { texte: multiple >= 64 ? `DSD${multiple}` : 'DSD', dsd: true };
  }
  if (palier === 'lossy' || palier === 'inconnu') return null;
  if (bd > 16 || sr > 48000) {
    if (bd > 0 && sr > 0) return { texte: `${bd}/${Math.floor(sr / 1000)}`, dsd: false };
    return { texte: 'Hi-Res', dsd: false };
  }
  if ((palier === 'hires' || palier === 'hires_max') && !bd && !sr) return { texte: 'Hi-Res', dsd: false };
  return null;
}
