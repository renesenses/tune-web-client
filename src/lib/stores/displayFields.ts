import { writable } from 'svelte/store';

const STORAGE_KEY = 'tune_metadata_fields';
export const DISPLAY_FIELDS_DEFAULTS = ['format', 'sample_rate', 'bit_depth', 'genre', 'year', 'label', 'composer'];

/** Active profile id → `X-Profile-Id` header (same localStorage key api.ts reads).
 *  The server scopes metadata-fields per profile (`metadata_visible_fields:{pid}`).
 *  These raw fetches previously sent no profile header, so their PUT/GET resolved
 *  to the *default* profile while SettingsView's api.apiFetch sent the *selected*
 *  profile — the editor then reloaded another profile's fields and the technical
 *  columns looked "lost" on every menu change (Bilou, #1078). Sending the header
 *  keeps every read/write on the same profile. */
function profileHeaders(): Record<string, string> {
  try {
    const id = localStorage.getItem('tune-profile-id');
    if (id) return { 'X-Profile-Id': id };
  } catch { /* ignore */ }
  return {};
}

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return DISPLAY_FIELDS_DEFAULTS;
}

function save(fields: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fields)); } catch {}
  fetch('/api/v1/system/settings/metadata-fields', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...profileHeaders() },
    body: JSON.stringify({ fields }),
  }).catch(() => {});
}

function createDisplayFieldsStore() {
  const { subscribe, set, update } = writable<string[]>(load());

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) set(load());
  });

  return {
    subscribe,
    set(v: string[]) {
      save(v);
      set(v);
    },
    toggle(key: string) {
      update(fields => {
        const next = fields.includes(key)
          ? fields.filter(k => k !== key)
          : [...fields, key];
        save(next);
        return next;
      });
    },
  };
}

export const displayFields = createDisplayFieldsStore();

export async function syncDisplayFieldsFromServer() {
  try {
    const res = await fetch('/api/v1/system/settings/metadata-fields', { headers: profileHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const categories = data?.categories;
    if (!Array.isArray(categories)) return;
    const enabled: string[] = [];
    for (const cat of categories) {
      for (const f of cat.fields ?? []) {
        if (f.enabled) enabled.push(f.key);
      }
    }
    if (enabled.length > 0) {
      // Server is authoritative: ALWAYS re-hydrate the display store from the
      // saved server value (localStorage is only an offline cache / immediate
      // paint), instead of a one-time seed when localStorage is empty. The old
      // `if (!hadLocal)` guard meant that once localStorage existed the server
      // value was never re-applied, so any loss of the webview's localStorage on
      // an update reverted the display to defaults — "les métadonnées doivent
      // être re-saisies à chaque version" (Bilou). It also keeps the Settings
      // editor and the track-detail display from silently diverging.
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled)); } catch {}
      displayFields.set(enabled);
    }
  } catch {}
}
