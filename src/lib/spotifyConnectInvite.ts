/**
 * « Spotify Connect d'abord » — renesenses/tune-server-rust#8198, volet 4
 * (étude, § 3c).
 *
 * Qui veut seulement ÉCOUTER Spotify sur ses enceintes n'a besoin d'aucun
 * compte développeur : Spotify Connect fait apparaître Tune dans l'application
 * Spotify du téléphone (Premium requis). La carte Spotify le propose donc
 * AVANT le parcours du compte (Client ID, adresse de retour, User
 * Management), qui ne sert qu'à parcourir sa bibliothèque dans Tune.
 *
 * Ce module décide seulement quoi montrer et quelle zone exposer ; il
 * réutilise `getSpotifyConnectStatus` / `enableSpotifyConnect`.
 */
import type { SpotifyConnectStatus } from './api';

export type EtatInvite = 'masque' | 'actif' | 'a_activer';

/**
 * - serveur sans récepteur, ou statut illisible : rien à proposer ;
 * - déjà activé : on le dit, sans bouton ;
 * - sinon : le bouton « Activer Spotify Connect ».
 */
export function etatInvite(st: (SpotifyConnectStatus & { available?: boolean }) | null | undefined): EtatInvite {
  if (!st || typeof st !== 'object') return 'masque';
  if (st.available === false || st.binary_available === false) return 'masque';
  return st.enabled ? 'actif' : 'a_activer';
}

/**
 * La zone à exposer sans rien demander : celle déjà retenue par le serveur,
 * sinon la zone courante, sinon la seule zone. `null` : il faut choisir, la
 * carte Spotify Connect le fait (zone et nom de l'appareil).
 */
export function zoneAExposer(
  st: Pick<SpotifyConnectStatus, 'zone_id'> | null | undefined,
  zoneCourante: number | null | undefined,
  zones: ReadonlyArray<{ id: number | null }>,
): number | null {
  const ids = zones.map((z) => z.id).filter((id): id is number => id != null);
  const existe = (id: number | null | undefined) => id != null && ids.includes(id);
  if (existe(st?.zone_id)) return st!.zone_id as number;
  if (existe(zoneCourante)) return zoneCourante as number;
  if (ids.length === 1) return ids[0];
  return null;
}
