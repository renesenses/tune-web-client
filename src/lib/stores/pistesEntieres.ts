/**
 * TOUTES LES PISTES, une fois par génération de la bibliothèque — #1716.
 *
 * ## Ce qu'on corrige
 *
 * Les onglets Titres et Artistes de la Bibliothèque, et l'aléatoire filtré par
 * provenance, appelaient `api.getAllTracks()` à CHAQUE montage de l'écran :
 * sur la base de test (37 700 pistes visibles), 30,6 Mo de JSON redemandés
 * dès qu'on revenait à la Bibliothèque, et rien ne s'arrêtait quand on la
 * quittait en plein chargement.
 *
 * ## Ce que ce module promet
 *
 *  1. Mémorisé par génération (`generationBibliotheque`, qui avance à chaque
 *     `library.scan.completed` / `library.updated`) : revenir à l'écran ne
 *     recharge rien ; un scan rend la liste à refaire, sans rien relancer de
 *     lui-même.
 *  2. Dédoublonné : dix appelants pendant le chargement n'en font qu'un.
 *  3. Annulable : chaque appelant peut passer un `AbortSignal`. Sa promesse
 *     est alors rejetée (`AbortError`) ; le chargement partagé ne s'arrête
 *     que quand PLUS PERSONNE ne l'attend. Un appelant sans signal le garde
 *     en vie jusqu'au bout.
 */
import { get } from 'svelte/store';
import * as api from '../api';
import type { Track } from '../types';
import { generationBibliotheque } from './albumsPagines';

interface Vol {
  generation: number;
  promesse: Promise<Track[]>;
  ctrl: AbortController;
  /** Appelants qui attendent encore, ceux sans signal compris. */
  attente: number;
}

let liste: { generation: number; pistes: Track[] } | null = null;
let enVol: Vol | null = null;

function erreurAbandon(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

/** La liste entière est-elle déjà là pour la génération courante ? */
export function pistesEntieresConnues(): boolean {
  return liste != null && liste.generation === get(generationBibliotheque);
}

export function demanderToutesLesPistes(signal?: AbortSignal): Promise<Track[]> {
  if (signal?.aborted) return Promise.reject(erreurAbandon());
  const gen = get(generationBibliotheque);
  if (liste && liste.generation === gen) return Promise.resolve(liste.pistes);
  if (!enVol || enVol.generation !== gen) {
    const ctrl = new AbortController();
    const vol: Vol = {
      generation: gen,
      ctrl,
      attente: 0,
      promesse: api.getAllTracks(undefined, { signal: ctrl.signal }).then((pistes) => {
        // Un scan passé entre-temps : la liste décrit une bibliothèque
        // d'avant. On la rend à qui l'attendait, on ne la retient pas.
        if (get(generationBibliotheque) === gen) liste = { generation: gen, pistes };
        return pistes;
      }),
    };
    vol.promesse.then(
      () => { if (enVol === vol) enVol = null; },
      () => { if (enVol === vol) enVol = null; },
    );
    enVol = vol;
  }
  return rejoindre(enVol, signal);
}

function rejoindre(vol: Vol, signal?: AbortSignal): Promise<Track[]> {
  vol.attente++;
  if (!signal) return vol.promesse;
  return new Promise<Track[]>((resolve, reject) => {
    const quitter = () => {
      vol.attente--;
      if (vol.attente <= 0) {
        vol.ctrl.abort();
        if (enVol === vol) enVol = null;
      }
      reject(erreurAbandon());
    };
    signal.addEventListener('abort', quitter, { once: true });
    vol.promesse.then(
      (pistes) => { signal.removeEventListener('abort', quitter); resolve(pistes); },
      (e) => { signal.removeEventListener('abort', quitter); reject(e); },
    );
  });
}

/** Pour les témoins : tout à zéro, comme au premier chargement du module. */
export function _remiseAZeroPourTests(): void {
  liste = null;
  enVol = null;
}
