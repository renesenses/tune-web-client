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

/**
 * Recette de Bertrand (14/11) — la carte « Formats » des Statistiques listait
 * « MPEG » (146) ET « MP3 » (143), « DSF » et « DSD », « MP4 » à côté de
 * « AAC » / « ALAC ». Sur le .18, MPEG, DSD et MP4 viennent tous des pistes
 * UPnP : le serveur multimédia donne un type MIME (`audio/mpeg`, `audio/dsd`,
 * `audio/mp4`), pas une extension.
 *
 * `formatCanonique` : le format d'une STATISTIQUE et du filtre Format de la
 * Bibliothèque — le CODEC, pas le conteneur :
 *  - MPEG (et MPGA) → MP3 ;
 *  - DSF, DFF et DSD → DSD : même flux DSD ; le DSD d'un serveur UPnP ne dit
 *    pas son conteneur, et le séparer de DSF comptait deux fois la même chose.
 *    La vignette d'album garde le conteneur (`qualiteCompacte`, #1901) ;
 *  - MP4 / M4A → ALAC si la piste a une profondeur de bits (codec sans perte
 *    lu ; sur le .18, les 111 pistes MP4 sont à 24 bits), M4A sinon : le
 *    serveur écrit `m4a` quand il n'a PAS lu le codec (fil 2126, #5710 — un
 *    ALAC affiché « LOSSY AAC ») ; en faire un AAC referait cette erreur.
 * La carte Formats, sa barre cliquée et le filtre Format de la Bibliothèque
 * passent tous par ici : même clé partout. Côté serveur, la répartition
 * `by_codec` suit la même règle depuis tune-server-rust (PR « une case par
 * codec », lot rc12) ; un serveur qui ne la suit pas encore envoie « mp4 »
 * sans profondeur, rangé ici en M4A (voir `formatRetenu`). La fonction est
 * idempotente : « MP3 », « DSD », « ALAC », « M4A » restent eux-mêmes.
 */
const CODEC_DE: Record<string, string> = {
  MPEG: 'MP3', MPGA: 'MP3',
  DSF: 'DSD', DFF: 'DSD', DSDIFF: 'DSD',
};

export function formatCanonique(format: string | null | undefined, bitDepth?: number | null): string | null {
  const f = formatDeFichier(format);
  if (!f) return null;
  if (f === 'MP4' || f === 'M4A') return (bitDepth ?? 0) > 0 ? 'ALAC' : 'M4A';
  return CODEC_DE[f] ?? f;
}

/**
 * L'album passe-t-il le filtre Format (codecs cochés, en MAJUSCULES) ?
 *
 * « M4A » coché retient aussi tout album dont le fichier est un MP4 / M4A,
 * même rangé en ALAC : la barre « mp4 » d'un serveur qui n'envoie pas encore
 * la profondeur (rangée en M4A) doit retrouver ses albums — sur le .18, ses
 * 9 albums MP4 sont à 24 bits, donc ALAC côté client.
 */
export function formatRetenu(
  a: { format?: string | null; bit_depth?: number | null },
  coches: readonly string[],
): boolean {
  if (!coches.length) return true;
  if (coches.includes(formatCanonique(a.format, a.bit_depth) ?? '')) return true;
  const f = formatDeFichier(a.format);
  return coches.includes('M4A') && (f === 'MP4' || f === 'M4A');
}

/**
 * Les formats BRUTS (en minuscules) des albums dont le codec est coché : ce
 * qu'attend une route qui compare `album.format` tel quel (export du
 * catalogue). Sans album correspondant, le codec lui-même, en minuscules.
 */
export function formatsBrutsDe(
  albums: readonly { format?: string | null; bit_depth?: number | null }[],
  coches: readonly string[],
): string[] {
  if (!coches.length) return [];
  const bruts = new Set<string>();
  for (const a of albums) {
    const c = formatCanonique(a.format, a.bit_depth);
    const brut = String(a.format ?? '').trim().toLowerCase();
    if (c && brut && formatRetenu(a, coches)) bruts.add(brut);
  }
  const trouves = new Set(albums.map((a) => formatCanonique(a.format, a.bit_depth)));
  for (const c of coches) if (!trouves.has(c)) bruts.add(c.toLowerCase());
  return [...bruts].sort();
}
