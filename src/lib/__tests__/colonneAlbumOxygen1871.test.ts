// @vitest-environment jsdom
//
// web#1871 — FabienM, fil 2097 (v1.0.0-rc1), relancé au fil 2143, point 3 :
// « Il serait pratique de rendre cliquable la colonne album pour aller
// directement dans la page album du titre. »
//
// #1919 a branché la colonne ALBUM du tableau PARTAGÉ (`ListePistesV2`) :
// playlists, Favoris, Bibliothèque, tiroirs de l'Historique. Restait le seul
// autre tableau de pistes à porter une colonne ALBUM : le mode « Détail »
// d'Oxygen, dont la cellule était du texte. Même geste ici : celui d'« Aller à
// l'album » (`lib/lienAlbumDePiste`).
//
// 🔴 CES TÉMOINS CLIQUENT : le vrai écran Oxygen, monté, et l'on regarde où
// l'on arrive.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import OxygenView from '../../components/v2-heritage/OxygenView.svelte';
import { activeView, gestesNavigationService, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { displayFields } from '../stores/displayFields';
import { ficheArtisteService } from '../stores/streaming';

vi.setConfig({ testTimeout: 60_000 });

class Inerte { observe() {} unobserve() {} disconnect() {} }

const PISTES = [
  { id: 7, title: 'Moonlight In Vermont', artist_name: 'Chris Connor', artist_id: 19, album_artist: 'Ensemble test', composer: 'Compositeur test', conductor: 'Chef test', album_title: 'Chris Craft', album_id: 55, source: 'local', duration_ms: 198_000 },
  { id: 8, title: 'Sans album connu', artist_name: 'X', album_title: 'Inconnu', album_id: null, source: 'local', duration_ms: 100_000 },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let lectures: string[] = [];

const respirer = async () => {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

beforeEach(() => {
  locale.set('fr');
  lectures = [];
  activeView.set('oxygen');
  pendingLibraryAlbum.set(null);
  gestesNavigationService.set({ ouvrirAlbum: () => {}, ouvrirArtiste: () => {} });
  preferences.update((p) => ({ ...p, oxygenView: 'detail' }));
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: any) => {
    const url = String(typeof entree === 'string' ? entree : (entree as any)?.url ?? '');
    if (/\/library\/search/.test(url)) return reponse({ artists: [{ id: 20, name: 'Ensemble test' }, { id: 21, name: 'Compositeur test' }, { id: 22, name: 'Chef test' }] });
    if (init?.method === 'POST' && /\/play/.test(url)) lectures.push(url);
    if (/\/library\/tracks\?/.test(url)) return reponse({ items: PISTES, total: PISTES.length });
    if (/\/library\/stats/.test(url)) return reponse({ tracks: 2, albums: 1, artists: 2 });
    if (/\/(zones|queue)/.test(url)) return reponse([]);
    return reponse({});
  }));
  displayFields.set(['album_artist', 'composer', 'conductor']);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function monterOxygen() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(OxygenView, { target: hote });
  flushSync();
  await respirer();
  const lignes = hote.querySelectorAll('tbody tr');
  expect(lignes.length, 'le tableau Oxygen n’a rendu aucune ligne — le témoin ne mesure rien').toBe(2);
  return lignes;
}

describe('web#1871 — la colonne ALBUM du tableau Oxygen', () => {
  it('🔴 le nom de l’album ouvre sa fiche, sans lancer la lecture', async () => {
    const lignes = await monterOxygen();
    const lien = lignes[0].querySelector<HTMLElement>('[data-lien-entite=album] [role=link]');
    expect(lien, 'la colonne ALBUM est inerte — web#1871').not.toBeNull();
    expect(lien!.textContent).toBe('Chris Craft');
    lien!.click();
    flushSync();
    expect(get(pendingLibraryAlbum)).toBe(55);
    expect(get(activeView)).toBe('library');
    expect(lectures, 'le clic sur l’album a lancé la lecture').toEqual([]);
  });

  it('sans album connu, la cellule reste du texte', async () => {
    const lignes = await monterOxygen();
    expect(lignes[1].querySelector('[data-lien-entite=album] [role=link]')).toBeNull();
    expect(lignes[1].textContent).toContain('Inconnu');
  });
});


describe('web#2979 — les noms d’Oxygen naviguent par le lien commun', () => {
  it('ouvre l’artiste identifié sans sélectionner la ligne ni jouer', async () => {
    const lignes = await monterOxygen();
    lignes[1].querySelector<HTMLElement>('td.title')!.click();
    await respirer();
    const lien = lignes[0].querySelector<HTMLElement>('[data-lien-entite=artiste] [role=link]');
    expect(lien, 'le nom de l’artiste doit être un lien').not.toBeNull();
    lien!.click();
    lien!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await respirer();
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ id: '19', nom: 'Chris Connor', service: null });
    expect(get(vueDeRetour)).toBe('oxygen');
    expect(lignes[0].classList.contains('sel')).toBe(false);
    expect(lectures).toEqual([]);
  });

  it.each([['Ensemble test', '20'], ['Compositeur test', '21'], ['Chef test', '22']])(
    'ouvre la fiche de %s au clavier', async (nom, id) => {
      const lignes = await monterOxygen();
    lignes[1].querySelector<HTMLElement>('td.title')!.click();
    await respirer();
      const lien = [...lignes[0].querySelectorAll<HTMLElement>('[role=link]')].find(e => e.textContent === nom);
      expect(lien, 'le crédit doit être accessible au clavier').toBeDefined();
      expect(lien!.tabIndex).toBe(0);
      lien!.focus();
      lien!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await respirer();
      expect(get(activeView)).toBe('streamingartist');
      expect(get(ficheArtisteService)).toMatchObject({ id, nom, service: null });
      expect(lignes[0].classList.contains('sel')).toBe(false);
      expect(lectures).toEqual([]);
    },
  );

  it('conserve la sélection quand on clique le titre de la ligne', async () => {
    const lignes = await monterOxygen();
    lignes[1].querySelector<HTMLElement>('td.title')!.click();
    await respirer();
    lignes[0].querySelector<HTMLElement>('td.title')!.click();
    await respirer();
    expect(lignes[0].classList.contains('sel')).toBe(true);
    expect(get(activeView)).toBe('oxygen');
    expect(lectures).toEqual([]);
  });
});
