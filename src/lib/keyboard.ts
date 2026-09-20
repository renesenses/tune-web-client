import { get } from 'svelte/store';
import { currentZone, nextAndSync, previousAndSync, resumeAndSync, stopAndSync } from './stores/zones';
import { playbackState, seekPositionMs, mutedVolume, currentTrack } from './stores/nowPlaying';
import * as api from './api';
import { activeView, mobileNowPlayingOpen } from './stores/navigation';

/**
 * #1309 — une flèche est-elle un raccourci de LECTURE ?
 *
 * Les quatre flèches avançaient la piste de 10 s ou bougeaient le volume de
 * 1 % sur TOUS les écrans, et bloquaient le défilement. Dans la bibliothèque,
 * elles ne pouvaient donc jamais faire défiler les pochettes : elles
 * envoyaient une avance à la zone pilotée — et, sur un renderer absent,
 * l'erreur brute « output … is not registered » (Mac Brehilt, 19/09/2026).
 *
 * - Une touche déjà consommée par un composant (une rangée qui défile,
 *   `defilementHorizontal.ts`) n'est jamais rejouée ici.
 * - Maj+← / Maj+→ (piste précédente / suivante) restent actifs partout.
 * - Les flèches seules ne pilotent la lecture que sur l'écran de lecture.
 */
export function flecheDeLecture(
  e: Pick<KeyboardEvent, 'code' | 'shiftKey' | 'defaultPrevented'>,
  surEcranDeLecture: boolean,
): boolean {
  if (e.defaultPrevented) return false;
  if (e.shiftKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return true;
  return surEcranDeLecture;
}

function surEcranDeLecture(): boolean {
  return get(activeView) === 'nowplaying' || get(mobileNowPlayingOpen);
}

export function setupKeyboardShortcuts(): () => void {
  function handler(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const zone = get(currentZone);
    if (!zone?.id) return;
    if (e.code.startsWith('Arrow') && !flecheDeLecture(e, surEcranDeLecture())) return;

    switch (e.code) {
      case 'Space': {
        e.preventDefault();
        const state = get(playbackState);
        if (state === 'playing') api.pause(zone.id);
        else resumeAndSync(zone.id);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (e.shiftKey) {
          nextAndSync(zone.id);
        } else {
          const pos = get(seekPositionMs);
          api.seek(zone.id, pos + 10000);
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (e.shiftKey) {
          previousAndSync(zone.id);
        } else {
          const pos = get(seekPositionMs);
          api.seek(zone.id, Math.max(0, pos - 10000));
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const vol = zone.volume ?? 0.5;
        // Step by 1% (round to avoid float drift), not 5%.
        api.setVolume(zone.id, Math.min(1, Math.round((vol + 0.01) * 100) / 100));
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        const vol = zone.volume ?? 0.5;
        api.setVolume(zone.id, Math.max(0, Math.round((vol - 0.01) * 100) / 100));
        break;
      }
      /**
       * S — ARRÊTER.
       *
       * Le bouton stop a quitté la barre de transport le 05/09/2026 : l'action
       * y vit désormais sur le double-clic du bouton lecture. Un double-clic
       * n'existe pas au clavier, et le stop serait devenu inatteignable pour
       * qui n'utilise pas la souris. Bertrand : « Stop au clavier définir une
       * touche. »
       *
       * `S` était la seule initiale libre — Space, N, P et M sont prises.
       * `MediaStop` l'accompagne : les claviers qui portent la touche matérielle
       * doivent la voir marcher.
       *
       * La RADIO est exclue, comme elle l'était du bouton : un flux en direct
       * ne s'arrête pas pour reprendre où l'on était.
       */
      case 'KeyS':
      case 'MediaStop': {
        if (e.metaKey || e.ctrlKey) break;
        if (get(currentTrack)?.source === 'radio') break;
        e.preventDefault();
        // Report d'etat, comme le bouton : sans lui la zone resterait
        // « playing » dans le magasin et le transport deviendrait inerte.
        stopAndSync(zone.id);
        break;
      }
      case 'KeyN':
        if (!e.metaKey && !e.ctrlKey) nextAndSync(zone.id);
        break;
      case 'KeyP':
        if (!e.metaKey && !e.ctrlKey) previousAndSync(zone.id);
        break;
      case 'KeyM': {
        if (e.metaKey || e.ctrlKey) break;
        const vol = zone.volume ?? 0.5;
        const savedMute = get(mutedVolume);
        if (vol > 0) {
          mutedVolume.set(vol);
          api.setVolume(zone.id, 0);
        } else if (savedMute !== null) {
          mutedVolume.set(null);
          api.setVolume(zone.id, savedMute);
        } else {
          api.setVolume(zone.id, 0.5);
        }
        break;
      }
    }
  }

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
