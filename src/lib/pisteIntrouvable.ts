/**
 * Ligne de playlist INTROUVABLE — serveur tune-server-rust#6179.
 *
 * Quand une piste de la bibliothèque disparaît (fichier supprimé, déplacé,
 * re-balisé, retiré par un scan), le serveur ne l'efface plus de la playlist :
 * la ligne reste à son rang, `id` nul, `missing: true`, avec le titre,
 * l'artiste, l'album, la durée et le chemin de la piste disparue. Il la
 * rattache tout seul quand la piste revient.
 *
 * L'écran la montre GRISÉE avec l'étiquette « Introuvable », ne la joue pas
 * (elle n'a rien à jouer) et laisse « Retirer » l'effacer : c'est le seul
 * geste qui la fait sortir de la liste.
 *
 * Un serveur d'avant #6179 ne pose jamais `missing` : rien ne change.
 */
import type { Track } from './types';

export function estIntrouvable(p: Pick<Track, 'missing'> | null | undefined): boolean {
  return p?.missing === true;
}

/** Le chemin de la piste disparue, pour l'info-bulle, s'il est connu. */
export function cheminIntrouvable(p: Track | null | undefined): string | null {
  const c = (p as any)?.file_path;
  return typeof c === 'string' && c.trim() !== '' ? c : null;
}
