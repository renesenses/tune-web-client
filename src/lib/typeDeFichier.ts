/**
 * #1901 (Fredouille40, fil 2131) — « voir le type de fichier (flac, wav, dsd,
 * dsf, dxd, mp3) à côté ou sous l'album ».
 *
 * Deux questions, une seule réponse pour tout le client :
 *
 *  - `formatDeFichier` : le TYPE, court et en capitales (« FLAC », « DSF »).
 *    Un type MIME (`audio/x-dsf`, `audio/flac`) est ramené à son sous-type ;
 *  - `qualiteCompacte` : la troisième ligne d'une vignette, « FLAC 96/24 »,
 *    « DSF DSD256 ». Elle vivait dans `QualiteAlbum.svelte`, où le DSD se
 *    réduisait à deux paliers — « ≥ 5 MHz ⇒ DSD128 » annonçait DSD128 pour un
 *    DSD256 ou un DSD512, et taisait le conteneur (DSF ou DFF). Le multiple
 *    vient désormais de `multipleDSD`, comme dans la ligne technique de la
 *    Bibliothèque.
 *
 * Le DXD n'est pas un type de fichier mais une fréquence (352,8 kHz PCM) : il
 * se lit « FLAC 352.8/24 » ou « WAV 352.8/24 », et c'est juste.
 */
import { getQualityTier, multipleDSD } from './utils';

export function formatDeFichier(format: string | null | undefined): string | null {
  const brut = String(format ?? '').trim().toLowerCase();
  if (!brut) return null;
  const sous = brut.includes('/') ? brut.slice(brut.lastIndexOf('/') + 1) : brut;
  const nu = sous.replace(/^x-/, '');
  return nu ? nu.toUpperCase() : null;
}

export interface ObjetQualite {
  format?: string | null;
  sample_rate?: number | null;
  bit_depth?: number | null;
  source?: string | null;
}

export function qualiteCompacte(objet: ObjetQualite | null | undefined): string | null {
  if (!objet) return null;
  const fmt = formatDeFichier(objet.format);
  if (getQualityTier(objet) === 'dsd') {
    const palier = multipleDSD(objet.sample_rate) ?? 'DSD';
    // « DSD DSD128 » ne dirait rien de plus : le conteneur n'est nommé que
    // s'il est autre chose que « DSD ».
    return fmt && fmt !== 'DSD' ? `${fmt} ${palier}` : palier;
  }
  const khz = objet.sample_rate ? Math.round(objet.sample_rate / 100) / 10 : null;
  const bits = objet.bit_depth ?? null;
  // Un disque sans fréquence connue n'affiche que son format : mieux vaut
  // « FLAC » seul qu'un « FLAC /  » bancal.
  const chiffres = khz ? `${khz}${bits ? '/' + bits : ''}` : null;
  return [fmt, chiffres].filter(Boolean).join(' ') || null;
}
