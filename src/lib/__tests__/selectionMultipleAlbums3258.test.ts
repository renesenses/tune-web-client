// @vitest-environment jsdom
//
// web#3258 — Rob (VIP, réunion du 18/11), go de Bertrand le 19/11 : choisir
// plusieurs albums dans les vues albums de la Bibliothèque, puis leur
// appliquer une action groupée (tag, conversion, file, playlist, édition).
//
// Les témoins MONTENT l'écran réel (`LibraryV2`), cliquent les vraies cases et
// lisent les requêtes réellement envoyées au serveur. La conversion est suivie
// jusqu'au `POST /converter/start` du vrai `ConverterV2`.
//
// CONTRE-ÉPREUVE : sur origin/main, le bouton « Sélectionner » n'existe pas —
// tous les blocs d'écran rougissent ; `lib/selectionAlbums` n'existe pas — le
// bloc unitaire rougit. Le dernier bloc vérifie aussi l'envers : hors mode
// sélection, un clic sur une carte ne coche rien et ne pose aucun tag.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import ConverterV2 from '../../components/v2/ConverterV2.svelte';
import { activeView } from '../stores/navigation';
import { albums as albumsStore, libraryFolderScope } from '../stores/library';
import { currentZoneId } from '../stores/zones';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { cliquerAlbum, idsDansLOrdre, toutSelectionner, SELECTION_VIDE } from '../selectionAlbums';
import { consommerDemandeConversion } from '../demandeConversion';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
}

// Tri par titre : Blue Monk (3), Blue Note Gems (4), Blue Train (1), Red Clay (2).
// L'ordre des identifiants n'est PAS l'ordre affiché : une plage « par id »
// se verrait.
const ALBUMS: Album[] = [
  { id: 1, title: 'Blue Train', artist_name: 'Coltrane' },
  { id: 2, title: 'Red Clay', artist_name: 'Hubbard' },
  { id: 3, title: 'Blue Monk', artist_name: 'Monk' },
  { id: 4, title: 'Blue Note Gems', artist_name: 'Divers' },
] as unknown as Album[];

interface Appel { methode: string; url: string; corps: any }
let appels: Appel[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisser(n = 10) { for (let i = 0; i < n; i++) await respirer(); flushSync(); }

function reponse(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

async function monter(composant: any): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: {} as never });
  await laisser(14);
  return hote;
}

async function poserBibliotheque(): Promise<HTMLElement> {
  activeView.set('library');
  albumsStore.set([...ALBUMS]);
  return monter(LibraryV2);
}

const q = <T extends Element = HTMLElement>(el: ParentNode, sel: string) => el.querySelector<T & HTMLElement>(sel);
const caseDe = (el: HTMLElement, id: number) => q<HTMLButtonElement>(el, `[data-case-album="${id}"]`);
const compte = (el: HTMLElement) => (q(el, '[data-selection-compte]')?.textContent ?? '').trim();
const cochees = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>('[data-case-album][aria-checked="true"]')].map((b) => Number(b.dataset.caseAlbum));

async function cliquer(b: HTMLElement | null, options: MouseEventInit = {}) {
  expect(b, 'élément à cliquer absent').not.toBeNull();
  b!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }));
  await laisser(6);
}

async function entrerEnSelection(el: HTMLElement) {
  await cliquer(q(el, 'button[data-selection-mode]'));
}

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
  libraryFolderScope.set(null);
  albumsStore.set([]);
  currentZoneId.set(7);
  localStorage.clear();
  consommerDemandeConversion();
  appels = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const methode = String(options?.method ?? 'GET').toUpperCase();
    let corps: any = null;
    try { corps = options?.body ? JSON.parse(String(options.body)) : null; } catch { corps = options?.body; }
    appels.push({ methode, url, corps });
    if (/\/tags\/(\?|$)/.test(url) && methode === 'GET') {
      return reponse([{ id: 5, name: 'Jazz du dimanche', color: '#c80' }, { id: 6, name: 'À revoir', color: '#08c' }]);
    }
    if (/\/tags\/\d+\/items\/batch$/.test(url)) return reponse({ tagged: corps?.item_ids?.length ?? 0 });
    if (/\/library\/albums\/batch-update$/.test(url)) return reponse({ updated: corps?.album_ids?.length ?? 0, total: corps?.album_ids?.length ?? 0 });
    if (/\/zones\/7\/queue/.test(url) && methode === 'POST') return reponse({ ok: true });
    if (url.includes('/converter/capabilities')) return reponse({ formats: { flac: true }, tools: { ffmpeg: null, lame: null } });
    if (url.includes('/converter/presets')) return reponse([{ id: 'flac', label: 'FLAC', format: 'flac', quality: 'best' }]);
    if (url.includes('/converter/start')) return reponse({ job_id: 'j1', total_tracks: 12 });
    if (url.includes('/converter/jobs')) return reponse([]);
    if (/\/library\/albums\/\d+\/tracks/.test(url)) return reponse([]);
    if (url.includes('/system/config')) return reponse({});
    if (/\/queue/.test(url)) return reponse({ tracks: [], position: 0, length: 0 });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  albumsStore.set([]);
  currentZoneId.set(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('web#3258 — le mode sélection de la Bibliothèque', () => {
  it('🔴 « Sélectionner » pose une case par album, un clic coche sans ouvrir l’album', async () => {
    const el = await poserBibliotheque();
    expect(caseDe(el, 1), 'aucune case hors du mode sélection').toBeNull();
    await entrerEnSelection(el);
    expect(q(el, '[data-barre-selection]'), 'barre d’actions absente').not.toBeNull();
    for (const a of ALBUMS) expect(caseDe(el, a.id!), `case de l’album ${a.id}`).not.toBeNull();
    expect(compte(el)).toBe('0 album sélectionné');

    await cliquer(caseDe(el, 4));
    expect(cochees(el)).toEqual([4]);
    expect(compte(el)).toBe('1 album sélectionné');
    // Le calque de l'album ne s'est pas ouvert.
    expect(q(el, '.album-detail, [data-calque-album]')).toBeNull();

    await cliquer(caseDe(el, 4));
    expect(cochees(el)).toEqual([]);
  });

  it('🔴 Maj+clic coche la PLAGE dans l’ordre affiché (pas l’ordre des identifiants)', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 3));               // Blue Monk, 1re carte
    await cliquer(caseDe(el, 1), { shiftKey: true }); // Blue Train, 3e carte
    // Plage = Blue Monk, Blue Note Gems, Blue Train ; Red Clay (2) reste hors.
    expect(new Set(cochees(el))).toEqual(new Set([3, 4, 1]));
    expect(compte(el)).toBe('3 albums sélectionnés');
  });

  it('🔴 « Tout sélectionner » prend la vue FILTRÉE ; Échap referme le mode', async () => {
    const el = await poserBibliotheque();
    const input = q<HTMLInputElement>(el, '.search input, input[placeholder]')!;
    input.value = 'blue';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await laisser(8);
    await entrerEnSelection(el);
    await cliquer(q(el, '[data-selection-tout]'));
    expect(new Set(cochees(el))).toEqual(new Set([1, 3, 4]));
    expect(compte(el)).toBe('3 albums sélectionnés');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await laisser(4);
    expect(q(el, '[data-barre-selection]'), 'Échap doit fermer la barre').toBeNull();
    expect(caseDe(el, 1)).toBeNull();
  });

  it('🔴 « Ajouter un tag » appelle `POST /tags/{id}/items/batch` avec les albums cochés, dans l’ordre affiché', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    await cliquer(caseDe(el, 3));
    await cliquer(q(el, '[data-selection-action="tag"]'));
    await laisser(6);
    await cliquer(q(el, '[data-tag-lot="5"]'));
    await laisser(6);
    const lots = appels.filter((a) => a.methode === 'POST' && /\/tags\/\d+\/items\/batch$/.test(a.url));
    expect(lots).toHaveLength(1);
    expect(lots[0].url).toMatch(/\/tags\/5\/items\/batch$/);
    // Ordre affiché : Blue Monk (3) avant Blue Train (1).
    expect(lots[0].corps).toEqual({ item_type: 'album', item_ids: [3, 1] });
    // Un seul appel groupé, pas un `tagItem` par album.
    expect(appels.filter((a) => a.methode === 'POST' && /\/tags\/\d+\/items$/.test(a.url))).toHaveLength(0);
  });

  it('🔴 « Convertir » ouvre le Convertisseur pré-rempli, qui envoie les albums à `POST /converter/start`', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 2));
    await cliquer(caseDe(el, 4));
    await cliquer(q(el, '[data-selection-action="convertir"]'));
    expect(get(activeView)).toBe('converter');

    // La coquille démonte la Bibliothèque et monte le Convertisseur.
    unmount(monte!); monte = null; hote?.remove();
    const conv = await monter(ConverterV2);
    await laisser(10);
    const go = q<HTMLButtonElement>(conv, 'button.go')!;
    expect(go.disabled, 'les albums choisis doivent être repris').toBe(false);
    await cliquer(go);
    await laisser(6);
    const depart = appels.filter((a) => a.url.includes('/converter/start'));
    expect(depart).toHaveLength(1);
    const albumsEnvoyes = (depart[0].corps.sources as any[]).map((s) => s.album_id).sort();
    expect(albumsEnvoyes).toEqual([2, 4]);
    expect(depart[0].corps.format).toBe('flac');
  });

  it('« Ajouter à la file » envoie chaque album, dans l’ordre affiché', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 2));
    await cliquer(caseDe(el, 3));
    await cliquer(q(el, '[data-selection-action="file"]'));
    await laisser(8);
    const ajouts = appels.filter((a) => a.methode === 'POST' && /\/zones\/7\/queue/.test(a.url));
    expect(ajouts.map((a) => a.corps.album_id)).toEqual([3, 2]);
  });

  it('🔴 « Modifier en lot » demande confirmation (Annuler par défaut) et n’écrit rien si on annule', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    await cliquer(caseDe(el, 4));
    await cliquer(q(el, '[data-selection-action="edition"]'));
    const genre = q<HTMLInputElement>(el, '[data-champ="genre"]')!;
    genre.value = 'Hard bop';
    genre.dispatchEvent(new Event('input', { bubbles: true }));
    await laisser(2);

    const formulaire = q<HTMLFormElement>(el, '[data-selection-panneau="edition"]')!;
    formulaire.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await laisser(4);
    let file = get(dialogs);
    expect(file).toHaveLength(1);
    expect(file[0].annulerParDefaut).toBe(true);
    expect(file[0].danger).toBe(true);
    dialogs.settle(file[0].id, false);
    await laisser(4);
    expect(appels.filter((a) => a.url.includes('/albums/batch-update'))).toHaveLength(0);

    formulaire.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await laisser(4);
    file = get(dialogs);
    dialogs.settle(file[0].id, true);
    await laisser(6);
    const maj = appels.filter((a) => a.url.includes('/albums/batch-update'));
    expect(maj).toHaveLength(1);
    expect(maj[0].corps).toEqual({ album_ids: [4, 1], genre: 'Hard bop' });
  });

  it('contre-épreuve : hors mode sélection, un clic sur une carte ne coche rien et ne pose aucun tag', async () => {
    const el = await poserBibliotheque();
    await cliquer(q(el, '.card .meta'));
    expect(q(el, '[data-barre-selection]')).toBeNull();
    expect(el.querySelectorAll('[data-case-album]')).toHaveLength(0);
    expect(appels.filter((a) => /\/items\/batch$/.test(a.url))).toHaveLength(0);
  });
});

describe('web#3258 — `lib/selectionAlbums`', () => {
  const ORDRE = [3, 4, 1, 2];
  it('un clic bascule un album et devient l’ancre', () => {
    const s1 = cliquerAlbum(SELECTION_VIDE, 4, ORDRE);
    expect([...s1.ids]).toEqual([4]);
    expect(s1.ancre).toBe(4);
    expect([...cliquerAlbum(s1, 4, ORDRE).ids]).toEqual([]);
  });
  it('Maj+clic coche la plage dans les deux sens, l’ancre ne bouge pas', () => {
    const s = cliquerAlbum(SELECTION_VIDE, 2, ORDRE);
    const p = cliquerAlbum(s, 4, ORDRE, true);
    expect(idsDansLOrdre(p, ORDRE)).toEqual([4, 1, 2]);
    expect(p.ancre).toBe(2);
  });
  it('Maj+clic sans ancre : simple bascule', () => {
    expect([...cliquerAlbum(SELECTION_VIDE, 1, ORDRE, true).ids]).toEqual([1]);
  });
  it('« Tout sélectionner » ajoute la vue, et les albums hors vue suivent', () => {
    const s = toutSelectionner(cliquerAlbum(SELECTION_VIDE, 9, ORDRE), [3, 4]);
    expect(idsDansLOrdre(s, [3, 4])).toEqual([3, 4, 9]);
  });
});
