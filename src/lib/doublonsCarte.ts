/**
 * tune-server-rust#5976 — la carte d'une paire de pistes en double ne montrait
 * que le titre de A.
 *
 * Chez Dominique Pamingle (fil 2183), le critère « Même enregistrement »
 * rapprochait « Nightfall » et « Nightfall (Instrumental) ». La carte titrait
 * « Nightfall » et ne disait de B que sa qualité (« FLAC · 44.1 kHz · 16 bit ») :
 * rien ne montrait que B était l'instrumental, et « Garder A » le retirait de
 * la bibliothèque. Le serveur ne rapproche plus ces deux titres ; la carte
 * nomme désormais A ET B, et signale un écart de titre quand il en reste un.
 */
import type { CopieDoublon } from './api';

/** Le nom de fichier d'un chemin, séparateur Unix OU Windows. */
function nomDeFichier(chemin: string | undefined): string | undefined {
  return chemin?.split(/[\\/]/).pop() || undefined;
}

/** Le titre d'une copie tel que la carte le montre : son titre, à défaut
 *  le nom de son fichier, à défaut son identifiant. */
export function titreDeCopie(c: CopieDoublon): string {
  return c.title?.trim() || nomDeFichier(c.file_path) || String(c.id);
}

/** Un titre comparable : sans accents, sans casse, ponctuation ramenée à
 *  une espace — la même normalisation que le serveur (`titre_normalise`). */
function normaliser(t: string): string {
  return t
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Les deux copies portent-elles des titres différents ? Un titre absent ne
 *  fait pas d'écart. */
export function titresDifferent(a: CopieDoublon, b: CopieDoublon): boolean {
  const ta = a.title?.trim();
  const tb = b.title?.trim();
  if (!ta || !tb) return false;
  return normaliser(ta) !== normaliser(tb);
}
