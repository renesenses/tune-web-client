/**
 * État VIVANT de la lecture pour le nouveau client.
 *
 * ## Pourquoi ce fichier existe
 *
 * `v2Bootstrap` charge les données STATIQUES — zones, albums, appareils,
 * profils, licence — une fois, au montage. Il ne raccorde rien de vivant.
 *
 * Or `?v2` monte `ShellV2` À LA PLACE de `App.svelte`, et c'est `App` qui
 * possède toute la plomberie temps réel : connexion WebSocket, rafraîchissement
 * des zones, minuteur de progression, report de la répétition et de la lecture
 * aléatoire. Rien de tout cela ne tournait dans le nouveau client.
 *
 * Constaté par Bertrand le 01/09/2026, la barre de transport historique une
 * fois montée dans le shell v2 : « la barre de progression est mal branchée
 * ainsi que le statut des boutons ». Elle n'était pas mal branchée — personne
 * ne l'alimentait.
 *
 * ## Ce qui manquait, exactement
 *
 * `currentTrack` et `playbackState` DÉRIVENT de `currentZone`, donc de `zones`.
 * Ils se mettent à jour tout seuls… à condition que `zones` bouge. Chargé une
 * fois et jamais rafraîchi, l'écran restait figé sur l'état du montage.
 *
 * Trois manques distincts, et il faut les trois :
 *
 *  1. **La liste des zones** ne se rafraîchissait pas → piste et état de
 *     lecture figés (`zone.updated`).
 *  2. **Le minuteur de progression** ne tournait pas → la barre n'avançait
 *     jamais, même en lecture.
 *  3. **Répétition et aléatoire** n'arrivent QUE par l'événement `snapshot` —
 *     ni `/zones` ni `/zones/{id}` ne les portent. Sans lui, ces deux boutons
 *     affichent éternellement leur valeur par défaut.
 *
 * ## Ce que ce module n'est PAS
 *
 * Ce n'est pas un fork du gestionnaire d'événements d'`App` : c'est le
 * sous-ensemble qui fait vivre le TRANSPORT. Les branches propres à l'app
 * historique — YouTube, zones navigateur, fenêtres de grâce, onboarding — n'y
 * sont pas, et n'ont rien à y faire.
 *
 * Le jour où `App` extraira sa boucle complète dans un module partagé, ce
 * fichier disparaîtra au profit de celui-là. En attendant, il est court et
 * délibérément limité.
 */
import { get } from 'svelte/store';
import * as api from './api';
import { tuneWS } from './websocket';
import { zones, currentZoneId } from './stores/zones';
import {
  seekPositionMs,
  startSeekTimer,
  stopSeekTimer,
  repeatMode,
  shuffleEnabled,
} from './stores/nowPlaying';
import { mergeTransport, type TransportState } from './transportSync';

/**
 * Écart au-delà duquel la position du serveur corrige l'interpolation locale.
 *
 * En dessous, on garde l'horloge locale : le minuteur avance en continu, là où
 * les points du serveur arrivent par sauts. Corriger à chaque point ferait
 * osciller la barre au lieu de la faire glisser. Même valeur qu'`App`.
 */
const DERIVE_MAX_MS = 2000;

/** Dernier transport connu par zone — les charges utiles sont PARTIELLES. */
const transportParZone = new Map<number, TransportState>();

/**
 * Applique répétition et aléatoire d'une zone, si c'est la zone courante.
 *
 * Le fusionnement est nécessaire : un `snapshot` peut ne porter que l'un des
 * deux, et écraser l'autre avec `undefined` éteindrait un bouton allumé.
 */
function transportDepuisZone(zone: unknown): void {
  const z = zone as { id?: unknown } | null;
  if (!z || typeof z.id !== 'number') return;
  const fusion = mergeTransport(transportParZone.get(z.id), zone);
  transportParZone.set(z.id, fusion);
  if (z.id !== get(currentZoneId)) return;
  if (fusion.repeat) repeatMode.set(fusion.repeat);
  if (typeof fusion.shuffle === 'boolean') shuffleEnabled.set(fusion.shuffle);
}

/**
 * Aplatit le sous-objet `quality` des sources de streaming.
 *
 * Le serveur le rend imbriqué pour Qobuz et consorts, alors que l'interface lit
 * `format` / `sample_rate` / `bit_depth` à plat. Sans cela, la ligne technique
 * de la barre reste vide sur tout ce qui vient d'un service.
 */
function aplatirQualite(zoneList: any[]): void {
  for (const z of zoneList) {
    const q = z?.current_track?.quality;
    if (!q || typeof q !== 'object') continue;
    const t = z.current_track;
    if (q.codec && !t.format) t.format = String(q.codec).toLowerCase();
    if (q.sample_rate && !t.sample_rate) t.sample_rate = q.sample_rate;
    if (q.bit_depth && !t.bit_depth) t.bit_depth = q.bit_depth;
    if (q.channels && !t.channels) t.channels = q.channels;
  }
}

/** Minuteur et position, pour la zone courante uniquement. */
function suivreProgression(zoneList: any[]): void {
  const id = get(currentZoneId);
  const zone = id != null ? zoneList.find((z) => z?.id === id) : null;
  if (!zone) return;
  if (zone.state === 'playing') {
    startSeekTimer();
    const posServeur = zone.position_ms ?? 0;
    if (Math.abs(get(seekPositionMs) - posServeur) > DERIVE_MAX_MS) {
      seekPositionMs.set(posServeur);
    }
  } else {
    stopSeekTimer();
    seekPositionMs.set(zone.position_ms ?? 0);
  }
}

/** Recharge les zones depuis l'API — après un événement qui change la piste. */
async function rechargerZones(): Promise<void> {
  try {
    const liste = await api.getZones();
    aplatirQualite(liste as any[]);
    zones.set(liste);
    suivreProgression(liste as any[]);
  } catch {
    // Serveur momentanément muet : on garde l'état précédent plutôt que de
    // vider l'écran. Le prochain événement corrigera.
  }
}

/**
 * Raccorde le transport au serveur. Rend la fonction d'arrêt.
 *
 * À appeler une fois, au montage de la coquille v2.
 */
export function demarrerTransportV2(): () => void {
  tuneWS.connect();

  // Le poller doit savoir quelle zone suivre, sinon il ne remonte pas sa file.
  const desabonnerZone = currentZoneId.subscribe((id) => tuneWS.setCurrentZoneId(id));

  const desabonnerEvents = tuneWS.onEvent((event: any) => {
    const type = event?.type as string | undefined;
    if (!type) return;

    // Répétition et aléatoire : le `snapshot` en est la SEULE source.
    if (type === 'snapshot' && Array.isArray(event.data?.zones)) {
      for (const z of event.data.zones) transportDepuisZone(z);
      return;
    }

    // Mise à jour groupée des zones — l'état de lecture et la piste en vivent.
    if (type === 'zone.updated' && Array.isArray(event.data?.zones)) {
      const liste = event.data.zones as any[];
      aplatirQualite(liste);
      zones.set(liste);
      for (const z of liste) transportDepuisZone(z);
      suivreProgression(liste);
      return;
    }

    // Les événements de lecture ne portent ni la piste complète ni la position :
    // on relit les zones plutôt que de deviner.
    if (type.startsWith('playback.')) {
      void rechargerZones();
    }
  });

  return () => {
    desabonnerEvents?.();
    desabonnerZone?.();
    stopSeekTimer();
  };
}
