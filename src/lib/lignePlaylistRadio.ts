/**
 * web#2806 — une RADIO comme ligne de playlist (tune-server-rust#8412).
 *
 * `GET /playlists/{id}/tracks` rend une station de « Mes radios » ainsi :
 *
 *     { id: null, source: 'radio', source_id: '12', title: 'FIP',
 *       cover_path: '<logo>', duration_ms: 0, radio: true, radio_id: 12,
 *       unavailable: false, entry_id: 345 }
 *
 * Elle se retire (`entry_id`) et se déplace (`positions`) comme toute ligne,
 * et se lit par la playlist (`playlist_id` + `start_index`) : le serveur met
 * son flux en file. Elle n'est PAS une piste : ni durée, ni favori, ni file
 * en `track_ids`/`tracks[]` — les écrans la reconnaissent ici, une fois.
 */
import type { Track } from './types';

/**
 * La ligne de PLAYLIST est-elle une radio ? Seulement `radio: true` : une piste
 * `source = 'radio'` de l'historique ou de la lecture en cours n'est pas une
 * ligne de playlist, et garde sa barre d'actions (cœur radio #1771).
 */
export function estLigneRadio(p: Pick<Track, 'radio' | 'source'> | null | undefined): boolean {
  return p?.radio === true;
}

/** Ligne radio dont la station a quitté « Mes radios » : grisée, sautée à la lecture. */
export function radioIndisponible(p: Pick<Track, 'radio' | 'source' | 'unavailable'> | null | undefined): boolean {
  return estLigneRadio(p) && p?.unavailable === true;
}

/** Les lignes qu'on peut envoyer en PISTES (file, liste triée, aléatoire client) : tout sauf les radios. */
export function sansRadios<T extends Pick<Track, 'radio' | 'source'>>(lignes: readonly T[]): T[] {
  return lignes.filter((p) => !estLigneRadio(p));
}
