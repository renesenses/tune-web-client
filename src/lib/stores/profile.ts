import { writable, get } from 'svelte/store';
import * as api from '../api';
import type { StreamingItemType } from '../streamingFavorites';

export interface Profile {
  id: number;
  /**
   * L'IDENTIFIANT de connexion, pas le nom affichable.
   *
   * Mesure sur le .18 le 03/09/2026 : le serveur rend
   * `{"display_name":"Bertrand","name":"bertrand@mozaiklabs.fr"}`. `name` est
   * l'adresse ; le prenom est dans `display_name`, que ce type ignorait.
   */
  name: string;
  /** Le nom tel qu'on l'ecrit. Absent des serveurs qui ne le servent pas. */
  display_name?: string | null;
  avatar_color: string;
}

export interface Favorites {
  tracks: import('../types').Track[];
  albums: import('../types').Album[];
  artists: import('../types').Artist[];
}

const STORAGE_KEY = 'tune-profile-id';

function loadProfileId(): number | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return parseInt(stored, 10);
  } catch { /* ignore */ }
  return null;
}

function saveProfileId(id: number | null) {
  try {
    if (id !== null) {
      localStorage.setItem(STORAGE_KEY, String(id));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

// Capture whether a profile was already remembered at page load — BEFORE
// loadProfiles() can default currentProfileId to profiles[0] (which persists an
// id and would mask 'first use'). The "Who's listening?" picker uses this to
// only appear on genuine first use, not on every hard refresh: the selected
// profile is already persisted, so re-picking it each refresh is pure friction
// (Bertrand + Fabien).
const initialStoredProfileId = loadProfileId();
export const hadStoredProfile = initialStoredProfileId !== null;
export const currentProfileId = writable<number | null>(initialStoredProfileId);
currentProfileId.subscribe(saveProfileId);

export const profiles = writable<Profile[]>([]);
export const profileReady = writable<boolean>(false);

// Favorite ids stored as sets so HeartButton can answer
// 'is X favorited?' in O(1) without hitting the API per row.
// Without this, opening Library/Tracks (30k+ rows) fired 30k+ /favorites/check
// requests and Chrome refused with ERR_INSUFFICIENT_RESOURCES.
export const favoriteTrackIds = writable<Set<number>>(new Set());
export const favoriteAlbumIds = writable<Set<number>>(new Set());
export const favoriteArtistIds = writable<Set<number>>(new Set());
/**
 * Playlists en favori.
 *
 * NOTE DE FUSION (04/09/2026) : `main` déclarait aussi ce magasin, en une
 * ligne, dans le même commit #2442 qui apporte les favoris de facette. Les
 * deux versions sont identiques dans le code — on garde celle-ci pour sa
 * documentation, et les facettes de `main` suivent juste en dessous.
 *
 * Le serveur sait déjà les stocker : `LOCAL_ITEM_TYPES` inclut `playlist`, et
 * l'instantané d'identité est figé à l'ajout — sans quoi le cœur s'éteindrait
 * dès que l'id change (import M3U rejoué, playlist recréée, bascule
 * SQLite→PostgreSQL). Seul le client ne les lisait pas.
 */
export const favoritePlaylistIds = writable<Set<number>>(new Set());
/**
 * Collections en favori — DEUX ensembles, et non un seul.
 *
 * Les deux sortes ont des espaces d'identifiants indépendants qui se
 * recouvrent : sur le serveur de Bertrand, l'id 1 est à la fois la collection
 * normale « favorites » et l'intelligente « 💎 Audiophile » (02/09/2026). Un
 * ensemble unique allumerait le cœur de l'une en mettant l'autre en favori.
 */
export const favoriteCollectionIds = writable<Set<number>>(new Set());
export const favoriteSmartCollectionIds = writable<Set<number>>(new Set());

// Favoris de FACETTE — le label d'abord (#2442). Des CHAÎNES, pas des ids : un
// label n'a pas d'identifiant côté serveur, il est désigné par sa valeur telle
// que la facette la sélectionne. Clé = `${facet}:${value}`.
export const favoriteFacetKeys = writable<Set<string>>(new Set());

export function facetFavKey(facet: string, value: string): string {
  return `${facet}:${value.trim()}`;
}

// Streaming favorites (Qobuz/Tidal/… items hearted in Tune, stored per-profile
// with metadata). Keyed by `${item_type}:${service}:${service_id}` so a shared
// HeartButton on every streaming row answers 'is X favorited?' in O(1) without
// an API call per row — same reasoning as the local id sets above.
export const favoriteStreamingKeys = writable<Set<string>>(new Set());

/**
 * Les PISTES favorites de streaming, indexées par titre + artiste normalisés.
 *
 * Bertrand, 05/09/2026 : « si une piste en streaming est en favori et que j'ai
 * la piste en local, elle devrait être aussi en favori, non ? ». Le serveur
 * dit déjà oui — pour les règles. `track_favorites_sub` y unit les favoris
 * locaux et les pistes locales dont le titre et l'artiste normalisés
 * correspondent à un favori de streaming du même profil.
 *
 * L'interface, elle, disait non : la réponse du serveur porte `title` et
 * `artist` sur chaque favori, et le client n'en gardait que la clé
 * `type:service:identifiant` — il JETAIT les deux champs, donc ne pouvait pas
 * faire le rapprochement.
 *
 * On les garde. Le cœur d'une piste locale se remplit désormais quand son
 * jumeau distant est en favori.
 */
export const favoriteStreamingTrackKeys = writable<Set<string>>(new Set());

/**
 * La clé de rapprochement, reproduite À L'IDENTIQUE du serveur :
 *
 *     lower(trim(t9.title)) = lower(trim(sf9.title))
 *     lower(trim(coalesce(ar9.name,''))) = lower(trim(coalesce(sf9.artist,'')))
 *
 * Volontairement exacte-normalisée, sans approximation : un titre orthographié
 * différemment ne correspond pas, et c'est assumé côté serveur. Toute latitude
 * prise ici ferait diverger le cœur affiché de ce que retiennent les règles.
 */
export function clePisteJumelee(
  titre: string | null | undefined,
  artiste: string | null | undefined,
): string {
  return `${(titre ?? '').trim().toLowerCase()}\u0000${(artiste ?? '').trim().toLowerCase()}`;
}

export function streamingFavKey(
  itemType: StreamingItemType,
  service: string,
  serviceId: string,
): string {
  return `${itemType}:${service}:${serviceId}`;
}

export async function loadFavoriteIds(profileId: number | null): Promise<void> {
  if (profileId === null) {
    favoriteTrackIds.set(new Set());
    favoriteAlbumIds.set(new Set());
    favoriteArtistIds.set(new Set());
    favoritePlaylistIds.set(new Set());
    favoriteCollectionIds.set(new Set());
    favoriteSmartCollectionIds.set(new Set());
    favoriteFacetKeys.set(new Set());
    favoriteStreamingKeys.set(new Set());
    favoriteStreamingTrackKeys.set(new Set());
    return;
  }
  try {
    const favs = await api.getFavorites(profileId);
    favoriteTrackIds.set(new Set((favs.tracks ?? []).map((t: any) => t.id)));
    favoriteAlbumIds.set(new Set((favs.albums ?? []).map((a: any) => a.id)));
    favoriteArtistIds.set(new Set((favs.artists ?? []).map((a: any) => a.id)));
    favoritePlaylistIds.set(new Set((favs.playlists ?? []).map((p: any) => p.id)));
    favoriteCollectionIds.set(new Set(favs.collectionIds ?? []));
    favoriteSmartCollectionIds.set(new Set(favs.smartCollectionIds ?? []));
  } catch (e) {
    console.error('Load favorite ids error:', e);
  }
  try {
    // Un échec ici ne doit pas vider les ensembles d'ids déjà chargés : chaque
    // famille de favoris a son propre appel, et son propre try.
    const facets = await api.getFacetFavorites(profileId);
    favoriteFacetKeys.set(new Set(facets.map((f) => facetFavKey(f.facet, f.value))));
  } catch (e) {
    console.error('Load facet favorites error:', e);
  }
  try {
    const sfavs = await api.getProfileStreamingFavorites(profileId);
    favoriteStreamingKeys.set(
      new Set(sfavs.map((f) => streamingFavKey(f.item_type, f.service, f.service_id))),
    );
    // Un favori SANS titre ne peut rapprocher personne : le serveur l'écarte
    // aussi (`sf9.title IS NOT NULL`).
    favoriteStreamingTrackKeys.set(
      new Set(
        sfavs
          .filter((f: any) => f.item_type === 'track' && f.title)
          .map((f: any) => clePisteJumelee(f.title, f.artist)),
      ),
    );
  } catch (e) {
    console.error('Load streaming favorite keys error:', e);
  }

  // Sans `await` : les favoris locaux sont deja affiches, ceux des services les
  // rejoignent quand ils arrivent.
  void reprendreFavorisDesServices();
}

/**
 * 🔴 REPRISE des favoris poses CHEZ les services.
 *
 * Bertrand, 05/09/2026 : « le cœur ne rougit toujours pas sur Get Lucky ». Ce
 * titre EST dans ses favoris Qobuz — mesure sur le .18, `source_id 9140031`,
 * parmi 14 pistes — mais il n'est pas dans `streaming_favorites`, la table de
 * Tune, qui ne recoit que les cœurs cliques DANS Tune. Le cœur restait donc
 * vide, et les regles ne les comptaient pas non plus (issue serveur #3419).
 *
 * On lit donc aussi ce que disent les services eux-memes, et on le verse dans
 * les deux index : les cles `type:service:id` — pour le cœur d'un objet DE
 * service — et les cles titre+artiste — pour le jumelage avec une piste locale.
 *
 * ⚠️ Ce que ce contournement NE fait PAS : les collections intelligentes sont
 * evaluees en SQL par le serveur, sur `streaming_favorites`. Elles resteront
 * aveugles a ces favoris tant que la reprise n'existera pas cote serveur.
 *
 * Le cout est un appel par service authentifie. Il part APRES les ensembles
 * principaux et ne les bloque pas : un service lent ne doit pas retarder
 * l'affichage des favoris locaux. Chaque service tolere l'echec pour lui seul.
 */
async function reprendreFavorisDesServices(): Promise<void> {
  let services: Record<string, any> = {};
  try {
    services = (await api.getStreamingServices()) ?? {};
  } catch {
    return;
  }
  const connectes = Object.entries(services)
    .filter(([, st]: [string, any]) => st?.authenticated)
    .map(([nom]) => nom);
  if (!connectes.length) return;

  await Promise.allSettled(
    connectes.map(async (svc) => {
      const types: Array<['tracks' | 'albums' | 'artists', StreamingItemType]> = [
        ['tracks', 'track'], ['albums', 'album'], ['artists', 'artist'],
      ];
      for (const [route, type] of types) {
        try {
          const d: any = await api.getStreamingFavorites(svc, route);
          const items: any[] = d?.[route] ?? d?.items ?? (Array.isArray(d) ? d : []);
          if (!items.length) continue;
          favoriteStreamingKeys.update((set) => {
            for (const it of items) {
              const sid = it?.source_id ?? it?.id;
              if (sid) set.add(streamingFavKey(type, svc, String(sid)));
            }
            return new Set(set);
          });
          if (type === 'track') {
            favoriteStreamingTrackKeys.update((set) => {
              for (const it of items) {
                const titre = it?.title;
                if (titre) set.add(clePisteJumelee(titre, it?.artist_name ?? it?.artist));
              }
              return new Set(set);
            });
          }
        } catch { /* ce service, ce type : tant pis, les autres continuent */ }
      }
    }),
  );
}

// Reload favorites whenever the active profile changes.
currentProfileId.subscribe((pid) => {
  loadFavoriteIds(pid);
});

export async function loadProfiles(): Promise<void> {
  try {
    const list = await api.getProfiles();
    profiles.set(list);

    // If no profiles exist, auto-create "Default"
    if (list.length === 0) {
      const created = await api.createProfile({ name: 'Default', avatar_color: '#6366f1' });
      profiles.set([created]);
      currentProfileId.set(created.id);
    } else {
      // If stored id is invalid or null, select first profile
      const curId = get(currentProfileId);
      if (curId === null || !list.find((p: Profile) => p.id === curId)) {
        currentProfileId.set(list[0].id);
      }
    }
    profileReady.set(true);
  } catch (e) {
    console.error('Load profiles error:', e);
  }
}

export async function createProfile(name: string, avatarColor: string): Promise<Profile | null> {
  try {
    const created = await api.createProfile({ name, avatar_color: avatarColor });
    profiles.update((list) => [...list, created]);
    currentProfileId.set(created.id);
    return created;
  } catch (e: any) {
    // Handle 409 — profile already exists, auto-select it
    if (e?.message?.includes('409') || e?.status === 409) {
      const existing = get(profiles).find(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (existing) {
        currentProfileId.set(existing.id);
        return existing;
      }
      // Refresh profiles and try again
      await loadProfiles();
      const refreshed = get(profiles).find(
        (p) => p.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (refreshed) {
        currentProfileId.set(refreshed.id);
        return refreshed;
      }
    }
    console.error('Create profile error:', e);
    return null;
  }
}

export async function updateProfile(id: number, name: string, avatarColor: string): Promise<Profile | null> {
  try {
    const updated = await api.updateProfile(id, { name, avatar_color: avatarColor });
    profiles.update((list) =>
      list.map((p) => (p.id === id ? { ...p, name: updated.name ?? name, avatar_color: updated.avatar_color ?? avatarColor } : p))
    );
    return { id, name: updated.name ?? name, avatar_color: updated.avatar_color ?? avatarColor };
  } catch (e) {
    console.error('Update profile error:', e);
    return null;
  }
}

export async function selectProfile(id: number): Promise<void> {
  currentProfileId.set(id);
}

export async function deleteProfile(id: number): Promise<void> {
  try {
    await api.deleteProfile(id);
    profiles.update((list) => list.filter((p) => p.id !== id));
    const curId = get(currentProfileId);
    if (curId === id) {
      const remaining = get(profiles);
      if (remaining.length > 0) {
        currentProfileId.set(remaining[0].id);
      } else {
        // Re-create default
        await loadProfiles();
      }
    }
  } catch (e) {
    console.error('Delete profile error:', e);
  }
}
