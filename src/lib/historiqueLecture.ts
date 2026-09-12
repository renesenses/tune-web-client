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
import { cleDObjet, estRegroupable } from './historiqueParContexte';
import type { Track } from './types';
import * as api from './api';
import { playAndSync } from './stores/zones';
// La clé d'index des favoris de radio, UNE fois pour tout le client — voir
// `cleFavoriRadio` plus bas. Le module ne touche au stockage que dans ses
// fonctions : l'importer ne lit rien.
import { radioFavListenKey } from './radioFavListenAt';

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
    zoneId: e.zone_id ?? null,
    zoneName: `Zone ${e.zone_id ?? '?'}`,
    // #904 — les trois champs que le serveur sert depuis la v0.9.131 et que
    // ce mapping jetait. `context_id` n'est jamais interprété ici : il peut
    // être un entier, un identifiant de service, ou une URL entière.
    contexte: {
      type: e.context_type ?? null,
      id: e.context_id ?? null,
      position: e.context_position ?? null,
    },
  }));
}

/**
 * Le NOM de la zone où l'écoute a eu lieu.
 *
 * FabienM, fil forum 1739, point 8 : « Menu historique : il manque
 * l'information de la zone jouée pour chaque titre dans la V1. Dans
 * l'interface actuelle la zone apparaît. »
 *
 * Deux choses manquaient, pas une :
 *
 *  1. L'écran v2 ne rendait PAS `zoneName` — `HistoryView.svelte:149` l'affiche
 *     depuis toujours, `HistoriqueV2` l'avait perdu au portage.
 *  2. `entreesDepuisServeur` fabriquait « Zone 3 » à partir du seul numéro,
 *     parce que le serveur ne rend que `zone_id`. Afficher « Zone 3 » quand la
 *     zone s'appelle « Salon » ne répond pas à la question posée.
 *
 * On résout donc le numéro contre les zones connues, et on ne retombe sur le
 * libellé fabriqué que si la zone a disparu depuis (renommée, supprimée) :
 * mieux vaut « Zone 3 » qu'une ligne muette, mais c'est le dernier recours.
 */
export function nomDeZone(
  entree: { zoneId?: number | null; zoneName?: string },
  zones: readonly { id?: number | null; name?: string | null }[],
): string {
  const id = entree.zoneId ?? null;
  if (id != null) {
    const z = zones.find((x) => x.id === id);
    if (z?.name) return z.name;
  }
  // Une écoute locale porte déjà le vrai nom : c'est le client qui l'a écrit
  // au moment de lancer la lecture (`playbackHistory.add`).
  return entree.zoneName ?? '';
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
    const cle = cleDeLigne(e);
    if (vues.has(cle)) continue;
    vues.add(cle);
    rendu.push(e);
  }
  return rendu.slice(0, PLAFOND);
}

/**
 * Clé de déduplication d'une LIGNE.
 *
 * 🔴 #904 — elle valait la seule piste, et « chaque titre une fois » écrasait
 * alors la même piste écoutée depuis DEUX objets différents. Le schéma de
 * FabienM (fil 1649) montre précisément « Titre A1T1 » deux fois, sous
 * « Album A1 » et sous « Artiste A1 » : la règle d'origine l'aurait supprimé.
 *
 * On la RESTREINT au lieu de l'abandonner : deux écoutes du même titre depuis
 * le même objet se replient toujours sur une ligne — c'est ce que l'arbitrage
 * d'origine voulait — mais deux objets distincts gardent chacun la leur.
 */
function cleDeLigne(e: HistoryEntry): string {
  const c = e.contexte;
  const obj = estRegroupable(c) ? cleDObjet(c!) : '';
  return `${cleDePiste(e.track)}@${obj}`;
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
 *
 * 🔴 #874 — ELLE NE RECOPIE PLUS LA FORMULE, ELLE L'EMPRUNTE.
 *
 * `radioFavListenKey` indexait déjà exactement la même chose — un favori de
 * radio par titre et artiste — pour la barre de transport, l'écran de lecture,
 * l'écran des radios et celui des favoris. Cette fonction en tenait une
 * SECONDE copie, écrite à l'identique, pour l'historique et rien d'autre.
 *
 * Deux formules pour un seul index, c'est une divergence en attente : le jour
 * où l'une se met à découper ou à normaliser autrement, le cœur de
 * l'historique cesse de s'allumer pour un titre que les quatre autres écrans
 * tiennent pour un favori — sans erreur, sans message, et sans rien qui le
 * fasse voir. On délègue donc, et il ne reste qu'une vérité.
 *
 * Le couple ENTIER fait la clé : deux titres homonymes d'artistes différents
 * — « Hallelujah » de Cohen et celle de Buckley — désignent deux favoris, pas
 * un. `historiqueV2.test.ts` le tient.
 */
export function cleFavoriRadio(titre?: string | null, artiste?: string | null): string {
  return radioFavListenKey(titre, artiste);
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
