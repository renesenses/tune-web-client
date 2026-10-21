// tune-server-rust#4908 — commandes de l'écran verrouillé (API Media Session).
//
// Le téléphone affiche, écran verrouillé ou dans le volet des notifications,
// le titre en cours et des boutons lecture/pause/précédent/suivant. Sans ce
// module, ces boutons agissent sur l'élément `<audio>` de l'onglet (zone
// navigateur) et pas sur le SERVEUR : « pause » coupait le son du téléphone
// pendant que le serveur continuait d'avancer dans la file.
//
// Ici, chaque bouton passe par les mêmes appels que la barre de lecture
// (`resumeAndSync`, `nextAndSync`…), sur la zone affichée.
//
// Désactivé par défaut (`controlesEcranVerrouille`) : il change ce que font
// des boutons qui existent déjà. Réglages, à côté de « Lire en boucle par
// défaut ».
//
// Limite des navigateurs, et non de Tune : Android et iOS n'affichent ces
// commandes que si la PAGE joue du son. Elles apparaissent donc pour une zone
// navigateur ; pour une zone distante (DLNA, AirPlay…), l'onglet ne joue
// rien et le système n'affiche rien.

import { writable, type Readable } from 'svelte/store';
import type { PlaybackState, Zone } from './types';

const CLE = 'tune_controles_ecran_verrouille';

function lire(): boolean {
  try {
    return localStorage.getItem(CLE) === 'true';
  } catch {
    return false;
  }
}

/** Le réglage, propre à cet appareil (le téléphone qui se verrouille). */
export const controlesEcranVerrouille = writable<boolean>(lire());

controlesEcranVerrouille.subscribe((v) => {
  try {
    localStorage.setItem(CLE, String(v));
  } catch {
    /* stockage indisponible : réglage en mémoire seulement */
  }
});

export interface MetadonneesDeSession {
  title: string;
  artist: string;
  album: string;
  artwork: { src: string; sizes: string; type?: string }[];
}

/** Ce que l'écran verrouillé affiche pour cette zone, ou `null` s'il n'y a rien. */
export function metadonneesDeSession(
  zone: Zone | null | undefined,
  pochette: (chemin: string) => string,
): MetadonneesDeSession | null {
  const piste = zone?.current_track;
  if (!piste || !piste.title) return null;
  const src = piste.cover_path ? pochette(piste.cover_path) : '';
  return {
    title: piste.title,
    artist: piste.artist_name ?? '',
    album: piste.album_title ?? '',
    artwork: src ? [{ src, sizes: '512x512' }] : [],
  };
}

/** L'état que l'API Media Session connaît : `playing`, `paused` ou `none`. */
export function etatDeSession(etat: PlaybackState | undefined): MediaSessionPlaybackState {
  switch (etat) {
    case 'playing':
    case 'buffering':
      return 'playing';
    case 'paused':
      return 'paused';
    default:
      return 'none';
  }
}

/** La position, en SECONDES, pour `setPositionState` ; `null` si inconnue. */
export function positionDeSession(
  zone: Zone | null | undefined,
): { duration: number; position: number; playbackRate: number } | null {
  const duree = zone?.current_track?.duration_ms;
  if (!duree || duree <= 0) return null;
  const position = Math.min(Math.max(zone?.position_ms ?? 0, 0), duree);
  return { duration: duree / 1000, position: position / 1000, playbackRate: 1 };
}

/** Les commandes de transport, sur l'identifiant de zone. */
export interface CommandesDeTransport {
  lire(zoneId: number): Promise<unknown>;
  pause(zoneId: number): Promise<unknown>;
  suivant(zoneId: number): Promise<unknown>;
  precedent(zoneId: number): Promise<unknown>;
  chercher(zoneId: number, positionMs: number): Promise<unknown>;
}

/** Le sous-ensemble de `navigator.mediaSession` dont ce module se sert. */
export interface SessionMediaLike {
  metadata: unknown;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
  setPositionState?(etat?: MediaPositionState): void;
}

const ACTIONS: MediaSessionAction[] = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'];

/**
 * Branche la session média sur la zone affichée, tant que `actif` est vrai.
 * Rend de quoi tout débrancher.
 *
 * `fabriquer` construit l'objet de métadonnées (`new MediaMetadata(...)`
 * dans le navigateur) : passé en paramètre pour que les témoins jouent ce
 * module hors navigateur.
 */
export function brancherSessionMedia(
  session: SessionMediaLike | undefined,
  zone: Readable<Zone | null>,
  actif: Readable<boolean>,
  commandes: CommandesDeTransport,
  pochette: (chemin: string) => string,
  fabriquer: (m: MetadonneesDeSession) => unknown,
): () => void {
  if (!session) return () => {};
  let zoneCourante: Zone | null = null;
  let estActif = false;
  let desabonnerZone: (() => void) | null = null;

  const surLaZone = (agir: (id: number) => Promise<unknown>) => () => {
    const id = zoneCourante?.id;
    if (id == null) return;
    agir(id).catch(() => {
      /* la barre de lecture affiche déjà les erreurs de transport */
    });
  };

  const poser = (z: Zone | null) => {
    zoneCourante = z;
    const m = metadonneesDeSession(z, pochette);
    session.metadata = m ? fabriquer(m) : null;
    session.playbackState = m ? etatDeSession(z?.state) : 'none';
    const p = m ? positionDeSession(z) : null;
    try {
      if (p) session.setPositionState?.(p);
    } catch {
      /* position refusée par le navigateur (bornes) : sans gravité */
    }
  };

  const brancher = () => {
    session.setActionHandler('play', surLaZone(commandes.lire));
    session.setActionHandler('pause', surLaZone(commandes.pause));
    session.setActionHandler('previoustrack', surLaZone(commandes.precedent));
    session.setActionHandler('nexttrack', surLaZone(commandes.suivant));
    session.setActionHandler('seekto', (details) => {
      const id = zoneCourante?.id;
      if (id == null || details.seekTime == null) return;
      commandes.chercher(id, Math.round(details.seekTime * 1000)).catch(() => {});
    });
    desabonnerZone = zone.subscribe(poser);
  };

  const debrancher = () => {
    desabonnerZone?.();
    desabonnerZone = null;
    for (const action of ACTIONS) {
      try {
        session.setActionHandler(action, null);
      } catch {
        /* action inconnue de ce navigateur */
      }
    }
    session.metadata = null;
    session.playbackState = 'none';
  };

  const desabonnerActif = actif.subscribe((v) => {
    if (v === estActif) return;
    estActif = v;
    if (v) brancher();
    else debrancher();
  });

  return () => {
    desabonnerActif();
    if (estActif) debrancher();
    estActif = false;
  };
}
