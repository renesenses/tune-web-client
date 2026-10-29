// @vitest-environment jsdom
// #2489 : formulaires réels, couche API réelle et serveur HTTP synthétique.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
});
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';
import { preferences } from '../stores/preferences';
import { activeView } from '../stores/navigation';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { locale } from '../i18n';
import { notifications } from '../stores/notifications';
import { get } from 'svelte/store';
import fr from '../locales/fr';

type Sorte = 'playlist' | 'collection';
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let sorte: Sorte;
let avecService: boolean;
let objets: any[];
let requetes: { chemin: string; methode: string; corps: any }[];
let repondreCreation: (corps: any) => Promise<Response>;
const route = () => sorte === 'playlist' ? '/api/v1/playlists' : '/api/v1/library/collections';
const posts = () => requetes.filter((r) => r.methode === 'POST');
const lectures = () => requetes.filter((r) => r.methode === 'GET' && r.chemin === route()).length;
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});
async function stabiliser() {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
function champNom() {
  return document.querySelector<HTMLInputElement>(sorte === 'playlist' ? '.newp input' : '[role="dialog"] form input');
}
function saisir(champ: HTMLInputElement | HTMLTextAreaElement, valeur: string) {
  champ.value = valeur; champ.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
}
function valider() {
  if (sorte === 'playlist') hote.querySelector<HTMLButtonElement>('.newp button')!.click();
  else document.querySelector('[role="dialog"] form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
}
async function ouvrir(type: Sorte) {
  sorte = type; activeView.set(type === 'playlist' ? 'playlists' : 'collections');
  composant = mount(type === 'playlist' ? PlaylistsV2 : CollectionsV2, { target: hote });
  flushSync(); await stabiliser();
  if (type === 'collection') {
    hote.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(); flushSync();
  }
  const cle = type === 'playlist' ? 'v2.lbl.newPlaylist' : 'v2.col.create';
  const bouton = [...hote.querySelectorAll<HTMLButtonElement>('header button')]
    .find((b) => b.textContent?.trim() === fr[cle]);
  expect(bouton).toBeDefined(); bouton!.click(); flushSync();
  expect(champNom()).not.toBeNull(); saisir(champNom()!, '  Nouvelle sélection  ');
  if (type === 'collection') saisir(document.querySelector('[role="dialog"] textarea')!, 'Description conservée');
}

beforeEach(() => {
  objets = []; requetes = []; avecService = false; localStorage.clear(); locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  detailOuvert.set(null); ongletCourant.set(null);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  hote = document.createElement('div'); document.body.append(hote);
  repondreCreation = async (corps) => {
    const cree = { id: 49, ...corps, track_count: 0, album_ids: [], covers: [] };
    objets.push(cree); return json(cree, 201);
  };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    const methode = init?.method ?? 'GET';
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    requetes.push({ chemin, methode, corps });
    if (chemin === route()) return methode === 'POST' ? repondreCreation(corps) : json(objets);
    if (chemin.endsWith('/streaming/services')) return json(avecService ? { qobuz: { authenticated: true } } : {});
    if (chemin.endsWith('/streaming/qobuz/playlists')) return json([{ source_id: 'q-1', name: 'Playlist du service', track_count: 0 }]);
    return json([]);
  }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); detailOuvert.set(null); ongletCourant.set(null);
  vi.unstubAllGlobals();
});

describe('#2489 — création de listes depuis les vrais écrans', () => {
  it.each(['playlist', 'collection'] as const)('%s : succès HTTP puis relecture et objet visible', async (type) => {
    await ouvrir(type); const avant = lectures(); valider();
    await vi.waitFor(() => expect(hote.querySelector('.card .ct')?.textContent).toBe('Nouvelle sélection'));
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toMatchObject({ chemin: route(), corps: { name: 'Nouvelle sélection' } });
    if (type === 'collection') expect(posts()[0].corps.description).toBe('Description conservée');
    expect(lectures()).toBeGreaterThan(avant); expect(champNom()).toBeNull();
  });

  it.each(['playlist', 'collection'] as const)('%s : le refus laisse la saisie et permet de réessayer', async (type) => {
    await ouvrir(type); const avant = lectures();
    repondreCreation = async () => json({ error: 'refus synthétique de création' }, 503);
    valider(); await stabiliser();
    expect(posts()).toHaveLength(1); expect(champNom(), 'un refus ne ferme pas le formulaire').not.toBeNull();
    expect(champNom()!.value.trim()).toBe('Nouvelle sélection');
    if (type === 'playlist') expect(hote.querySelector('[role="alert"]')?.textContent).toBe(fr['v2.fav.createFailed']);
    expect(lectures()).toBe(avant); expect(hote.querySelector('.card .ct')).toBeNull();
    expect(get(notifications).some((n) => n.level === 'error')).toBe(true);
    repondreCreation = async (corps) => { objets.push({ id: 50, ...corps, track_count: 0, album_ids: [], covers: [] }); return json(objets[0], 201); };
    valider(); await vi.waitFor(() => expect(hote.querySelector('.card .ct')?.textContent).toBe('Nouvelle sélection'));
    expect(posts()).toHaveLength(2);
  });

  it.each(['playlist', 'collection'] as const)('%s : une seconde validation pendant le POST ne crée pas de doublon', async (type) => {
    await ouvrir(type);
    let terminer!: (r: Response) => void;
    repondreCreation = () => new Promise((r) => { terminer = r; });
    valider();
    if (type === 'playlist') expect(champNom()!.disabled).toBe(true);
    if (type === 'playlist') champNom()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    else valider();
    flushSync(); await stabiliser(); expect(posts()).toHaveLength(1);
    terminer(json({ id: 49, name: 'Nouvelle sélection' }, 201)); await stabiliser();
  });

  it.each(['recherche', 'intelligentes', 'qobuz'] as const)('la playlist créée devient visible malgré le contexte %s', async (contexte) => {
    avecService = contexte === 'qobuz';
    await ouvrir('playlist');
    if (contexte === 'recherche') saisir(hote.querySelector<HTMLInputElement>('input[type="search"]')!, 'sans correspondance');
    if (contexte === 'intelligentes') hote.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    if (contexte === 'qobuz') {
      const b = [...hote.querySelectorAll<HTMLButtonElement>('.srcs button')].find((b) => b.textContent?.trim().startsWith('qobuz'));
      expect(b).toBeDefined(); b!.click();
    }
    flushSync(); valider();
    await vi.waitFor(() => expect(hote.querySelector('.card.local .ct')?.textContent).toBe('Nouvelle sélection'));
    expect(posts()).toHaveLength(1); expect(posts()[0].chemin).toBe('/api/v1/playlists');
    expect(hote.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');
  });

  it('un refus ne change pas le filtre de recherche courant', async () => {
    await ouvrir('playlist');
    saisir(hote.querySelector<HTMLInputElement>('input[type="search"]')!, 'filtre conservé');
    repondreCreation = async () => json({ error: 'refus synthétique' }, 503);
    valider(); await stabiliser();
    expect(champNom()!.value.trim()).toBe('Nouvelle sélection');
    expect(hote.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('filtre conservé');
    expect(hote.querySelector('[role="alert"]')?.textContent).toBe(fr['v2.fav.createFailed']);
  });
});
