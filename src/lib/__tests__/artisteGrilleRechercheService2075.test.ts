// @vitest-environment jsdom
//
// #2075 — suite de #956.
//
// Volet 3 (Sandro, Qobuz, recherche « Leprous ») : sous les pochettes de la
// grille des résultats d'un service, le NOM de l'artiste n'était qu'un texte
// pris dans le bouton de l'album. Ce témoin monte la VRAIE Recherche, clique le
// nom, et lit la fiche ouverte. Il ne lit pas le source de l'écran.
//
// Volets 1 et 2 (repli muet, `catch` silencieux) : déjà corrigés sur `main`
// par e3a5b5d1 (`ouvrirArtisteDeServiceParNom`, #1486) ; leurs gardes
// existantes lisent du texte. Celles-ci EXÉCUTENT la résolution : le repli
// pose un message, la recherche qui lève laisse une trace.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SearchV2 from '../../components/v2/SearchV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';
import { notifications } from '../stores/notifications';
import { artisteDeCarteAlbum } from '../artisteCarteAlbum';
import { ouvrirArtisteDeServiceParNom } from '../ouvrirArtisteDepuis';

vi.setConfig({ testTimeout: 60_000 });

const vide = { artists: [], albums: [], tracks: [], playlists: [], labels: [] };
const AVEC_ID = { source_id: '0886445', title: 'Aphelion', artist_name: 'Leprous', artist_id: '610403' };
const SANS_ID = { source_id: '0886446', title: 'Pitfalls', artist_name: 'Leprous Live' };
const QOBUZ = {
  ...vide,
  albums: [AVEC_ID, SANS_ID],
  artists: [{ id: '777', name: 'Leprous Live' }],
};

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 8000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/library\/search/.test(u)) return reponse(vide);
    if (/\/search\?/.test(u)) return reponse({ local: vide, services: { qobuz: QOBUZ }, radios: [] });
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  activeView.set('search');
  vueDeRetour.set(null);
  ficheArtisteService.set(null);
  setSearchCriteria(null);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  activeView.set('home');
  ficheArtisteService.set(null);
  setSearchCriteria(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function poserResultats(): Promise<HTMLDivElement> {
  setSearchCriteria({ q: 'Leprous' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  await jusqua(() => (hote!.textContent ?? '').includes('Pitfalls'));
  return hote;
}

/** Le nom d'artiste sous la pochette de l'album `titre`. */
function nomSousPochette(el: HTMLElement, titre: string): HTMLElement | null {
  const carte = [...el.querySelectorAll<HTMLElement>('.card')]
    .find((c) => c.querySelector('.ct')?.textContent === titre);
  return carte?.querySelector<HTMLElement>('.ca') ?? null;
}

describe('#2075 volet 3 — le nom d’artiste de la grille d’un service', () => {
  it('🔴 avec l’identifiant du service : le clic ouvre SA fiche chez Qobuz', async () => {
    const el = await poserResultats();
    const nom = nomSousPochette(el, 'Aphelion');
    expect(nom, 'la carte Aphelion n’est pas rendue : le témoin ne mesure rien').not.toBeNull();
    expect(nom!.tagName, 'le nom n’est pas un bouton à part').toBe('BUTTON');
    nom!.click();
    await jusqua(() => get(activeView) === 'streamingartist');
    expect(get(activeView)).toBe('streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ service: 'qobuz', id: '610403', nom: 'Leprous' });
    expect(get(vueDeRetour)).toBe('search');
  });

  it('🔴 sans identifiant : le nom est résolu chez le service, puis la fiche s’ouvre', async () => {
    const el = await poserResultats();
    const nom = nomSousPochette(el, 'Pitfalls');
    expect(nom?.tagName).toBe('BUTTON');
    nom!.click();
    await jusqua(() => get(activeView) === 'streamingartist');
    expect(get(ficheArtisteService)).toMatchObject({ service: 'qobuz', id: '777', nom: 'Leprous Live' });
  });

  it('le clic sur le TITRE ouvre toujours l’album, pas l’artiste', async () => {
    const el = await poserResultats();
    const carte = [...el.querySelectorAll<HTMLElement>('.card')]
      .find((c) => c.querySelector('.ct')?.textContent === 'Aphelion')!;
    expect(carte.querySelector('button.meta .ca'), 'le nom est encore dans le bouton de l’album').toBeNull();
    expect(carte.querySelector('button.meta .ct')).not.toBeNull();
  });
});

describe('#2075 volet 3 — `artisteDeCarteAlbum`', () => {
  it('un album de service rend son artiste, identifiant compris', () => {
    expect(artisteDeCarteAlbum({ source: 'qobuz', artist_name: ' Leprous ', artist_id: 610403 }))
      .toEqual({ service: 'qobuz', nom: 'Leprous', id: '610403' });
    expect(artisteDeCarteAlbum({ source: 'tidal', artist_name: 'Leprous' }))
      .toEqual({ service: 'tidal', nom: 'Leprous', id: null });
  });
  it('rien pour la bibliothèque, une radio, ou un nom vide', () => {
    expect(artisteDeCarteAlbum({ source: 'local', artist_name: 'Leprous', artist_id: 4 })).toBeNull();
    expect(artisteDeCarteAlbum({ source: 'radio', artist_name: 'Leprous' })).toBeNull();
    expect(artisteDeCarteAlbum({ source: 'qobuz', artist_name: '  ' })).toBeNull();
    expect(artisteDeCarteAlbum(null)).toBeNull();
  });
});

describe('#2075 volets 1 et 2 — le repli parle, la recherche qui lève laisse une trace', () => {
  it('artiste introuvable : un message, puis la recherche sur ce service', async () => {
    const info = vi.spyOn(notifications, 'info');
    await ouvrirArtisteDeServiceParNom({ service: 'qobuz', nom: 'Leprous' }, 'search', {
      chercher: async () => [],
    });
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toContain('Leprous');
    expect(get(activeView)).toBe('search');
  });

  it('recherche qui lève : une trace console avec la raison, et un message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(notifications, 'info');
    const panne = new Error('réseau coupé');
    await ouvrirArtisteDeServiceParNom({ service: 'qobuz', nom: 'Leprous' }, 'search', {
      chercher: async () => { throw panne; },
    });
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some((c) => c.includes(panne))).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
  });
});
