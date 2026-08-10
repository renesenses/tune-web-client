import { writable } from 'svelte/store';
import type { Locale } from '../i18n';

export type ThemeMode = 'dark' | 'light' | 'oled' | 'midnight';
export type VolumeDisplay = 'percent' | 'dB';
export type StartupView = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'search' | 'settings';

/** Layout mode for the Oxygen library view. */
export type OxygenViewMode = 'album' | 'grid' | 'detail';
/** Densité de la grille d'albums.
 *  `detail` = pochette + titre + artiste (historique).
 *  `wall`   = mur de pochettes seules, plus dense : on choisit un album de
 *  mémoire visuelle, et le texte court-circuite ce mécanisme (demande Alex
 *  Campbell, qui parcourt sa bibliothèque « purely based on nostalgia »). */
export type AlbumGridDensity = 'detail' | 'wall';

/** Facets available in the Oxygen browse rail (Phase 2+). Stored so users can
 *  pick which ones show. Kept here (ui_preferences) so config syncs per install. */
// Only facets the Oxygen rail can actually render AND the server can count
// (rail FIELD_LABELS ∩ SERVER_FACET_FIELDS). The old list advertised
// rating/collection/untagged, which the rail silently dropped — a user
// who selected them saw fewer facets than expected (Bertrand: "seulement 3").
// format/sample_rate/bit_depth are the technical dimensions an audiophile
// browses by (direct tracks columns; server column_facet). `folder` is special:
// a hierarchical drill-down (breadcrumb + child folders) backed by
// /library/folder-facet, rendered by OxygenFolderFacet — not a flat value list.
export const OXYGEN_FACETS_ALL = ['genre', 'artist', 'composer', 'label', 'year', 'format', 'sample_rate', 'bit_depth', 'country', 'mood', 'source', 'rating', 'collection', 'folder'] as const;
/** Facets removed from OXYGEN_FACETS_ALL — used to migrate old stored prefs. */
const OXYGEN_FACETS_REMOVED = ['untagged'];
/** Révision courante de la liste de facettes livrée. À incrémenter en même
 *  temps qu'on ajoute une entrée à ADDED_BY_REV ci-dessous. */
const OXYGEN_FACETS_REV = 1;
/** Facettes apparues à chaque révision : elles sont ajoutées une fois aux
 *  préférences déjà enregistrées, puis le choix de l'utilisateur fait foi. */
const OXYGEN_FACETS_ADDED_BY_REV: Record<number, string[]> = {
  1: ['composer'],
};

export interface Preferences {
  theme: ThemeMode;
  language: Locale;
  volumeDisplay: VolumeDisplay;
  startupView: StartupView;
  defaultZoneId: number | null;
  hiddenDeviceIds: string[];
  // --- Oxygen advanced library view (parameterizable) ---
  oxygenEnabled: boolean;
  oxygenView: OxygenViewMode;
  oxygenFacets: string[];
  /** Max values shown per Oxygen facet. 0 = no limit (show every value). */
  oxygenFacetLimit: number;
  /** Révision de la liste de facettes livrée. Sert à faire apparaître une
   *  facette nouvellement ajoutée chez les utilisateurs existants — dont les
   *  préférences enregistrées ne peuvent pas l'avoir décochée, puisqu'elle
   *  n'existait pas — sans jamais réécraser un choix ultérieur. */
  oxygenFacetsRev: number;
  /** Album-view sort key + order, kept here (server-synced ui_preferences) so the
   *  library opens on the user's chosen order across sessions and devices — was
   *  a per-browser localStorage value that never followed the profile (#1134). */
  albumSort: string;
  albumSortOrder: 'asc' | 'desc';
  /** Densité de la grille d'albums — voir AlbumGridDensity. */
  albumGridDensity: AlbumGridDensity;
  /** Afficher les bulles d'aide au survol des boutons.
   *
   *  Activé par défaut : trois testeurs de suite n'ont pas trouvé un bouton
   *  faute d'explication. Désactivable, parce qu'une aide utile au premier
   *  jour devient du bruit au centième — celui qui connaît l'interface ne
   *  doit pas subir une infobulle à chaque survol. */
  tooltipsEnabled: boolean;
}

const STORAGE_KEY = 'tune-preferences';

const defaults: Preferences = {
  theme: 'dark',
  language: 'fr',
  volumeDisplay: 'percent',
  startupView: 'home',
  defaultZoneId: null,
  hiddenDeviceIds: [],
  oxygenEnabled: false,
  oxygenView: 'detail',
  oxygenFacets: ['genre', 'artist', 'composer', 'label', 'year', 'format', 'sample_rate', 'bit_depth', 'country'],
  oxygenFacetLimit: 200,
  oxygenFacetsRev: OXYGEN_FACETS_REV,
  albumSort: 'title',
  albumSortOrder: 'asc',
  albumGridDensity: 'detail',
  tooltipsEnabled: true,
};

// One-time migration of the album sort, which #1134 moved from the per-browser
// `tune_album_sort`/`tune_album_sort_order` localStorage keys into the synced
// preferences. Applied only when the stored prefs carry NO album sort yet (they
// predate #1134), so a user's prior choice — e.g. sort by Artist — is adopted
// instead of being silently reset to the 'title' default (Jean-Luc Cassé).
function adoptLegacyAlbumSort(p: Preferences) {
  const legacy = localStorage.getItem('tune_album_sort');
  if (legacy) p.albumSort = legacy;
  const legacyOrder = localStorage.getItem('tune_album_sort_order');
  if (legacyOrder === 'asc' || legacyOrder === 'desc') p.albumSortOrder = legacyOrder;
}

function loadPrefs(): Preferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const raw = JSON.parse(stored);
      const p: Preferences = { ...defaults, ...raw };
      // Migrate Oxygen facets: anyone still carrying a removed facet
      // (collection/folder/…) had a partly-invisible rail — reset them to the
      // new supported default (which now includes Artistes). Otherwise just
      // drop any stray unsupported entries.
      const supported = OXYGEN_FACETS_ALL as readonly string[];
      const facets = Array.isArray(p.oxygenFacets) ? p.oxygenFacets : [];
      if (facets.some((f) => OXYGEN_FACETS_REMOVED.includes(f))) {
        p.oxygenFacets = [...defaults.oxygenFacets];
      } else {
        const cleaned = facets.filter((f) => supported.includes(f));
        p.oxygenFacets = cleaned.length ? cleaned : [...defaults.oxygenFacets];
      }
      // Facettes ajoutées depuis la dernière version connue de ce navigateur :
      // les activer une fois, dans l'ordre canonique du rail.
      const rev = typeof (raw as { oxygenFacetsRev?: unknown })?.oxygenFacetsRev === 'number'
        ? (raw as { oxygenFacetsRev: number }).oxygenFacetsRev
        : 0;
      if (rev < OXYGEN_FACETS_REV) {
        const add = new Set(p.oxygenFacets);
        for (let r = rev + 1; r <= OXYGEN_FACETS_REV; r++) {
          for (const f of OXYGEN_FACETS_ADDED_BY_REV[r] ?? []) add.add(f);
        }
        p.oxygenFacets = supported.filter((f) => add.has(f));
        p.oxygenFacetsRev = OXYGEN_FACETS_REV;
      }
      // Check the RAW blob (not merged `p`, which always has the default): if it
      // predates #1134 it has no albumSort → pull the legacy localStorage choice.
      if (!(raw && typeof raw === 'object' && 'albumSort' in raw)) {
        adoptLegacyAlbumSort(p);
      }
      return p;
    }
  } catch { /* ignore */ }
  const p = { ...defaults };
  adoptLegacyAlbumSort(p);
  return p;
}

const hadLocalPrefs = !!localStorage.getItem(STORAGE_KEY);

function createPreferences() {
  const { subscribe, set, update } = writable<Preferences>(loadPrefs());
  let initialized = false;
  subscribe((v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch { /* ignore */ }
    if (initialized) {
      fetch('/api/v1/system/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_preferences: JSON.stringify(v) }),
      }).catch(() => {});
    }
  });
  initialized = true;
  return { subscribe, set, update };
}

export const preferences = createPreferences();

// Apply theme immediately on module load (before App mounts) to prevent flash.
// The FOUC script in index.html handles the very first paint, but this ensures
// the theme is also applied as soon as JS modules are evaluated.
applyTheme(loadPrefs().theme);

export async function syncPreferencesFromServer() {
  try {
    const res = await fetch('/api/v1/system/config');
    if (!res.ok) return;
    const config = await res.json();
    if (config.ui_preferences) {
      const server: Partial<Preferences> = typeof config.ui_preferences === 'string'
        ? JSON.parse(config.ui_preferences)
        : config.ui_preferences;
      if (hadLocalPrefs) {
        preferences.update((local) => ({ ...defaults, ...server, ...local }));
      } else {
        preferences.update(() => ({ ...defaults, ...server }));
      }
    }
  } catch { /* ignore */ }
  // Sync server-side default zone into local preferences
  try {
    const res = await fetch('/api/v1/system/settings/default-zone');
    if (res.ok) {
      const data = await res.json();
      if (data.zone_id != null) {
        preferences.update((p) => ({ ...p, defaultZoneId: data.zone_id }));
      }
    }
  } catch { /* ignore */ }
}

export function applyTheme(theme: ThemeMode) {
  if (theme === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  // Also persist the theme value for external consumers
  try { localStorage.setItem('tune-theme', theme); } catch { /* ignore */ }
}
