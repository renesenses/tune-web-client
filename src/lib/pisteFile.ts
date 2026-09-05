/**
 * Ce qu'il faut envoyer au serveur pour mettre UNE piste dans la file.
 *
 * Une piste de la bibliothèque se désigne par son identifiant ; une piste de
 * service n'en a pas, elle se désigne par la paire `source` + `source_id` et
 * doit emporter ses métadonnées, faute de quoi la file affiche une ligne
 * anonyme et l'orchestrateur retombe sur un titre par défaut.
 *
 * Ces deux formes se recopiaient à chaque nouvel endroit qui voulait un bouton
 * « ajouter à la file ». Elles vivent ici, une fois.
 */

import type { AddToQueueRequest } from './api';
import type { Track } from './types';

/** Une piste locale : un identifiant, et rien d'autre à transporter. */
export function estPisteLocale(t: Pick<Track, 'id' | 'source'>): boolean {
  return t.id != null && (!t.source || t.source === 'local');
}

/**
 * Corps d'ajout à la file pour une piste, ou `null` si elle n'est désignable
 * ni par un identifiant ni par une paire service + identifiant.
 *
 * `position` insère au rang donné — c'est ce qui distingue « lire ensuite » de
 * « ajouter à la file », qui appelle la même route sans rang.
 */
export function corpsDeFile(t: Track, position?: number): AddToQueueRequest | null {
  const rang = position != null ? { position } : {};
  if (estPisteLocale(t)) return { track_id: t.id!, ...rang };
  if (t.source && t.source_id) {
    return {
      tracks: [{
        source: t.source,
        source_id: String(t.source_id),
        title: t.title ?? null,
        artist_name: t.artist_name ?? null,
        album_title: t.album_title ?? null,
        cover_path: t.cover_path ?? null,
        duration_ms: t.duration_ms,
      }],
      ...rang,
    };
  }
  return null;
}

/** Corps de lecture immédiate, même règle de désignation. */
export function corpsDeLecture(t: Track): Record<string, unknown> | null {
  if (estPisteLocale(t)) return { track_id: t.id! };
  if (t.source && t.source_id) {
    return {
      source: t.source,
      source_id: String(t.source_id),
      title: t.title ?? null,
      artist_name: t.artist_name ?? null,
      album_title: t.album_title ?? null,
      cover_path: t.cover_path ?? null,
      duration_ms: t.duration_ms,
    };
  }
  return null;
}
