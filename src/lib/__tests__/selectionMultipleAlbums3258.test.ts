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
import { notifications } from '../stores/notifications';
import { demandeAjoutPlaylist } from '../demandeAjoutPlaylist';
import { _remiseAZeroFile } from '../fileSelectionAlbums';
import { locale } from '../i18n';
import { cliquerAlbum, idsDansLOrdre, toutSelectionner, SELECTION_VIDE, horsDeLaVue, gesteEchap } from '../selectionAlbums';
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
/** Une réponse imposée par un témoin (échec, lenteur) ; `null` : la normale. */
let surcharge: ((url: string, methode: string, corps: any) => Promise<Response> | Response | null) | null = null;
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
  surcharge = null;
  _remiseAZeroFile();
  for (const n of get(notifications)) notifications.dismiss(n.id);
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const methode = String(options?.method ?? 'GET').toUpperCase();
    let corps: any = null;
    try { corps = options?.body ? JSON.parse(String(options.body)) : null; } catch { corps = options?.body; }
    appels.push({ methode, url, corps });
    const imposee = surcharge?.(url, methode, corps);
    if (imposee) return imposee;
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

// ── Relecture du 19/11 ────────────────────────────────────────────────────

const barre = (el: HTMLElement) => q(el, '[data-barre-selection]');
function echap(cible: EventTarget = window) {
  cible.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}
async function chercherTexte(el: HTMLElement, texte: string) {
  const input = q<HTMLInputElement>(el, '.search input, input[placeholder]')!;
  input.value = texte;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await laisser(8);
  return input;
}
const messages = () => get(notifications).map((n: any) => n.message as string);
const erreurReponse = () => ({
  ok: false, status: 500, statusText: 'Erreur',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => ({ detail: 'boum' }), text: async () => '{"detail":"boum"}',
} as unknown as Response);

describe('web#3258 relecture — Échap ne quitte le mode que s’il n’y a rien d’autre à fermer', () => {
  it('🔴 une confirmation en attente : Échap est pour elle, la sélection reste', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    await cliquer(q(el, '[data-selection-action="edition"]'));
    const genre = q<HTMLInputElement>(el, '[data-champ="genre"]')!;
    genre.value = 'Jazz';
    genre.dispatchEvent(new Event('input', { bubbles: true }));
    q<HTMLFormElement>(el, '[data-selection-panneau="edition"]')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await laisser(4);
    expect(get(dialogs)).toHaveLength(1);
    echap();
    await laisser(4);
    expect(barre(el), 'la barre a disparu avec la confirmation ouverte').not.toBeNull();
    expect(cochees(el)).toEqual([1]);
    dialogs.settle(get(dialogs)[0].id, false);
    await laisser(4);
  });

  it('🔴 une fenêtre ouverte (« Ajouter à une playlist ») : Échap la ferme, pas la sélection', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 3));
    const fond = document.createElement('div');
    fond.className = 'modal-backdrop';
    const bouton = document.createElement('button');
    fond.appendChild(bouton);
    document.body.appendChild(fond);
    bouton.focus();
    echap(bouton);
    await laisser(4);
    fond.remove();
    expect(barre(el)).not.toBeNull();
    expect(cochees(el)).toEqual([3]);
  });

  it('🔴 Échap dans le champ de recherche ne vide pas la sélection', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 4));
    const input = q<HTMLInputElement>(el, '.search input, input[placeholder]')!;
    input.focus();
    echap(input);
    await laisser(4);
    expect(barre(el)).not.toBeNull();
    expect(cochees(el)).toEqual([4]);
    input.blur();
  });

  it('🔴 panneau ouvert, focus hors de la barre : Échap ferme le panneau SEULEMENT, puis le mode', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    await cliquer(q(el, '[data-selection-action="tag"]'));
    expect(q(el, '[data-selection-panneau="tag"]')).not.toBeNull();
    (document.activeElement as HTMLElement | null)?.blur?.();
    echap();
    await laisser(4);
    expect(q(el, '[data-selection-panneau="tag"]'), 'le panneau reste ouvert').toBeNull();
    expect(barre(el), 'Échap a quitté le mode au lieu du panneau').not.toBeNull();
    expect(cochees(el)).toEqual([1]);
    // Contre-épreuve : plus rien d'autre à fermer, Échap quitte le mode.
    echap();
    await laisser(4);
    expect(barre(el)).toBeNull();
  });
});

describe('web#3258 relecture — la sélection survit au changement de vue', () => {
  it('🔴 la recherche cache un album coché : il reste sélectionné et le compteur le dit', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 2)); // Red Clay
    await cliquer(caseDe(el, 3)); // Blue Monk
    await chercherTexte(el, 'blue');
    expect(caseDe(el, 2), 'Red Clay est hors de la vue').toBeNull();
    expect(compte(el)).toBe('2 albums sélectionnés, dont 1 hors de la vue');
    await chercherTexte(el, '');
    expect(new Set(cochees(el))).toEqual(new Set([2, 3]));
    expect(compte(el)).toBe('2 albums sélectionnés');
  });

  it('🔴 une action sur des albums cachés demande confirmation, avec les deux nombres', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 2));
    await cliquer(caseDe(el, 3));
    await chercherTexte(el, 'blue');
    await cliquer(q(el, '[data-selection-action="tag"]'));
    await laisser(6);
    await cliquer(q(el, '[data-tag-lot="5"]'));
    let file = get(dialogs);
    expect(file).toHaveLength(1);
    expect(file[0].message).toContain('2 albums sélectionnés, dont 1 hors de la vue');
    expect(file[0].annulerParDefaut).toBe(true);
    dialogs.settle(file[0].id, false);
    await laisser(4);
    expect(appels.filter((a) => /\/items\/batch$/.test(a.url)), 'annulé : rien ne part').toHaveLength(0);

    await cliquer(q(el, '[data-tag-lot="5"]'));
    file = get(dialogs);
    dialogs.settle(file[0].id, true);
    await laisser(6);
    const lots = appels.filter((a) => /\/items\/batch$/.test(a.url));
    expect(lots).toHaveLength(1);
    expect(lots[0].corps.item_ids).toEqual([3, 2]);
  });

  it('🔴 file, playlist, conversion : la même question quand des albums sont cachés', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 2));
    await cliquer(caseDe(el, 3));
    await chercherTexte(el, 'blue');
    for (const action of ['file', 'playlist', 'convertir']) {
      await cliquer(q(el, `[data-selection-action="${action}"]`));
      const file = get(dialogs);
      expect(file, `pas de question avant « ${action} »`).toHaveLength(1);
      expect(file[0].message).toContain('dont 1 hors de la vue');
      dialogs.settle(file[0].id, false);
      await laisser(4);
    }
    expect(appels.filter((a) => /queue\/add/.test(a.url))).toHaveLength(0);
    expect(get(demandeAjoutPlaylist)).toBeNull();
    expect(get(activeView)).toBe('library');
  });

  it('contre-épreuve : rien de caché, aucune question avant l’action', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 3));
    await cliquer(q(el, '[data-selection-action="file"]'));
    await laisser(6);
    expect(get(dialogs)).toHaveLength(0);
    expect(appels.filter((a) => /queue\/add/.test(a.url))).toHaveLength(1);
  });
});

describe('web#3258 relecture — « Modifier en lot » reporte en une passe', () => {
  async function editer(el: HTMLElement, champ: string, valeur: string) {
    await cliquer(q(el, '[data-selection-action="edition"]'));
    const c = q<HTMLInputElement>(el, `[data-champ="${champ}"]`)!;
    c.value = valeur;
    c.dispatchEvent(new Event('input', { bubbles: true }));
    q<HTMLFormElement>(el, '[data-selection-panneau="edition"]')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await laisser(4);
    dialogs.settle(get(dialogs)[0].id, true);
    await laisser(8);
  }

  it('🔴 tout mis à jour : le label est reporté dans la liste en UNE émission', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    await cliquer(caseDe(el, 4));
    let emissions = 0;
    const stop = albumsStore.subscribe(() => { emissions++; });
    emissions = 0;
    await editer(el, 'label', 'Blue Note');
    stop();
    expect(emissions, 'une émission par album au lieu d’une seule').toBe(1);
    const liste = get(albumsStore);
    expect(liste.filter((a) => a.label === 'Blue Note').map((a) => a.id).sort()).toEqual([1, 4]);
  });

  // La bibliothèque relue, telle que le serveur la rend APRÈS la modification.
  let relue: Album[] | null = null;
  const serveurQuiRelit = (base: ((u: string) => Response | null) | null = null) =>
    (url: string) => base?.(url) ?? (relue && /\/library\/albums\?limit=/.test(url) ? reponse(relue) : null);
  const relectures = () => appels.filter((a) => a.methode === 'GET' && /\/library\/albums\?limit=/.test(a.url)).length;

  it('🔴 `updated < total` : rien n’est reporté à l’aveugle, la bibliothèque est relue', async () => {
    const el = await poserBibliotheque();
    // Le serveur n'a mis à jour QUE l'album 1, sans dire lequel.
    relue = ALBUMS.map((a) => (a.id === 1 ? { ...a, genre: 'Hard bop' } : a));
    surcharge = serveurQuiRelit((url) => (/batch-update$/.test(url) ? reponse({ updated: 1, total: 2 }) : null));
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    await cliquer(caseDe(el, 4));
    const avant = relectures();
    await editer(el, 'genre', 'Hard bop');
    await laisser(10);
    expect(relectures(), 'la bibliothèque n’a pas été relue').toBeGreaterThan(avant);
    // L'album 4 ne porte PAS le genre : le report n'a pas été fait à l'aveugle.
    expect(get(albumsStore).filter((a) => a.genre === 'Hard bop').map((a) => a.id)).toEqual([1]);
    relue = null;
  });

  it('🔴 artiste changé : la bibliothèque est relue (l’`artist_id` vient du serveur)', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    // Le serveur a résolu un NOUVEL artiste : seul la relecture le rapporte.
    relue = ALBUMS.map((a) => (a.id === 1 ? { ...a, artist_name: 'John Coltrane', artist_id: 99 } : a)) as Album[];
    surcharge = serveurQuiRelit();
    const avant = relectures();
    await editer(el, 'artiste', 'John Coltrane');
    await laisser(10);
    expect(relectures()).toBeGreaterThan(avant);
    expect(get(albumsStore).find((a) => a.id === 1)?.artist_id).toBe(99);
    relue = null;
  });
});

describe('web#3258 relecture de suivi — genre, Échap masqué, file hors de la barre', () => {
  async function editerGenre(el: HTMLElement, valeur: string) {
    await cliquer(q(el, '[data-selection-action="edition"]'));
    const c = q<HTMLInputElement>(el, '[data-champ="genre"]')!;
    c.value = valeur;
    c.dispatchEvent(new Event('input', { bubbles: true }));
    q<HTMLFormElement>(el, '[data-selection-panneau="edition"]')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await laisser(4);
    dialogs.settle(get(dialogs)[0].id, true);
    await laisser(12);
  }
  const relectures = () => appels.filter((a) => a.methode === 'GET' && /\/library\/albums\?limit=/.test(a.url)).length;

  it('🔴 A — l’aide dit que le genre est recopié sur les pistes (sauf compilation hétérogène)', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    await cliquer(q(el, '[data-selection-action="edition"]'));
    const texte = q(el, '[data-selection-panneau="edition"]')!.textContent ?? '';
    expect(texte).toContain('recopié sur les pistes');
    expect(texte).toContain('compilation');
    expect(texte).not.toContain('album seulement');
  });

  it('🔴 B — un genre changé relit la bibliothèque : `genres` (que lisent les regroupements) suit', async () => {
    const el = await poserBibliotheque();
    const relue = ALBUMS.map((a) => (a.id === 1 || a.id === 4 ? { ...a, genre: 'Hard bop', genres: 'Hard bop' } : a));
    surcharge = (url) => (/\/library\/albums\?limit=/.test(url) ? reponse(relue) : null);
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    await cliquer(caseDe(el, 4));
    const avant = relectures();
    await editerGenre(el, 'Hard bop');
    expect(relectures(), 'genre changé sans relecture').toBeGreaterThan(avant);
    expect(get(albumsStore).filter((a) => (a as any).genres === 'Hard bop').map((a) => a.id).sort()).toEqual([1, 4]);
  });

  it('🔴 C — Échap sur un onglet sans cases ne vide pas la sélection masquée', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 3));
    await cliquer(q(el, 'button[data-onglet="artists"]'));
    await laisser(8);
    expect(barre(el)).toBeNull();
    echap();
    await laisser(4);
    await cliquer(q(el, 'button[data-onglet="albums"]'));
    await laisser(8);
    expect(barre(el), 'le mode a été quitté en silence').not.toBeNull();
    expect(cochees(el)).toEqual([3]);
  });

  it('🔴 D — changer d’onglet n’arrête pas l’ajout à la file ; le retour montre la progression', async () => {
    const el = await poserBibliotheque();
    const enAttente: Array<() => void> = [];
    surcharge = (url, methode) =>
      (methode === 'POST' && /queue\/add/.test(url)
        ? new Promise<Response>((ok) => enAttente.push(() => ok(reponse({ queue_length: 1 }))))
        : null);
    await entrerEnSelection(el);
    for (const id of [3, 4, 1]) await cliquer(caseDe(el, id));
    await cliquer(q(el, '[data-selection-action="file"]'));
    await laisser(4);
    await cliquer(q(el, 'button[data-onglet="artists"]'));
    await laisser(8);
    enAttente.shift()!();
    await laisser(8);
    const ajouts = () => appels.filter((a) => a.methode === 'POST' && /queue\/add/.test(a.url)).length;
    expect(ajouts(), 'la boucle s’est arrêtée au changement d’onglet').toBe(2);
    await cliquer(q(el, 'button[data-onglet="albums"]'));
    await laisser(8);
    expect(q(el, '[data-selection-file]')?.textContent).toContain('1 / 3');
    enAttente.shift()!();
    await laisser(6);
    enAttente.shift()!();
    await laisser(8);
    expect(ajouts()).toBe(3);
    expect(messages()).toContain('Sélection ajoutée à la file (3)');
  });

  it('E — un menu « … » ouvert : Échap est pour lui, pas pour le mode', async () => {
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 1));
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    echap();
    await laisser(4);
    menu.remove();
    expect(barre(el)).not.toBeNull();
    expect(cochees(el)).toEqual([1]);
  });
});

describe('web#3258 relecture — erreurs partielles', () => {
  it('🔴 file : un échec n’arrête pas la suite, et le bilan le dit', async () => {
    surcharge = (url, methode, corps) =>
      (methode === 'POST' && /queue\/add/.test(url) && corps?.album_id === 4 ? erreurReponse() : null);
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    for (const id of [3, 4, 1]) await cliquer(caseDe(el, id));
    await cliquer(q(el, '[data-selection-action="file"]'));
    await laisser(20);
    const ajouts = appels.filter((a) => a.methode === 'POST' && /queue\/add/.test(a.url)).map((a) => a.corps.album_id);
    expect(ajouts.filter((x) => x !== 4)).toEqual([3, 1]);
    expect(messages()).toContain('2 sur 3 ajoutés à la file, 1 en échec');
  });

  async function fileLente(el: HTMLElement) {
    const enAttente: Array<() => void> = [];
    surcharge = (url, methode) =>
      (methode === 'POST' && /queue\/add/.test(url)
        ? new Promise<Response>((ok) => enAttente.push(() => ok(reponse({ queue_length: 1 }))))
        : null);
    await entrerEnSelection(el);
    for (const id of [3, 4, 1]) await cliquer(caseDe(el, id));
    await cliquer(q(el, '[data-selection-action="file"]'));
    await laisser(4);
    return enAttente;
  }
  const nbAjouts = () => appels.filter((a) => a.methode === 'POST' && /queue\/add/.test(a.url)).length;

  it('🔴 file : progression, « Arrêter » coupe la boucle après l’album en cours', async () => {
    const el = await poserBibliotheque();
    const enAttente = await fileLente(el);
    expect(q(el, '[data-selection-file]')?.textContent).toContain('0 / 3');
    // Un second ajout ne peut pas s'entrelacer : le bouton est grisé.
    expect(q<HTMLButtonElement>(el, '[data-selection-action="file"]')!.disabled).toBe(true);
    await cliquer(q(el, '[data-selection-file-annuler]'));
    enAttente.shift()!();
    await laisser(10);
    expect(nbAjouts()).toBe(1);
    expect(messages()).toContain('Ajout arrêté : 1 sur 3 ajoutés à la file');
  });

  it('🔴 file : « Terminé » (barre démontée) arrête aussi la boucle', async () => {
    const el = await poserBibliotheque();
    const enAttente = await fileLente(el);
    await cliquer(q(el, '[data-selection-terminer]'));
    expect(barre(el)).toBeNull();
    enAttente.shift()!();
    await laisser(10);
    expect(nbAjouts()).toBe(1);
  });

  it('🔴 playlist : les albums illisibles sont signalés', async () => {
    surcharge = (url) => (/\/library\/albums\/2\/tracks/.test(url) ? erreurReponse() : null);
    const el = await poserBibliotheque();
    await entrerEnSelection(el);
    await cliquer(caseDe(el, 2));
    await cliquer(caseDe(el, 3));
    await cliquer(q(el, '[data-selection-action="playlist"]'));
    const demande = get(demandeAjoutPlaylist);
    expect(demande?.pistes).toBeTypeOf('function');
    await demande!.pistes!();
    expect(messages()).toContain('Sur 2 albums, 1 n’a pas pu être lu : ses pistes manquent.');
    demandeAjoutPlaylist.set(null);
  });
});

describe('web#3258 relecture — `gesteEchap` et `horsDeLaVue`', () => {
  const ev = (cible?: EventTarget) => {
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    if (cible) Object.defineProperty(e, 'target', { value: cible });
    return e;
  };
  it('quitte seulement quand rien d’autre n’est à fermer', () => {
    expect(gesteEchap(ev(), { panneauOuvert: false, dialoguesEnAttente: 0 })).toBe('quitter');
    expect(gesteEchap(ev(), { panneauOuvert: true, dialoguesEnAttente: 0 })).toBe('panneau');
    expect(gesteEchap(ev(), { panneauOuvert: false, dialoguesEnAttente: 1 })).toBe('rien');
    const e = ev(); e.preventDefault();
    expect(gesteEchap(e, { panneauOuvert: true, dialoguesEnAttente: 0 })).toBe('rien');
    const champ = document.createElement('input');
    expect(gesteEchap(ev(champ), { panneauOuvert: false, dialoguesEnAttente: 0 })).toBe('rien');
  });
  it('compte les albums cochés hors de la vue', () => {
    const s = { ids: new Set([1, 2, 3]), ancre: null };
    expect(horsDeLaVue(s, [1, 3, 4])).toBe(1);
    expect(horsDeLaVue(SELECTION_VIDE, [1])).toBe(0);
  });
});
