/**
 * Playlists importées au scan — Réglages › Bibliothèque › Options d'analyse.
 * web#2635 (laguespa, fil 2510, go de Bertrand du 03/11/2026).
 *
 * Le scan lit les fichiers .m3u/.m3u8/.pls rencontrés dans les dossiers de
 * musique et en fait des playlists (tune-server-rust#7503,
 * `tune_core::library::playlist_scan`). Chez un testeur, des dizaines de
 * playlists au nom de ses albums sont apparues sans qu'il en crée une, et une
 * playlist supprimée revenait au scan suivant.
 *
 * Deux choses ici :
 *  - la case reliée à {@link CLE_IMPORT_PLAYLISTS_SCAN}, que le serveur sert
 *    déjà par `GET`/`PATCH /system/config` (absente, elle vaut « actif ») ;
 *  - le retrait groupé des playlists déjà importées. Le serveur n'a pas de
 *    route pour cela : on supprime une à une, par `DELETE /playlists/{id}`.
 */
import type { Playlist } from './types';

export const CLE_IMPORT_PLAYLISTS_SCAN = 'scan_import_playlists';

/**
 * La description que le serveur pose sur une playlist importée au scan
 * (`playlist_scan.rs`, `create_with_entries(.., Some("Importée au scan"), ..)`).
 * Écrite en dur côté serveur, quelle que soit la langue : c'est la seule
 * marque qui distingue ces playlists de celles créées dans Tune.
 */
export const DESCRIPTION_IMPORT_SCAN = 'Importée au scan';

/**
 * Le profil propriétaire des playlists importées : le scan les crée toutes
 * sous `DEFAULT_PROFILE_ID` (= 1, `tune-http-types`), quel que soit le profil
 * actif du navigateur.
 */
export const PROFIL_DES_PLAYLISTS_DU_SCAN = 1;

/** La valeur publiée par `GET /system/config` : seul un « non » explicite coupe. */
export function importPlaylistsScanDepuisConfig(v: unknown): boolean {
  if (v === false || v === 0) return false;
  if (typeof v === 'string') {
    return !['false', '0', 'no', 'off'].includes(v.trim().replace(/^"|"$/g, '').toLowerCase());
  }
  return true;
}

/** Une playlist porte-t-elle la marque du scan ? Une playlist créée dans Tune, jamais. */
export function estImporteeAuScan(p: Pick<Playlist, 'description'> | null | undefined): boolean {
  return typeof p?.description === 'string' && p.description.trim() === DESCRIPTION_IMPORT_SCAN;
}

/** Les playlists importées au scan, parmi `liste`, avec un identifiant. */
export function playlistsImporteesAuScan(liste: readonly Playlist[] | null | undefined): Playlist[] {
  return (liste ?? []).filter((p) => p?.id != null && estImporteeAuScan(p));
}

export interface BilanRetrait {
  retirees: number[];
  echecs: number;
}

/**
 * Supprime les playlists données une à une, dans l'ordre. Un échec n'arrête
 * pas les suivantes : il est compté, et le bilan dit combien sont parties.
 */
export async function retirerPlaylists(
  liste: readonly Playlist[],
  supprimer: (id: number) => Promise<unknown>,
): Promise<BilanRetrait> {
  const retirees: number[] = [];
  let echecs = 0;
  for (const p of liste) {
    if (p.id == null || !estImporteeAuScan(p)) continue;
    try {
      await supprimer(p.id);
      retirees.push(p.id);
    } catch {
      echecs += 1;
    }
  }
  return { retirees, echecs };
}
