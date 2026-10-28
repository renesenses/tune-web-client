import { volumeCommandable } from './capacitesVolumeSortie';
import { isVolumeLocked } from './stores/audiophile';
import { get } from 'svelte/store';
import { currentZone, nextAndSync, previousAndSync, resumeAndSync, stopAndSync } from './stores/zones';
import { playbackState, seekPositionMs, currentTrack } from './stores/nowPlaying';
import * as api from './api';
import { volumeDepuisGain } from './courbeDeVolume';
import { basculerSourdineZone } from './sourdine';
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

/**
 * #1872 — les touches que `setupKeyboardShortcuts` intercepte, par `code`.
 *
 * La Bibliothèque redirige toute autre frappe imprimable vers son champ de
 * recherche (`frappeVersRecherche.ts`) : ces touches-là gardent leur sens de
 * raccourci de lecture. Un banc vérifie que chaque `case` du gestionnaire
 * ci-dessous figure dans cette liste — l'oublier ici ferait taper la lettre
 * dans la recherche EN PLUS de lancer l'action.
 */
export const TOUCHES_RACCOURCIS: readonly string[] = [
  'Space', 's', 'n', 'p', 'm', 'MediaStop',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
];

/**
 * #6700 — la touche d'un raccourci, telle que `TOUCHES_RACCOURCIS` la nomme.
 *
 * Décision de Bertrand du 21/10/2026 : un raccourci à UNE LETTRE se lit sur la
 * lettre TAPÉE (`e.key`, en minuscule), pas sur la position physique
 * (`e.code`). Sur un clavier AZERTY, la position QWERTY de M (`KeyM`) porte la
 * virgule : lue par `code`, chaque « , » tapée hors d'un champ coupait le son,
 * et la vraie lettre M (`Semicolon`) ne faisait rien.
 *
 * Les touches sans lettre (espace, flèches, MediaStop) gardent leur `code`.
 * Une position de lettre qui ne tape pas une lettre (la virgule de l'AZERTY)
 * n'est le raccourci de rien.
 */
export function toucheDuRaccourci(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const lettre = typeof e.key === 'string' ? e.key : '';
  if (/^[a-z]$/i.test(lettre)) return lettre.toLowerCase();
  if (/^Key[A-Z]$/.test(e.code ?? '')) return '';
  return e.code ?? '';
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

    switch (toucheDuRaccourci(e)) {
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
        if (!volumeCommandable(zone) || isVolumeLocked()) break;
        const vol = volumeDepuisGain(zone, zone.volume ?? 0.5); // #6787 : le curseur
        // Step by 1% (round to avoid float drift), not 5%.
        api.setVolume(zone.id, Math.min(1, Math.round((vol + 0.01) * 100) / 100));
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (!volumeCommandable(zone) || isVolumeLocked()) break;
        const vol = volumeDepuisGain(zone, zone.volume ?? 0.5); // #6787 : le curseur
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
      case 's':
      case 'MediaStop': {
        if (e.metaKey || e.ctrlKey) break;
        if (get(currentTrack)?.source === 'radio') break;
        e.preventDefault();
        // Report d'etat, comme le bouton : sans lui la zone resterait
        // « playing » dans le magasin et le transport deviendrait inerte.
        stopAndSync(zone.id);
        break;
      }
      case 'n':
        if (!e.metaKey && !e.ctrlKey) nextAndSync(zone.id);
        break;
      case 'p':
        if (!e.metaKey && !e.ctrlKey) previousAndSync(zone.id);
        break;
      case 'm': {
        if (e.metaKey || e.ctrlKey) break;
        // #6700 — une VRAIE sourdine (`muted`), jamais un volume à zéro.
        if (!isVolumeLocked()) void basculerSourdineZone({ ...zone, id: zone.id }).catch(() => {});
        break;
      }
    }
  }

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
