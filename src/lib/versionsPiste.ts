/**
 * Ce qu'on ENVOIE à la lecture quand on clique une « autre version ».
 *
 * Bertrand, 07/09/2026 : « Autres versions : le click sur la cover ne doit pas
 * lancer l'album mais la chanson ! »
 *
 * C'était le cas : la première version envoyait `streaming_album_id` dès qu'un
 * album était connu, et `source_id` — la PISTE chez le service — ne servait que
 * de repli. On demandait une autre version d'un morceau et on obtenait un
 * disque entier, qui ne commençait même pas par lui.
 *
 * L'ordre est donc : la PISTE d'abord, l'album seulement quand le service ne
 * nomme pas la piste. C'est le même ordre que `corpsDeLecture` applique à
 * toute piste distante.
 *
 * Le module existe pour que la garde puisse APPELER la règle : une garde
 * écrite contre le composant ne pourrait que lire son texte, et deux gardes à
 * moi ont déjà rougi ou verdi à tort pour cette raison (07/09/2026).
 */

export interface VersionService {
  service: string;
  source_id: string | null;
  album_id: string | null;
  title: string;
  artist_name: string | null;
  album_title: string | null;
  cover_path: string | null;
}

export interface VersionLocale {
  track_id: number | null;
}

/**
 * @returns Le corps de lecture, ou `null` quand la version ne désigne rien —
 *   une reprise trouvée chez un service sans identifiant ne mène nulle part.
 */
export function corpsVersionService(v: VersionService): Record<string, unknown> | null {
  // 🔴 LA PISTE D'ABORD. Les métadonnées l'accompagnent : sans elles la barre
  // de lecture reste sans titre ni pochette le temps que le service réponde.
  if (v.source_id) {
    return {
      source: v.service,
      source_id: String(v.source_id),
      title: v.title ?? null,
      artist_name: v.artist_name ?? null,
      album_title: v.album_title ?? null,
      cover_path: v.cover_path ?? null,
    };
  }
  // L'album seulement en dernier recours : mieux vaut le bon disque que rien.
  if (v.album_id) return { streaming_album_id: String(v.album_id), source: v.service };
  return null;
}

/** Une version de la BIBLIOTHÈQUE : elle a toujours désigné la piste. */
export function corpsVersionLocale(v: VersionLocale): Record<string, unknown> | null {
  return v.track_id == null ? null : { track_id: v.track_id };
}
