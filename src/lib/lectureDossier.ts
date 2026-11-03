/**
 * Lire, ou ajouter à la file, un DOSSIER avec tout son sous-arbre, dans
 * l'ordre — tune-server-rust#7597 (fil forum 2577, « Adding folder structure
 * recursively to queue? »).
 *
 * Le serveur construit la liste lui-même (`folder` dans le corps de
 * `POST /zones/{id}/play` et de `POST /zones/{id}/queue/add`) : ordre du
 * chemin, puis disque, piste et nom de fichier ; profil et exclusions
 * respectés ; au-delà de son plafond (5 000 pistes) il REFUSE en disant
 * combien, il ne lit jamais une partie en silence.
 *
 * Le client n'a jamais le sous-arbre : Répertoires ne charge que le dossier
 * ouvert, Oxygène une fenêtre de `LOAD_LIMIT` pistes, la Bibliothèque des
 * pages. Bâtir la liste ici mentirait dès que la vue est tronquée — c'est
 * pourquoi il n'y a qu'un `folder` dans ces corps, jamais de `track_ids`.
 *
 * Utilisé par Répertoires, Oxygène et la Bibliothèque (portée de dossier).
 */
import { get } from 'svelte/store';
import * as api from './api';
import { playAndSync } from './stores/zones';
import { notifications } from './stores/notifications';
import { t } from './i18n';
import { detailServeur } from './messageServeur';

function tr(cle: string): string {
  return get(t)(cle as any);
}

/** Le refus du serveur, dans la langue de l'interface (le serveur traduit
 *  ses refus nommés : `folder_too_large`, `folder_no_tracks`…). */
function signalerEchec(e: unknown): void {
  const message = e instanceof Error && e.message ? e.message : String(e ?? '');
  notifications.error(
    tr('browse.folderPlayError').replace('{erreur}', message),
    10000,
    detailServeur(e),
  );
}

/**
 * « Tout lire (sous-dossiers compris) » : remplace la file par le sous-arbre
 * de `dossier` et lance la lecture. Rend `true` si la lecture est partie.
 */
export async function lireDossier(zoneId: number | null | undefined, dossier: string | null | undefined): Promise<boolean> {
  if (!dossier) return false;
  if (zoneId == null) {
    notifications.error(tr('library.noZoneSelected'));
    return false;
  }
  try {
    await playAndSync(zoneId, { folder: dossier });
    return true;
  } catch (e) {
    signalerEchec(e);
    return false;
  }
}

/**
 * « Ajouter à la file (sous-dossiers compris) » : le sous-arbre à la FIN de la
 * file, ou à `position` (« lire ensuite » : position courante + 1).
 */
export async function ajouterDossierALaFile(
  zoneId: number | null | undefined,
  dossier: string | null | undefined,
  position?: number,
): Promise<boolean> {
  if (!dossier) return false;
  if (zoneId == null) {
    notifications.error(tr('library.noZoneSelected'));
    return false;
  }
  try {
    await api.addToQueue(zoneId, position == null ? { folder: dossier } : { folder: dossier, position });
    notifications.success(tr('browse.folderQueued'));
    return true;
  } catch (e) {
    signalerEchec(e);
    return false;
  }
}
