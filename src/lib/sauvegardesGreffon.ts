/**
 * Les sauvegardes de playlists de l'écran v2, par le greffon « Playlists
 * converter » (tune-server-rust#4741, après la rc3).
 *
 * Les routes `/playlist-manager/backup(s)*` doublonnaient les snapshots du
 * greffon ; le serveur ne les garde plus qu'une version, comme alias
 * dépréciés, pour les anciens clients. Ce module est le seul chemin du client
 * vers le filet : prendre une copie datée de chaque playlist, et recréer une
 * playlist depuis sa copie la plus récente.
 */
import * as api from './api';
import { estRefusPremium } from './premiumRefus';

/** Une playlist à copier : `service: "local"` pour la bibliothèque. */
export interface PlaylistACopier {
  service: string;
  playlist_id: string;
  nom: string;
}

/** Pourquoi le panneau ne peut rien faire, quand ce n'est pas une panne. */
export interface SauvegardeImpossible {
  motif: 'premium' | 'greffon';
  /** Le lien vers l'offre, seulement s'il est en http(s). */
  url: string | null;
}

/**
 * Un refus qui n'est pas une panne : Premium (402 `premium_required`, garde
 * de l'hôte sur un greffon premium) ou greffon absent (404 `plugin not found`
 * ou `wasm plugins not loaded`). `null` pour une vraie panne.
 */
export function motifSauvegardeImpossible(e: unknown): SauvegardeImpossible | null {
  if (estRefusPremium(e)) {
    const url = (e as { corps?: { upgrade_url?: unknown } }).corps?.upgrade_url;
    return { motif: 'premium', url: typeof url === 'string' && /^https?:\/\//.test(url) ? url : null };
  }
  if ((e as { status?: number } | null)?.status === 404) return { motif: 'greffon', url: null };
  return null;
}

/** Toutes les playlists de l'écran : la bibliothèque, puis chaque service. */
export function playlistsACopier(
  locales: Array<{ id?: number | null; name: string }>,
  parService: Record<string, Array<{ source_id?: string | null; name: string }>>,
): PlaylistACopier[] {
  const toutes: PlaylistACopier[] = [];
  for (const pl of locales) {
    if (pl?.id != null) toutes.push({ service: 'local', playlist_id: String(pl.id), nom: pl.name });
  }
  for (const [service, liste] of Object.entries(parService)) {
    for (const pl of liste ?? []) {
      if (pl?.source_id) toutes.push({ service, playlist_id: String(pl.source_id), nom: pl.name });
    }
  }
  return toutes;
}

/**
 * Une copie datée de chaque playlist, l'une après l'autre. Un refus (Premium,
 * greffon absent) vaut pour toutes : on s'arrête au premier.
 */
export async function copierTout(
  playlists: PlaylistACopier[],
): Promise<{ reussies: number; echecs: number; impossible: SauvegardeImpossible | null }> {
  let reussies = 0;
  let echecs = 0;
  for (const pl of playlists) {
    try {
      await api.convertisseurPrendreSnapshot(pl.service, pl.playlist_id, pl.nom);
      reussies++;
    } catch (e) {
      const impossible = motifSauvegardeImpossible(e);
      if (impossible) return { reussies, echecs, impossible };
      echecs++;
    }
  }
  return { reussies, echecs, impossible: null };
}

/**
 * Recrée la playlist depuis sa copie la plus récente, chez son service
 * (mode `recreer` : l'ancienne n'est ni modifiée ni supprimée). Aperçu, puis
 * accord : le geste de l'utilisateur vaut accord.
 */
export async function recreerDepuisLaPlusRecente(service: string, playlistId: string) {
  const { snapshots } = await api.convertisseurSnapshots(service, playlistId);
  const plusRecente = snapshots?.[0];
  if (!plusRecente) throw new Error('aucune copie');
  const { plan } = await api.convertisseurApercuRestauration(plusRecente.snapshot_id, 'recreer');
  return api.convertisseurRestaurer(plan.plan_id);
}
