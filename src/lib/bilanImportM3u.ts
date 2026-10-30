/**
 * Bilan d'un import de playlist `.m3u` (`POST /playlists/import/m3u`).
 *
 * web#2526 — l'import M3U de l'écran Playlists annonçait toujours un compte
 * plein : il lisait `missing`, un champ que le serveur n'envoie pas. Le
 * serveur rend (tune-server `routes/playlists.rs`, `import_m3u_file`) :
 *
 *   total_entries  lignes lues dans le fichier
 *   matched        lignes rapprochées d'une piste
 *   not_found      lignes sans piste correspondante
 *   lookup_errors  lignes qu'une erreur de base n'a pas permis de chercher
 *
 * Avec `missing` toujours absent, « 12 / 12 » s'affichait pour un fichier de
 * 60 lignes dont 48 introuvables : l'utilisateur croyait sa playlist complète.
 */
export interface ReponseImportM3u {
  matched?: number;
  total_entries?: number;
  not_found?: number;
  lookup_errors?: number;
  /** Ancien nom attendu par le client ; jamais envoyé, gardé en repli. */
  missing?: number;
}

export interface BilanImportM3u {
  rapprochees: number;
  total: number;
  /** Lignes du fichier qui ne sont PAS dans la playlist créée. */
  absentes: number;
}

const nombre = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

export function bilanImportM3u(r: ReponseImportM3u | null | undefined): BilanImportM3u {
  const rapprochees = nombre(r?.matched) ?? 0;
  const absentesDites = (nombre(r?.not_found) ?? nombre(r?.missing) ?? 0) + (nombre(r?.lookup_errors) ?? 0);
  const total = Math.max(nombre(r?.total_entries) ?? rapprochees + absentesDites, rapprochees);
  return { rapprochees, total, absentes: total - rapprochees };
}
