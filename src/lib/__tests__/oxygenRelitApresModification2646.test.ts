// @vitest-environment jsdom
//
// web#2646 — dans Oxygen, après « Modifier les métadonnées… », la vue montrait
// encore l'ancienne valeur jusqu'au rechargement de la page : ses chargements
// (pistes, cartes, facettes, dossier) ne suivaient que les filtres, et le
// succès de l'éditeur ne remontait jamais jusqu'à elle.
//
// Le témoin suit le parcours de Bertrand sur le VRAI composant, sans le
// démonter : Oxygen ouvert sur un dossier, « Tout sélectionner », « Modifier
// les métadonnées… », label « Blue Note » → « Impulse! », aperçu, confirmation.
// La carte, le panneau de la piste ouverte et la facette Labels doivent alors
// montrer « Impulse! ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import OxygenView from '../../components/v2-heritage/OxygenView.svelte';
import { activeView, gestesNavigationService, pendingLibraryAlbum, pendingOxygenFolder } from '../stores/navigation';
import { preferences } from '../stores/preferences';
import { oublierLaSondeEdition } from '../editionParFiltre';
import { oublierLaSonde } from '../etiquetageParFiltre';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class Inerte { observe() {} unobserve() {} disconnect() {} }

const DOSSIER = '/musique/jazz';
let label = 'Blue Note';
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let requetes: { url: string; method: string }[] = [];

const respirer = async () => {
  for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

function reponse(corps: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const pistes = () => [
  { id: 7, title: 'Take Five', artist_name: 'Dave Brubeck', album_title: 'Time Out', album_id: 55, source: 'local', duration_ms: 324_000, label },
  { id: 8, title: 'Blue Rondo', artist_name: 'Dave Brubeck', album_title: 'Time Out', album_id: 55, source: 'local', duration_ms: 404_000, label },
];

beforeEach(() => {
  locale.set('fr');
  label = 'Blue Note';
  requetes = [];
  oublierLaSonde();
  oublierLaSondeEdition();
  activeView.set('oxygen');
  pendingLibraryAlbum.set(null);
  pendingOxygenFolder.set(DOSSIER);
  gestesNavigationService.set({ ouvrirAlbum: () => {}, ouvrirArtiste: () => {} });
  preferences.update((p) => ({ ...p, oxygenView: 'cards' }));
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as { url?: string })?.url ?? '');
    const method = init?.method ?? 'GET';
    requetes.push({ url, method });
    const q = new URL(url, 'http://tune.local').searchParams;
    const filtre = [...q.keys()].some((k) => !['all_of', 'item_type', 'field', 'value'].includes(k));
    if (/\/library\/(tag|edit)-by-filter\/preview/.test(url) && !filtre) {
      return reponse({ error: 'no active filter', code: 'empty_filter' }, 400);
    }
    if (/\/library\/edit-by-filter\/preview/.test(url)) {
      return reponse({
        item_type: 'track', field: q.get('field'), value: q.get('value'),
        tracks: 2, albums: 1, unchanged: 0, remote_skipped: 0, remote_albums_skipped: 0,
        limit: 5000, over_limit: false, file_writes_enabled: false, files: 0, files_cue_skipped: 0,
        track_examples: [], album_examples: [],
      });
    }
    if (/\/library\/edit-by-filter\?/.test(url) && method === 'POST') {
      // Le serveur écrit en base AVANT de répondre (edition_par_filtre.rs).
      label = String(JSON.parse(String(init?.body)).value);
      return reponse({ item_type: 'track', field: 'label', value: label, tracks: 2, albums: 1, status: 'ok', files_task_id: null });
    }
    if (/\/library\/tracks\?/.test(url)) return reponse({ items: pistes(), total: 2 });
    if (/\/library\/albums-detailed\?/.test(url)) {
      return reponse({ items: [{ album_id: 55, title: 'Time Out', album_artist: 'Dave Brubeck', cover_path: null, label, year: 1959, duration_ms: 728_000, disc_count: 1, track_count: 2, format: 'FLAC', sample_rate: 44100, bit_depth: 16 }], total: 1 });
    }
    if (/\/library\/facets\?/.test(url)) return reponse({ label: [{ value: label, count: 2 }], genre: [{ value: 'Jazz', count: 2 }] });
    if (/\/library\/folder-facet\?/.test(url)) return reponse({ path: DOSSIER, crumbs: [], children: [] });
    if (/\/library\/stats/.test(url)) return reponse({ tracks: 2, albums: 1, artists: 1 });
    if (/\/library\/genres/.test(url)) return reponse([{ name: 'Jazz', count: 2 }]);
    if (/\/(zones|queue)/.test(url)) return reponse([]);
    return reponse({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  pendingOxygenFolder.set(null);
  vi.unstubAllGlobals();
});

const el = <T extends HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`);

async function modifierLeLabel(valeur: string) {
  el<HTMLButtonElement>('oxy-select-all')!.click();
  await respirer();
  el<HTMLButtonElement>('oxy-edit-meta')!.click();
  await respirer();
  const champ = el<HTMLSelectElement>('oxy-edit-field')!;
  champ.value = 'label';
  champ.dispatchEvent(new Event('change'));
  await respirer();
  const saisie = el<HTMLInputElement>('oxy-edit-value')!;
  saisie.value = valeur;
  saisie.dispatchEvent(new Event('input'));
  await respirer();
  el<HTMLButtonElement>('oxy-edit-preview')!.click();
  await respirer();
  el<HTMLButtonElement>('oxy-edit-confirm')!.click();
  await respirer();
}

async function monterOxygen() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(OxygenView, { target: hote });
  flushSync();
  await respirer();
  return hote;
}

const panneau = () => hote!.querySelector('aside.inspector')?.textContent ?? '';
const rail = () => hote!.querySelector('aside.railwrap')?.textContent ?? '';

describe('web#2646 — Oxygen relit ce qu’il montre après une modification enregistrée', () => {
  it('🔴 vue cartes : la carte, le panneau ouvert et la facette Labels montrent la nouvelle valeur', async () => {
    const page = await monterOxygen();
    const carte = () => page.querySelector('.acard')?.textContent ?? '';
    expect(carte()).toContain('Blue Note');
    expect(panneau()).toContain('Blue Note');
    expect(rail()).toContain('Blue Note');

    const avant = requetes.length;
    await modifierLeLabel('Impulse!');

    expect(requetes.some((r) => r.method === 'POST' && r.url.includes('/library/edit-by-filter?')), 'aucun enregistrement').toBe(true);
    const relues = requetes.slice(avant).filter((r) => r.method === 'GET').map((r) => r.url);
    for (const route of ['/library/tracks?', '/library/albums-detailed?', '/library/facets?', '/library/folder-facet?']) {
      expect(relues.some((u) => u.includes(route)), `${route} non relu après l’enregistrement`).toBe(true);
    }
    expect(carte(), 'la carte montre encore l’ancien label').toContain('Impulse!');
    expect(carte()).not.toContain('Blue Note');
    expect(panneau(), 'le panneau ouvert montre encore l’ancien label').toContain('Impulse!');
    expect(panneau()).not.toContain('Blue Note');
    expect(rail(), 'la facette Labels montre encore l’ancienne valeur').toContain('Impulse!');
    expect(rail()).not.toContain('Blue Note');
  });

  it('🔴 vue détails : la ligne change, et le panneau reste sur la piste ouverte', async () => {
    preferences.update((p) => ({ ...p, oxygenView: 'detail' }));
    const page = await monterOxygen();
    const ligne = (titre: string) => [...page.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.includes(titre));
    ligne('Blue Rondo')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await respirer();
    expect(page.querySelector('.insp-title')?.textContent).toBe('Blue Rondo');
    expect(ligne('Blue Rondo')!.textContent).toContain('Blue Note');

    await modifierLeLabel('Impulse!');

    expect(ligne('Blue Rondo')!.textContent, 'la ligne montre encore l’ancien label').toContain('Impulse!');
    expect(page.querySelector('.insp-title')?.textContent, 'le panneau a sauté sur une autre piste').toBe('Blue Rondo');
    expect(panneau(), 'le panneau ouvert montre encore l’ancien label').toContain('Impulse!');
    expect(panneau()).not.toContain('Blue Note');
  });
});
