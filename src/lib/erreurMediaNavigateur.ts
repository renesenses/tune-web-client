/**
 * tune-server-rust#5975 — dire au serveur pourquoi le lecteur de la zone
 * navigateur ne joue pas (`POST /zones/{id}/browser-error`).
 *
 * Alex Campbell (Safari 18.6, Docker, fils forum 2178 et 2246) : une piste de
 * bibliothèque et la première piste d'une playlist ne jouent pas. Le journal
 * joint au rapport montrait le flux demandé, puis le saut à la suivante — la
 * raison, elle, ne vivait que dans la console de Safari
 * (`console.error('Browser audio error:', …)`), que personne ne joint à un
 * rapport. `MediaError` 4 (format ou réponse refusés) et 2 (réseau) ne se
 * corrigent pas au même endroit ; un `play()` refusé hors geste
 * (`NotAllowedError`) n'est pas une panne du flux. Le serveur écrit désormais
 * la cause à côté de ce qu'il a servi, et le prochain rapport la porte.
 *
 * ## La règle
 *
 * - Un signal par SOURCE et par cause : la clé est l'adresse exacte de
 *   l'élément plus le code (un rechargement forcé y ajoute `_t=…`). Une
 *   rafale d'évènements sur la même source n'envoie qu'une ligne.
 * - `stream_id` vient de `/stream/<stream_id>.<ext>` ; une adresse tierce n'en
 *   porte pas, le signal part quand même (`stream_id: null`) : la cause reste
 *   utile.
 * - Réseau en panne ou serveur ancien : ignoré en silence.
 */
import { signalerErreurMediaNavigateur } from './api';
import { idDuFlux } from './confirmationLectureNavigateur';

let derniereCle: string | null = null;

/** Pour les bancs : oublier le dernier signal envoyé. */
export function oublierErreursSignalees(): void {
  derniereCle = null;
}

function positionMs(positionSec: number): number {
  return Math.max(0, Math.floor((Number.isFinite(positionSec) ? positionSec : 0) * 1000));
}

function envoyer(
  zoneId: number,
  src: string,
  kind: 'media_error' | 'play_rejected',
  code: number | null,
  message: string,
  positionSec: number,
): boolean {
  const cle = `${kind}:${code ?? ''}:${src}`;
  if (cle === derniereCle) return false;
  derniereCle = cle;
  void signalerErreurMediaNavigateur(zoneId, {
    stream_id: idDuFlux(src),
    kind,
    code,
    message: message.slice(0, 300),
    position_ms: positionMs(positionSec),
  }).catch(() => {
    /* réseau ou serveur ancien : la lecture continue, sans signal */
  });
  return true;
}

/**
 * L'élément de la zone `zoneId` a levé `error` sur `src`. Rend `true` quand un
 * signal est parti.
 */
export function signalerErreurMedia(
  zoneId: number | null | undefined,
  src: string | null | undefined,
  erreur: { code?: number; message?: string } | null | undefined,
  positionSec: number,
): boolean {
  if (typeof zoneId !== 'number' || !src || !erreur) return false;
  const code = typeof erreur.code === 'number' ? erreur.code : null;
  return envoyer(zoneId, src, 'media_error', code, erreur.message ?? '', positionSec);
}

/**
 * `play()` a été refusé sur `src` (`NotAllowedError`, `NotSupportedError`…).
 * Rend `true` quand un signal est parti.
 */
export function signalerLectureRefusee(
  zoneId: number | null | undefined,
  src: string | null | undefined,
  refus: unknown,
  positionSec: number,
): boolean {
  if (typeof zoneId !== 'number' || !src) return false;
  // Un `play()` interrompu par un nouveau `load()` (changement de piste) n'est
  // pas un refus : l'élément joue la source suivante.
  const r = refus as { name?: string; message?: string } | null;
  if (r?.name === 'AbortError') return false;
  const message = `${r?.name ?? 'Error'}: ${r?.message ?? String(refus)}`;
  return envoyer(zoneId, src, 'play_rejected', null, message, positionSec);
}
