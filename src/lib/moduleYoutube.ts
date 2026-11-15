/**
 * tune-web-client#2441 (go de Bertrand, 12/11 : rc12) — les Réglages YouTube
 * disent si le module de lecture (yt-dlp) est à jour.
 *
 * `GET /system/youtube/status` (tune-server-rust#7166, #6967) ajoute à
 * `installed` / `version` / `status` :
 *  - `latest_version` : la dernière version publiée, ou `null` ;
 *  - `up_to_date` : `true`, `false`, ou `null` quand l'une des deux versions
 *    est inconnue ;
 *  - `latest_error` : pourquoi la dernière version n'a pas pu être lue.
 *
 * Rend la ligne à afficher sous « Activée (version) » : une clé de traduction
 * et ses paramètres, ou `null` (module absent, ou serveur antérieur qui ne
 * publie aucun des trois champs : on se tait plutôt que d'affirmer « à jour »).
 *
 * 🔴 Jamais « à jour » sans `up_to_date === true` : une dernière version
 * illisible se DIT, avec sa raison.
 */
export interface EtatModuleYoutube {
  installed?: boolean | null;
  version?: string | null;
  latest_version?: string | null;
  up_to_date?: boolean | null;
  latest_error?: string | null;
}

export type LigneModuleYoutube =
  | { etat: 'a_jour'; cle: 'settings.youtubeModuleUpToDate'; params: { latest: string } }
  | { etat: 'mise_a_jour'; cle: 'settings.youtubeModuleUpdateAvailable'; params: { latest: string } }
  | { etat: 'inconnue'; cle: 'settings.youtubeModuleLatestUnknown'; params: { reason: string } };

export function ligneModuleYoutube(s: EtatModuleYoutube | null | undefined): LigneModuleYoutube | null {
  if (!s || !s.installed) return null;
  const champsPublies = 'latest_version' in s || 'up_to_date' in s || 'latest_error' in s;
  if (!champsPublies) return null;
  const derniere = typeof s.latest_version === 'string' && s.latest_version.trim() ? s.latest_version.trim() : null;
  if (s.up_to_date === true && derniere) {
    return { etat: 'a_jour', cle: 'settings.youtubeModuleUpToDate', params: { latest: derniere } };
  }
  if (s.up_to_date === false && derniere) {
    return { etat: 'mise_a_jour', cle: 'settings.youtubeModuleUpdateAvailable', params: { latest: derniere } };
  }
  const raison = typeof s.latest_error === 'string' && s.latest_error.trim() ? s.latest_error.trim() : '?';
  return { etat: 'inconnue', cle: 'settings.youtubeModuleLatestUnknown', params: { reason: raison } };
}
