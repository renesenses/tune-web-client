/**
 * « Exporter vers… » de la page Ambiance — web#2218 (go de Bertrand, 19/10/2026, rc7).
 *
 * Le bouton « Sauvegarder » ne savait créer qu'une playlist LOCALE. Il propose
 * désormais aussi chaque service de streaming connecté qui sait créer une
 * playlist (Qobuz, TIDAL, Deezer, Spotify : ceux qui annoncent `supports_write`
 * dans `GET /playlist-manager/services`).
 *
 * ## Le chemin vers un service
 *
 * Le serveur n'a qu'UN moteur de transfert : `POST /playlist-manager/transfer`,
 * qui passe la demande au greffon « Playlists converter » (tune-server-rust#4741).
 * Sa source est une PLAYLIST — locale ou de service — et rien d'autre : aucune
 * route ne prend une liste d'identifiants de pistes à verser chez un service
 * (`/playlist-manager/merge` vers un service le ferait, mais elle contourne le
 * greffon, son rapport titre par titre et le refus Premium : ce n'est pas le
 * chemin du transfert). D'où, sans nouvelle route serveur :
 *
 *   1. créer une playlist locale TEMPORAIRE avec les titres de l'ambiance ;
 *   2. la transférer vers le service (`target_name` = le nom choisi) ;
 *   3. supprimer la playlist temporaire, que le transfert ait réussi ou non.
 *
 * L'étape 3 se joue après la RÉPONSE du transfert : le greffon a lu la source
 * pendant la requête (aperçu puis transfert, dans le même appel). Si la
 * suppression échoue, on le dit (`temporaireRestante`) au lieu de laisser une
 * playlist orpheline à l'insu de l'utilisateur.
 *
 * Les champs `create_on_target`, `match_threshold` et `include_approximate` ne
 * sont PAS envoyés : le moteur unique les ignore (appariement ISRC, puis titre
 * + artiste + durée à ±3 s, sans seuil réglable). Le greffon crée toujours la
 * playlist chez la cible — sauf si aucun titre n'est retrouvé, auquel cas il
 * n'en crée aucune (`etat: rien_a_transferer`).
 */
import * as api from './api';
import { estRefusPremium } from './premiumRefus';

export type CapacitesServices = Record<
  string,
  { authenticated: boolean; supports_write: boolean; supports_delete?: boolean }
>;

/** Un service proposé dans le menu. `connecte: false` → affiché, mais grisé. */
export type CibleService = { service: string; connecte: boolean };

/** L'ordre d'affichage des services connus ; les autres suivent, par nom. */
const ORDRE = ['qobuz', 'tidal', 'deezer', 'spotify'];

/**
 * Les services qui savent créer une playlist, connectés ou non.
 *
 * `local` est exclu : il a sa propre entrée, « Playlist locale ». Un service
 * qui ne sait pas écrire (YouTube, Bandcamp…) n'apparaît pas du tout : il n'y
 * a rien à lui proposer. Un service qui sait écrire mais n'est pas connecté
 * apparaît GRISÉ, pour que l'utilisateur sache pourquoi il manque.
 */
export function ciblesServices(caps: CapacitesServices | null | undefined): CibleService[] {
  if (!caps) return [];
  return Object.entries(caps)
    .filter(([nom, c]) => nom !== 'local' && c?.supports_write === true)
    .map(([service, c]) => ({ service, connecte: c.authenticated === true }))
    .sort((a, b) => {
      const ia = ORDRE.indexOf(a.service);
      const ib = ORDRE.indexOf(b.service);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.service.localeCompare(b.service);
    });
}

export type TitreNonRetrouve = { titre: string; artiste: string; raison: string | null };

export type ResultatExport =
  | { genre: 'local'; nom: string; total: number }
  | {
      genre: 'service';
      service: string;
      nom: string;
      retrouves: number;
      total: number;
      nonRetrouves: TitreNonRetrouve[];
      temporaireRestante: string | null;
    }
  /** Aucun titre retrouvé : le greffon n'a rien créé chez le service. */
  | { genre: 'aucun'; service: string; total: number; nonRetrouves: TitreNonRetrouve[]; temporaireRestante: string | null }
  | { genre: 'premium'; service: string; url: string | null; temporaireRestante: string | null }
  | { genre: 'greffon_absent'; service: string; temporaireRestante: string | null }
  | { genre: 'non_connecte'; service: string }
  | { genre: 'echec'; service: string; message: string; temporaireRestante: string | null };

type Api = Pick<
  typeof api,
  'createPlaylist' | 'addPlaylistTracks' | 'deletePlaylist' | 'getPlaylistManagerServices' | 'transferPlaylistV2'
>;

function nonRetrouvesDe(reponse: any): TitreNonRetrouve[] {
  const pistes = Array.isArray(reponse?.tracks) ? reponse.tracks : [];
  return pistes
    .filter((p: any) => p?.status === 'not_found')
    .map((p: any) => ({
      titre: String(p.title ?? ''),
      artiste: String(p.artist_name ?? ''),
      raison: typeof p.raison === 'string' ? p.raison : null,
    }));
}

function messageDe(e: unknown): string {
  const m = (e as { detail?: unknown } | null)?.detail;
  if (typeof m === 'string' && m) return m;
  return e instanceof Error ? e.message : String(e);
}

/** Exporter les titres d'une ambiance vers `service` (`'local'` ou un service). */
export async function exporterAmbiance(
  demande: { service: string; nom: string; ids: number[] },
  deps: Api = api,
): Promise<ResultatExport> {
  const { service, ids } = demande;
  const nom = demande.nom.trim();

  if (service === 'local') {
    // Le comportement d'avant, à l'identique : création puis ajout des titres.
    const creee = await deps.createPlaylist(nom);
    if (!creee.id) return { genre: 'echec', service, message: 'createPlaylist: no id', temporaireRestante: null };
    await deps.addPlaylistTracks(creee.id, ids);
    return { genre: 'local', nom, total: ids.length };
  }

  // L'état de connexion peut avoir changé depuis l'ouverture du menu : on le
  // relit AVANT de créer quoi que ce soit, pour ne pas fabriquer une playlist
  // temporaire qu'un transfert voué à l'échec laisserait derrière lui.
  const caps = await deps.getPlaylistManagerServices();
  if (!caps?.[service]?.authenticated || !caps[service].supports_write) {
    return { genre: 'non_connecte', service };
  }

  const temporaire = await deps.createPlaylist(nom);
  const idTemp = temporaire.id;
  if (!idTemp) {
    return { genre: 'echec', service, message: 'createPlaylist: no id', temporaireRestante: null };
  }
  let resultat: ResultatExport;
  try {
    await deps.addPlaylistTracks(idTemp, ids);
    const reponse = await deps.transferPlaylistV2({
      source_service: 'local',
      source_playlist_id: String(idTemp),
      target_service: service,
      target_name: nom,
    });
    const nonRetrouves = nonRetrouvesDe(reponse);
    const total = Number(reponse?.total_tracks ?? ids.length);
    const retrouves = Number(reponse?.matched ?? 0);
    if (reponse?.status === 'interrupted') {
      // Le lot répond 200 même quand la playlist n'a pas pu être versée : la
      // raison est dans `erreur`.
      resultat = {
        genre: 'echec',
        service,
        message: String(reponse?.erreur ?? reponse?.etat ?? 'interrupted'),
        temporaireRestante: null,
      };
    } else if (reponse?.etat === 'rien_a_transferer' || retrouves === 0) {
      resultat = { genre: 'aucun', service, total, nonRetrouves, temporaireRestante: null };
    } else {
      resultat = {
        genre: 'service',
        service,
        nom: String(reponse?.target_playlist_name ?? nom),
        retrouves,
        total,
        nonRetrouves,
        temporaireRestante: null,
      };
    }
  } catch (e) {
    if (estRefusPremium(e)) {
      const url = (e as { corps?: { upgrade_url?: unknown } }).corps?.upgrade_url;
      resultat = {
        genre: 'premium',
        service,
        url: typeof url === 'string' && /^https?:\/\//.test(url) ? url : null,
        temporaireRestante: null,
      };
    } else if ((e as { code?: unknown } | null)?.code === 'greffon_requis') {
      resultat = { genre: 'greffon_absent', service, temporaireRestante: null };
    } else {
      resultat = { genre: 'echec', service, message: messageDe(e), temporaireRestante: null };
    }
  }

  // La playlist temporaire ne sert qu'au transfert : l'utilisateur a demandé
  // un service, pas une copie locale.
  try {
    await deps.deletePlaylist(idTemp);
  } catch {
    if ('temporaireRestante' in resultat) resultat.temporaireRestante = nom;
  }
  return resultat;
}
