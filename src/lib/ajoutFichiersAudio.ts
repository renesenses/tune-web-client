/**
 * Ajouter à la file un fichier audio HORS bibliothèque — portage du dépôt de
 * fichiers de `QueueView` (Sergio : « glisser dans la playlist de la lecture
 * en cours »), que la phase 5 supprime.
 *
 * Deux temps : `POST /zones/upload` envoie le fichier et rend son chemin
 * temporaire côté serveur, puis la file reçoit un élément `source: 'upload'`.
 * On AJOUTE à la file, on ne remplace pas la lecture en cours.
 *
 * Écrit hors du composant pour que le bouton ET le dépôt sur la file passent
 * par le même chemin — deux copies auraient fini par diverger.
 */
import * as api from './api';

const EXTENSIONS_AUDIO = new Set([
  'flac', 'wav', 'mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'dsf', 'dff', 'wv', 'ape', 'alac',
]);

export function estFichierAudio(f: { name: string }): boolean {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSIONS_AUDIO.has(ext);
}

/** Valeur de l'attribut `accept` du sélecteur de fichiers. */
export const ACCEPT_AUDIO = [...EXTENSIONS_AUDIO].map((e) => `.${e}`).join(',');

export interface RapportAjout {
  ajoutes: string[];
  echecs: { fichier: string; message: string | null }[];
}

/** Envoie puis met en file chaque fichier audio, un par un, dans l'ordre. */
export async function ajouterFichiersALaFile(zoneId: number, fichiers: readonly File[]): Promise<RapportAjout> {
  const rapport: RapportAjout = { ajoutes: [], echecs: [] };
  for (const f of fichiers.filter(estFichierAudio)) {
    try {
      const r = await api.uploadAudioFile(f);
      await api.addToQueue(zoneId, {
        source: 'upload',
        source_id: r.file_path,
        title: r.title,
        artist_name: r.artist,
        album_title: r.album,
        duration_ms: r.duration_ms,
      });
      rapport.ajoutes.push(r.title || f.name);
    } catch (e: any) {
      rapport.echecs.push({ fichier: f.name, message: e?.message ?? null });
    }
  }
  return rapport;
}
