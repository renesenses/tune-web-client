/**
 * Favoris d'un objet de service (Qobuz, Tidal, …) — le SEUL chemin.
 *
 * Signalé par Didier (forum #1478) : mettre une piste Qobuz en favori depuis
 * la barre de lecture ne cochait pas le cœur de la même piste dans la liste de
 * l'album. Deux boutons, deux vérités.
 *
 * La cause n'était pas un défaut de rafraîchissement mais **deux chemins
 * différents** :
 *
 * - `HeartButton` écrivait dans `favoriteStreamingKeys` (les favoris de Tune,
 *   rattachés au profil) *et* recopiait vers le service ;
 * - la barre de lecture n'appelait que le service, et lisait son état par un
 *   aller-retour réseau au lieu du magasin.
 *
 * Le cœur de la barre pouvait donc être plein pendant que celui de la liste
 * restait vide : ils ne parlaient pas de la même chose. Cette divergence-là ne
 * se corrige pas en synchronisant deux implémentations — elle se corrige en
 * n'en gardant qu'une, d'où ce module.
 */
import { get } from 'svelte/store';
import {
  favoriteStreamingKeys,
  streamingFavKey,
  currentProfileId,
  loadProfiles,
} from './stores/profile';
import * as api from './api';

/**
 * `playlist` a rejoint la liste pour #2370 (Didier, fil 1541) : on pouvait
 * favoriser un album Qobuz, jamais une playlist Qobuz.
 *
 * Rien n'a eu à changer dans le mécanisme ci-dessous — il ne regarde le type
 * que pour fabriquer une clé et un pluriel. Ce qui manquait était le TYPE au
 * sens TypeScript (le compilateur refusait l'appel), le BOUTON sur la fiche
 * playlist, et surtout la RELECTURE (voir `fusionnerPlaylistsFavorites`).
 */
export type StreamingItemType = 'track' | 'album' | 'artist' | 'playlist';

export interface StreamingRef {
  itemType: StreamingItemType;
  service: string;
  serviceId: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
}

/** Clé d'appartenance, ou `null` quand l'objet n'est pas identifiable.
 *
 *  Un identifiant vide n'est pas une clé : il ferait cocher le cœur de tous
 *  les objets sans identifiant du même service. */
export function favKeyOf(ref: Pick<StreamingRef, 'itemType' | 'service' | 'serviceId'> | null | undefined): string | null {
  if (!ref) return null;
  const id = (ref.serviceId ?? '').trim();
  const svc = (ref.service ?? '').trim();
  if (!id || !svc) return null;
  return streamingFavKey(ref.itemType, svc, id);
}

/** L'objet est-il en favori, d'après le jeu de clés donné ? */
export function isStreamingFavorite(
  keys: ReadonlySet<string>,
  ref: Pick<StreamingRef, 'itemType' | 'service' | 'serviceId'> | null | undefined,
): boolean {
  const k = favKeyOf(ref);
  return k != null && keys.has(k);
}

/** Le type au pluriel qu'attend l'API du service (`track` → `tracks`). */
export function serviceFavType(t: StreamingItemType): ServiceFavType {
  return `${t}s` as ServiceFavType;
}

export type ServiceFavType = 'tracks' | 'albums' | 'artists' | 'playlists';

/** Une playlist en favori, telle que l'écran Favoris la rend — locale OU de
 *  service. Les deux vivent dans le même onglet et dans la même liste. */
export interface PlaylistFavorite {
  /** `playlists.id` pour une locale ; `null` pour une playlist de service, qui
   *  n'existe pas dans notre base et n'a donc aucun identifiant entier. */
  id: number | null;
  name: string;
  track_count?: number;
  cover_path?: string | null;
  /** `local`, `qobuz`, `tidal`… Lu par la pastille de source et par le filtre. */
  source: string;
  /** Identifiant chez le service ; absent pour une playlist locale. */
  source_id?: string;
}

/** Forme minimale d'une ligne de `streaming_favorites`, tous types confondus. */
interface FavoriDeService {
  item_type: string;
  service: string;
  service_id: string;
  title?: string | null;
  cover_url?: string | null;
}

/**
 * Les playlists en favori d'un profil : les locales ET celles des services.
 *
 * #2370. L'onglet Playlists ne lisait que `local.playlists`. Une playlist
 * Qobuz mise en favori était donc bien écrite dans `streaming_favorites` —
 * la route `/profiles/{id}/favorites/streaming/add` ne valide pas
 * `item_type` — mais AUCUN écran ne la relisait. C'est le piège que le ticket
 * nomme explicitement : « ajouter le type en écriture seule laisserait un
 * favori qu'aucun écran ne peut relire ».
 *
 * Une entrée sans service ou sans identifiant est écartée : la ligne
 * s'afficherait, et ne s'ouvrirait sur rien.
 */
export function fusionnerPlaylistsFavorites(
  locales: ReadonlyArray<{ id: number | null; name: string; track_count?: number }>,
  streaming: ReadonlyArray<FavoriDeService>,
): PlaylistFavorite[] {
  const out: PlaylistFavorite[] = locales.map((p) => ({
    id: p.id,
    name: p.name,
    track_count: p.track_count,
    source: 'local',
  }));

  // Deux services numérotent leurs playlists chacun de leur côté : la clé de
  // dédoublonnage porte le service, sinon `qobuz:77` cacherait `tidal:77`.
  const vus = new Set<string>();
  for (const f of streaming) {
    if (f.item_type !== 'playlist') continue;
    const service = (f.service ?? '').trim();
    const serviceId = (f.service_id ?? '').trim();
    if (!service || !serviceId) continue;
    const cle = `${service}:${serviceId}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push({
      id: null,
      name: f.title ?? '',
      cover_path: f.cover_url ?? null,
      source: service,
      source_id: serviceId,
    });
  }
  return out;
}

/**
 * Bascule le favori d'un objet de service.
 *
 * Met à jour le magasin d'abord — le cœur doit répondre au doigt, pas au
 * réseau — puis écrit côté profil, et **revient en arrière si cet appel
 * échoue**. La recopie vers les favoris propres du service (Qobuz, Tidal) est
 * au mieux : un service sans API de favoris (YouTube) ou une panne passagère
 * ne doit pas défaire le cœur de Tune.
 *
 * Renvoie le nouvel état, ou `null` si rien n'a pu être fait.
 */
export async function toggleStreamingFavorite(ref: StreamingRef): Promise<boolean | null> {
  const key = favKeyOf(ref);
  if (!key) return null;

  let pid = get(currentProfileId);
  if (!pid) {
    // Aucun profil chargé : `loadProfiles` en crée un par défaut, sinon le
    // cœur serait un bouton sans effet et sans message (Elie).
    try { await loadProfiles(); } catch { /* le test ci-dessous tranche */ }
    pid = get(currentProfileId);
  }
  if (!pid) return null;

  const wasFav = get(favoriteStreamingKeys).has(key);
  favoriteStreamingKeys.update((s) => { wasFav ? s.delete(key) : s.add(key); return s; });

  try {
    if (wasFav) {
      await api.removeProfileStreamingFavorite(pid, {
        item_type: ref.itemType,
        service: ref.service,
        service_id: ref.serviceId,
      });
    } else {
      await api.addProfileStreamingFavorite(pid, {
        item_type: ref.itemType,
        service: ref.service,
        service_id: ref.serviceId,
        title: ref.title,
        artist: ref.artist,
        album: ref.album,
        cover_url: ref.coverUrl,
      });
    }
  } catch (e) {
    favoriteStreamingKeys.update((s) => { wasFav ? s.add(key) : s.delete(key); return s; });
    console.error('Toggle streaming favorite error:', e);
    return wasFav;
  }

  const svcType = serviceFavType(ref.itemType);
  if (wasFav) {
    api.removeStreamingFavorite(ref.service, svcType, ref.serviceId).catch(() => {});
  } else {
    api.addStreamingFavorite(ref.service, svcType, ref.serviceId).catch(() => {});
  }
  return !wasFav;
}
