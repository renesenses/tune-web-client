import { writable, get } from 'svelte/store';
import * as api from '../api';

export interface Profile {
  id: number;
  name: string;
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

// Streaming favorites (Qobuz/Tidal/… items hearted in Tune, stored per-profile
// with metadata). Keyed by `${item_type}:${service}:${service_id}` so a shared
// HeartButton on every streaming row answers 'is X favorited?' in O(1) without
// an API call per row — same reasoning as the local id sets above.
export const favoriteStreamingKeys = writable<Set<string>>(new Set());

export function streamingFavKey(
  itemType: 'track' | 'album' | 'artist',
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
    favoriteStreamingKeys.set(new Set());
    return;
  }
  try {
    const favs = await api.getFavorites(profileId);
    favoriteTrackIds.set(new Set((favs.tracks ?? []).map((t: any) => t.id)));
    favoriteAlbumIds.set(new Set((favs.albums ?? []).map((a: any) => a.id)));
    favoriteArtistIds.set(new Set((favs.artists ?? []).map((a: any) => a.id)));
  } catch (e) {
    console.error('Load favorite ids error:', e);
  }
  try {
    const sfavs = await api.getProfileStreamingFavorites(profileId);
    favoriteStreamingKeys.set(
      new Set(sfavs.map((f) => streamingFavKey(f.item_type, f.service, f.service_id))),
    );
  } catch (e) {
    console.error('Load streaming favorite keys error:', e);
  }
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
