// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import Sidebar from '../../components/v2/Sidebar.svelte';
import { locale, preparerLocale, t } from '../i18n';
import { tachesDeFond } from '../stores/tachesDeFond';
import { libelleBanniereEnrichissement, type TacheDeFond } from '../tachesDeFond';

const credits: TacheDeFond = { id: 'credits_enrich_auto', label: 'Crédits (passe automatique)…', kind: 'enrichment', progress: { processed: 2, total: 7, detail: 'MusicBrainz' } };
let hote: HTMLDivElement;
let monte: ReturnType<typeof mount> | null = null;
const trad = (cle: string) => get(t)(cle as any);
beforeEach(async () => {
  await preparerLocale('en'); locale.set('en');
  tachesDeFond.set([credits]);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const corps = url.includes('/background-tasks') ? { tasks: [credits] } : url.includes('/config') ? {} : [];
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => corps, text: async () => JSON.stringify(corps) } as Response;
  }));
  hote = document.createElement('div'); document.body.appendChild(hote);
});
afterEach(async () => {
  if (monte) await unmount(monte);
  monte = null; hote?.remove(); tachesDeFond.set([]);
  vi.unstubAllGlobals();
});

it('la vraie barre latérale traduit la tâche et suit un changement de langue', async () => {
  monte = mount(Sidebar, { target: hote, props: {} as any });
  flushSync();
  await vi.waitFor(() => expect(hote.querySelector('.taches')?.textContent).toBe('Fetching credits… — MusicBrainz 2/7'));
  locale.set('fr'); flushSync();
  await vi.waitFor(() => expect(hote.querySelector('.taches')?.textContent).toBe('Récupération des crédits… — MusicBrainz 2/7'));
});

it('garde le secours inconnu, le nombre de tâches et la pause', () => {
  const inconnu = { id: 'plugin_futur', label: 'Future task', kind: 'future' };
  expect(libelleBanniereEnrichissement([inconnu, credits], 'Fallback', trad)).toBe('Future task (+1)');
  expect(libelleBanniereEnrichissement([{ ...inconnu, id: '__proto__', label: '' }], 'Fallback', trad)).toBe('Fallback');
  expect(libelleBanniereEnrichissement([{ ...credits, paused: true }], 'Fallback', trad)).toBeNull();
  expect(libelleBanniereEnrichissement([{ ...credits, progress: { processed: 0, total: 0, detail: '' } }], 'Fallback', trad)).toBe('Fetching credits…');
});

it('nomme les tâches connues dans les quinze langues', async () => {
  const ids = ['credits_enrich_auto', 'credits_enrich', 'credits_releases', 'artist_artwork', 'artwork', 'enrich_all', 'bios', 'identification_lot', 'identification_nuit', 'integrity', 'graver_dr', 'write_tags', 'edit_by_filter_files', 'rescan_metadata', 'relecture_classique', 'compositeur_depuis_credits', 'lyrics_fetch', 'lyrics_write', 'reparer_compilations', 'types_de_sortie', 'dynamic_range', 'bpm_lot', 'discogs_lot'];
  for (const langue of ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'vi', 'zh']) {
    await preparerLocale(langue as any); locale.set(langue as any);
    for (const id of ids) {
      const nom = libelleBanniereEnrichissement([{ id, label: 'NON TRADUIT', kind: 'enrichment' }], 'Fallback', trad)!;
      expect(nom, `${langue}/${id}`).not.toBe('NON TRADUIT');
      expect(nom).not.toMatch(/^(app\.task\.|v2\.)/);
    }
  }
});
