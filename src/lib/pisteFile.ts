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

/**
 * Corps d'ajout à la file pour une LISTE de pistes, en UNE requête.
 *
 * `QueueAddRequest` accepte `tracks: [...]` côté serveur (mesuré sur la tête
 * de `tune-server-rust`, `routes/playback.rs`) : toutes les lignes entrent par
 * le même `insert_at`, donc un album de service s'enfile d'un coup, à sa place,
 * dans le bon ordre.
 *
 * Ce que cela remplace : une boucle `for (…) await addToQueue(…)`, une requête
 * par piste. Sur un album de dix-huit titres, dix-huit allers-retours dont
 * chacun pouvait échouer au milieu — et surtout, avec un `position`, chaque
 * insertion décalait la suivante et l'ordre s'inversait.
 *
 * Les pistes LOCALES d'une même liste partent en `track_ids`, les pistes de
 * service en `tracks[]` ; le serveur réunit les deux dans le même ordre
 * d'arrivée, ce qui laisse une liste mixte cohérente.
 *
 * Rend `null` si aucune piste n'est désignable : mieux vaut ne rien envoyer
 * qu'envoyer une requête que le serveur refusera avec « required ».
 */
export function corpsDeFileListe(liste: Track[], position?: number): AddToQueueRequest | null {
  const rang = position != null ? { position } : {};
  const ids: number[] = [];
  const rangees: NonNullable<AddToQueueRequest['tracks']> = [];
  for (const t of liste) {
    if (estPisteLocale(t)) { ids.push(t.id!); continue; }
    if (t.source && t.source_id) {
      rangees.push({
        source: t.source as any,
        source_id: String(t.source_id),
        title: t.title ?? null,
        artist_name: t.artist_name ?? null,
        album_title: t.album_title ?? null,
        cover_path: t.cover_path ?? null,
        duration_ms: t.duration_ms,
      });
    }
  }
  if (!ids.length && !rangees.length) return null;
  return {
    ...(ids.length ? { track_ids: ids } : {}),
    ...(rangees.length ? { tracks: rangees } : {}),
    ...rang,
  };
}
