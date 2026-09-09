/**
 * Historique d'écoute : fusion des deux sources, et rejeu d'une entrée.
 *
 * Le client tient DEUX historiques et ils ne disent pas la même chose :
 *
 *  - `stores/history` — local, dans le navigateur, alimenté par la barre de
 *    transport. Il connaît la radio et le streaming, y compris ce que le
 *    serveur n'a pas su nommer ;
 *  - `/library/history` — serveur, partagé entre tous les clients, mais il ne
 *    retient que ce qu'il a pu rattacher à une piste.
 *
 * Aucune des deux ne suffit seule. Ce module tient la fusion, la déduplication
 * et le rejeu, parce que l'écran d'historique existe maintenant DEUX fois — le
 * client actuel et le nouveau — et qu'une logique de rejeu recopiée d'un écran
 * à l'autre finit par diverger. C'est exactement la divergence #1478 côté cœur
 * de streaming : deux boutons, deux vérités.
 *
 * Rien ici ne parle à l'utilisateur : ni notification, ni traduction. Le module
 * rend le libellé de ce qu'il a lancé, l'écran décide comment l'annoncer.
 */

import type { HistoryEntry } from './stores/history';
import type { Track } from './types';
import * as api from './api';
import { playAndSync } from './stores/zones';

/** Nombre d'entrées rendues par la fusion — au-delà, la liste n'est plus lue. */
const PLAFOND = 200;

/** Traduit les lignes de `/library/history` dans la forme du store local. */
export function entreesDepuisServeur(items: readonly any[]): HistoryEntry[] {
  return (items ?? []).map((e: any) => ({
    track: {
      id: e.track_id,
      title: e.title,
      artist_name: e.artist_name,
      album_title: e.album_title,
      duration_ms: e.duration_ms,
      source: e.source,
      source_id: e.source_id,
      album_id: e.album_id ?? null,
      cover_path: e.cover_url ?? null,
    } as Track,
    playedAt: e.listened_at,
    zoneName: `Zone ${e.zone_id ?? '?'}`,
  }));
}

/**
 * Fusionne local et serveur, puis ne garde qu'une ligne par piste : sa plus
 * récente écoute (demandé par Elie).
 *
 * Le local passe devant : il est plus récent que ce que le serveur a eu le
 * temps d'enregistrer, et il porte les titres de radio que le serveur ne sait
 * pas rattacher.
 */
export function fusionnerHistorique(
  local: readonly HistoryEntry[],
  serveur: readonly HistoryEntry[],
): HistoryEntry[] {
  let combine: HistoryEntry[];
  if (serveur.length === 0) combine = [...local];
  else if (local.length === 0) combine = [...serveur];
  else {
    const vus = new Set(local.map((e) => e.track.title + e.playedAt));
    combine = [...local, ...serveur.filter((e) => !vus.has(e.track.title + e.playedAt))];
  }

  const vues = new Set<string>();
  const rendu: HistoryEntry[] = [];
  for (const e of combine) {
    if (vues.has(cleDePiste(e.track))) continue;
    vues.add(cleDePiste(e.track));
    rendu.push(e);
  }
  return rendu.slice(0, PLAFOND);
}

/**
 * Clé de déduplication. Une piste de la bibliothèque a un identifiant ; une
 * piste de radio ou de service n'en a pas, on la désigne alors par sa source et
 * son titre — c'est le seul repère stable dont on dispose.
 */
function cleDePiste(t: Track): string {
  if (t.id != null) return `id:${t.id}`;
  const src = `${t.source ?? ''}:${t.source_id ?? ''}`;
  return `s:${src}:${(t.title || '').toLowerCase()}:${(t.artist_name || '').toLowerCase()}`;
}

/**
 * Instantané utilisable comme favori de radio — donc un TITRE, pas le nom de
 * la station, et pas le « Episode » que l'orchestrateur pose faute de mieux.
 */
export function estRadioEnregistrable(track: Track): boolean {
  if (track.source !== 'radio') return false;
  const titre = (track.title || '').trim();
  if (!titre) return false;
  if (titre.toLowerCase() === 'episode') return false;
  const station = (track.album_title || '').trim();
  const artiste = (track.artist_name || '').trim();
  if (station && titre.toLowerCase() === station.toLowerCase() && !artiste) return false;
  return true;
}

/** Métadonnées à renvoyer au serveur pour qu'il ne réinvente pas le titre. */
function metaDeRejeu(track: Track) {
  return {
    ...(track.title ? { title: track.title } : {}),
    ...(track.artist_name ? { artist_name: track.artist_name } : {}),
    ...(track.album_title ? { album_title: track.album_title } : {}),
    ...(track.cover_path ? { cover_path: track.cover_path } : {}),
    ...(track.duration_ms ? { duration_ms: track.duration_ms } : {}),
  };
}

/** Ce qui a été relancé : la nature du média et son libellé, à annoncer. */
export interface Rejeu {
  genre: 'radio' | 'piste';
  libelle: string;
}

/**
 * Relance une entrée dans la zone donnée.
 *
 * Quatre chemins, dans cet ordre — du plus sûr au plus approximatif :
 * radio, piste locale, piste de service, puis une recherche par titre pour les
 * lignes d'historique qui ne portent plus rien d'exploitable.
 *
 * Lève si rien n'a pu être lancé.
 */
export async function rejouerEntree(zoneId: number, entree: HistoryEntry): Promise<Rejeu> {
  const track = entree.track;

  if (track.source === 'radio' && track.source_id) {
    const libelle = track.album_title || track.title || '';
    const id = parseInt(track.source_id, 10);
    // Un identifiant numérique passe par /radios/{id}/play. Une URL de flux —
    // le cas courant d'un instantané de lecture — doit passer par play() AVEC
    // le titre, l'artiste et la pochette de l'historique, sinon l'orchestrateur
    // retombe sur « Episode » et jette l'illustration déjà affichée.
    if (!isNaN(id) && String(id) === track.source_id) {
      await api.playRadio(id, zoneId);
    } else {
      await playAndSync(zoneId, { source: 'radio', source_id: track.source_id, ...metaDeRejeu(track) });
    }
    return { genre: 'radio', libelle };
  }

  if (track.id) {
    await playAndSync(zoneId, { track_id: track.id });
    return { genre: 'piste', libelle: track.title || '' };
  }

  if (track.source && track.source !== 'local' && track.source_id) {
    await playAndSync(zoneId, { source: track.source, source_id: track.source_id, ...metaDeRejeu(track) });
    return { genre: 'piste', libelle: track.title || '' };
  }

  const titre = track.album_title || track.title;
  if (titre) {
    const res = await api.searchLibrary(titre);
    const pistes = res?.tracks ?? [];
    const avecAlbum = pistes.find((t: any) => t.album_id);
    if (avecAlbum?.album_id) {
      await playAndSync(zoneId, { album_id: avecAlbum.album_id });
      return { genre: 'piste', libelle: titre };
    }
    if (pistes[0]?.id) {
      await playAndSync(zoneId, { track_id: pistes[0].id });
      return { genre: 'piste', libelle: pistes[0].title || titre };
    }
  }

  if (track.file_path) {
    await playAndSync(zoneId, { file_path: track.file_path });
    return { genre: 'piste', libelle: track.title || '' };
  }

  throw new Error('entree d historique non rejouable');
}

/* ------------------------------------------------------------------ */
/* Favoris de radio depuis l'historique                                */
/* ------------------------------------------------------------------ */

/**
 * Un titre entendu à la radio n'a pas d'identifiant : on le retrouve par son
 * couple titre / artiste, et c'est cette clé-là qui sert d'index côté écran.
 */
export function cleFavoriRadio(titre?: string | null, artiste?: string | null): string {
  return `${titre ?? ''}\n${artiste ?? ''}`;
}

/** Les clés des titres radio déjà en favori. Rend un ensemble vide si l'appel échoue. */
export async function chargerFavorisRadio(): Promise<Set<string>> {
  try {
    const favs: any[] = await api.apiFetch('/radio-favorites?limit=500');
    return new Set((favs ?? []).map((f: any) => cleFavoriRadio(f.title, f.artist)));
  } catch {
    return new Set();
  }
}

/**
 * Ajoute ou retire le titre radio d'une entrée d'historique des favoris.
 * Rend `true` s'il est désormais en favori.
 */
export async function basculerFavoriRadio(entree: HistoryEntry, estDejaFavori: boolean): Promise<boolean> {
  const { rememberRadioFavListenAt, forgetRadioFavListenAt } = await import('./radioFavListenAt');
  const track = entree.track;
  if (estDejaFavori) {
    const favs: any[] = await api.apiFetch('/radio-favorites?limit=500');
    const trouve = (favs ?? []).find(
      (f: any) => f.title === track.title && (f.artist ?? '') === (track.artist_name ?? ''),
    );
    if (trouve) await api.apiDelete(`/radio-favorites/${trouve.id}`);
    forgetRadioFavListenAt(track.title, track.artist_name);
    return false;
  }
  const sourceId = track.source_id ?? '';
  await api.apiPost('/radio-favorites', {
    title: track.title,
    artist: track.artist_name ?? '',
    station_name: track.album_title ?? '',
    cover_url: track.cover_path ?? null,
    // Seule une URL sert de flux : un identifiant numérique de station n'en
    // est pas un, et le poser ici donnerait un favori injouable.
    stream_url: /^https?:\/\//i.test(sourceId) ? sourceId : null,
    saved_at: entree.playedAt || undefined,
  });
  rememberRadioFavListenAt(track.title, track.artist_name, entree.playedAt);
  return true;
}
