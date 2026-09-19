/**
 * « FLAC 96 kHz / 24 bit », « DSF 2822 kHz »… — le libellé de la proposition
 * « une meilleure qualité existe dans votre bibliothèque ».
 *
 * Porté de l'ancienne Bibliothèque (`LibraryView`), seule à faire la
 * proposition. La lecture demandée part IMMÉDIATEMENT ; la proposition arrive
 * en notification, jamais en travers du chemin (Bertrand, 25/08).
 */
import type { BetterQuality } from './api';

export function libelleQualite(b: Pick<BetterQuality, 'format' | 'sample_rate' | 'bit_depth'>): string {
  const fmt = (b.format ?? '').toUpperCase();
  const sr = b.sample_rate ? `${Math.round(b.sample_rate / 1000)} kHz` : '';
  const bd = b.bit_depth && b.bit_depth > 1 ? ` / ${b.bit_depth} bit` : '';
  return [fmt, sr].filter(Boolean).join(' ') + bd;
}

/** Une proposition ne vaut que si elle désigne un AUTRE album. */
export function autreAlbumMeilleur(b: Pick<BetterQuality, 'album_id'> | null | undefined, albumId: number): number | null {
  return b?.album_id != null && b.album_id !== albumId ? b.album_id : null;
}
