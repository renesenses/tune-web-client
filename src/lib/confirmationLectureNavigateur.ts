/**
 * web#2063 — dire au serveur que le lecteur de la zone navigateur JOUE
 * (`POST /zones/{id}/browser-playing`, serveur #6066).
 *
 * Le serveur annonçait « en écoute » et écrivait l'historique d'une zone
 * navigateur dès qu'un octet du flux partait : une sonde de plage suffisait,
 * sans aucune lecture. Depuis #6066, la preuve vient du lecteur : il appelle
 * cette route quand il joue réellement, avec l'identifiant du flux et la
 * position de son horloge.
 *
 * ## La règle
 *
 * - Seule une `position_ms > 0` confirme : on n'appelle donc que lorsque
 *   l'élément audio a réellement avancé (`playing` ou `timeupdate` avec
 *   `currentTime > 0`).
 * - Un appel par CHARGEMENT de source : la clé est l'adresse exacte de
 *   l'élément (un rechargement forcé y ajoute `_t=…`, et le serveur sert alors
 *   une nouvelle annonce sous le même flux). Rappeler sur la même source ne
 *   sert à rien (`nothing_pending`).
 * - `stream_id` vient de `/stream/<stream_id>.<ext>`. Une adresse tierce
 *   (Bandcamp…) n'en porte pas : rien à confirmer, rien n'est envoyé.
 * - Un serveur plus ancien répond 404/405 : ignoré en silence, comme 409
 *   (`not_a_browser_zone`). La confirmation ne doit jamais gêner la lecture.
 */
import { signalerLectureNavigateur } from './api';

/** `stream_id` d'une adresse de flux Tune (`…/stream/<id>.<ext>`), sinon `null`. */
export function idDuFlux(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/stream\/([^/?#]+?)(?:\.[A-Za-z0-9]+)?(?:[?#]|$)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

let derniereSourceConfirmee: string | null = null;

/** Pour les bancs : oublier la dernière source confirmée. */
export function oublierConfirmationLecture(): void {
  derniereSourceConfirmee = null;
}

/**
 * L'élément audio de la zone `zoneId` joue `src` à `positionSec`. Envoie la
 * confirmation au serveur une fois par source, dès que la position dépasse 0.
 * Rend `true` quand un appel est parti.
 */
export function confirmerLectureNavigateur(
  zoneId: number | null | undefined,
  src: string | null | undefined,
  positionSec: number,
): boolean {
  if (typeof zoneId !== 'number' || !src) return false;
  if (src === derniereSourceConfirmee) return false;
  const positionMs = Math.floor((Number.isFinite(positionSec) ? positionSec : 0) * 1000);
  if (positionMs <= 0) return false;
  const streamId = idDuFlux(src);
  if (!streamId) return false;
  derniereSourceConfirmee = src;
  void signalerLectureNavigateur(zoneId, streamId, positionMs).catch(() => {
    /* réseau ou serveur ancien : la lecture continue, sans confirmation */
  });
  return true;
}
