import { writable } from 'svelte/store';

const STORAGE_KEY = 'tune_metadata_fields';
export const DISPLAY_FIELDS_DEFAULTS = ['format', 'sample_rate', 'bit_depth', 'genre', 'year', 'label', 'composer'];

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return DISPLAY_FIELDS_DEFAULTS;
}

function createDisplayFieldsStore() {
  const { subscribe, set, update } = writable<string[]>(load());

  function save(fields: string[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fields)); } catch {}
  }

  subscribe(v => save(v));

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) set(load());
  });

  return {
    subscribe,
    set,
    toggle(key: string) {
      update(fields => {
        const next = fields.includes(key)
          ? fields.filter(k => k !== key)
          : [...fields, key];
        return next;
      });
    },
  };
}

export const displayFields = createDisplayFieldsStore();
