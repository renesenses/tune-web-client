// @vitest-environment jsdom
//
// web#2221 — « comment lire un seul CD d'un coffret ? » (demande d'un
// utilisateur relayée par Bertrand le 19/10/2026, go pour la rc7).
//
// L'en-tête « Disque N » (#1431) d'un album d'au moins deux disques devient
// actif : « Lire le disque », menu « … » (« Lire ensuite », « Ajouter à la
// file ») et durée du disque. Un album d'un disque ne change pas.
//
// 🔴 CE TÉMOIN MONTE la liste PUIS la vraie fiche d'album, clique les boutons
// rendus, et lit les corps envoyés au serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import * as api from '../api';
import { preferences } from '../stores/preferences';
import { currentZoneId } from '../stores/zones';
import { queuePosition } from '../stores/queue';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import { dureeDuDisqueMs, nombreDeDisques, pistesDuDisque } from '../lectureDisque';
import type { Album } from '../types';

vi.mock('../api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAlbumTracks: vi.fn(async () => []),
  getStreamingAlbumTracks: vi.fn(async () => []),
  bandcampAlbum: vi.fn(async () => ({ tracks: [] })),
  getAlbumExtendedMetadata: vi.fn(async () => ({})),
  play: vi.fn(async () => ({ id: 7 })),
  addToQueue: vi.fn(async () => ({})),
  getZone: vi.fn(async () => ({ id: 7 })),
}));

const FR = lFr as Record<string, string>;
const min = (m: number) => m * 60_000;
const COFFRET = [
  { id: 1, title: 'All by myself', disc_number: 1, track_number: 1, source: 'local', duration_ms: min(4) },
  { id: 2, title: 'My heart will go on', disc_number: 1, track_number: 2, source: 'local', duration_ms: min(5) },
  { id: 3, title: 'Pour que tu m’aimes encore', disc_number: 2, track_number: 1, source: 'local', duration_ms: min(30) },
  { id: 4, title: 'On ne change pas', disc_number: 2, track_number: 2, source: 'local', duration_ms: min(22) },
  { id: 5, title: 'Bla bla', disc_number: 3, track_number: 1, source: 'local', disc_subtitle: 'Live', duration_ms: min(3) },
] as any[];
const UN_DISQUE = COFFRET.slice(0, 2);

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

function poser(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ListePistesV2 as any, { target: hote, props: { onLire: () => {}, ...props } as any });
  flushSync();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.mocked(api.play).mockClear();
  vi.mocked(api.addToQueue).mockClear();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  vi.unstubAllGlobals();
});

const enTetes = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.dischead')];
const lireDe = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('[data-disque-lire]');
const plusDe = (h: HTMLElement) => h.querySelector<HTMLButtonElement>('[data-disque-plus]');
/** Le menu est PORTÉ à la racine du document : on le cherche là. */
const entreeDuMenu = (cle: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find((b) => (b.textContent ?? '').trim() === FR[cle]) ?? null;

describe('web#2221 — la tranche d’un disque', () => {
  it('le disque 2 : ses pistes seules, dans l’ordre ; sa durée', () => {
    expect(nombreDeDisques(COFFRET)).toBe(3);
    expect(pistesDuDisque(COFFRET, 2).map((p) => p.id)).toEqual([3, 4]);
    expect(pistesDuDisque(COFFRET, 4).map((p) => p.id)).toEqual([5]);
    expect(dureeDuDisqueMs(pistesDuDisque(COFFRET, 2))).toBe(min(52));
    expect(pistesDuDisque(COFFRET, 9)).toEqual([]);
  });
});

describe('web#2221 — l’en-tête de disque de ListePistesV2', () => {
  it('🔴 coffret : chaque en-tête porte « Lire le disque », « … » et sa durée', () => {
    const el = poser({ pistes: COFFRET, enTetesDisque: true, onGesteDisque: () => {} });
    const h = enTetes(el);
    expect(h.length).toBe(3);
    for (const x of h) {
      expect(lireDe(x)?.textContent?.trim()).toBe(FR['v2.liste.disc.play']);
      expect(plusDe(x)?.getAttribute('aria-haspopup')).toBe('menu');
    }
    expect(lireDe(h[1])!.getAttribute('aria-label')).toBe('Lire le disque 2');
    expect(h[1].querySelector('[data-disque-duree]')?.textContent?.trim()).toBe('52min');
    expect(h[2].querySelector('.discsub')?.textContent).toBe('Live');
  });

  it('🔴 « Lire le disque » du disque 2 remet les SEULES pistes du disque 2', () => {
    const geste = vi.fn();
    const el = poser({ pistes: COFFRET, enTetesDisque: true, onGesteDisque: geste });
    lireDe(enTetes(el)[1])!.click();
    expect(geste).toHaveBeenCalledTimes(1);
    const [g, tranche, disque] = geste.mock.calls[0];
    expect(g).toBe('lire');
    expect(tranche.map((p: any) => p.id)).toEqual([3, 4]);
    expect(disque).toBe(2);
  });

  it('🔴 menu « … » : focus sur la première entrée, « Lire ensuite » et « Ajouter à la file »', () => {
    const geste = vi.fn();
    const el = poser({ pistes: COFFRET, enTetesDisque: true, onGesteDisque: geste });
    const plus = plusDe(enTetes(el)[1])!;
    plus.click();
    flushSync();
    expect(plus.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(entreeDuMenu('v2.album.playNext'));
    // ↓ passe à l'entrée suivante.
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(entreeDuMenu('v2.album.addQueue'));
    entreeDuMenu('v2.album.playNext')!.click();
    flushSync();
    expect(geste.mock.calls[0][0]).toBe('ensuite');
    expect(geste.mock.calls[0][1].map((p: any) => p.id)).toEqual([3, 4]);
    // Refermé, le focus revient au bouton « … ».
    expect(document.activeElement).toBe(plus);
    plusDe(enTetes(el)[2])!.click();
    flushSync();
    entreeDuMenu('v2.album.addQueue')!.click();
    flushSync();
    expect(geste.mock.calls[1][0]).toBe('file');
    expect(geste.mock.calls[1][1].map((p: any) => p.id)).toEqual([5]);
  });

  it('Échap referme le menu sans rien lancer', () => {
    const geste = vi.fn();
    const el = poser({ pistes: COFFRET, enTetesDisque: true, onGesteDisque: geste });
    plusDe(enTetes(el)[0])!.click();
    flushSync();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
    expect(geste).not.toHaveBeenCalled();
  });

  it('🟢 un album d’UN disque : aucun bouton, même avec un sous-titre', () => {
    const el = poser({ pistes: UN_DISQUE, enTetesDisque: true, onGesteDisque: () => {} });
    expect(el.querySelector('[data-disque-lire], [data-disque-plus], [data-disque-duree]')).toBeNull();
    unmount(monte!); hote!.remove();
    const avecSousTitre = UN_DISQUE.map((p) => ({ ...p, disc_subtitle: 'Studio' }));
    const el2 = poser({ pistes: avecSousTitre, enTetesDisque: true, onGesteDisque: () => {} });
    expect(enTetes(el2).length).toBe(1);
    expect(el2.querySelector('[data-disque-lire], [data-disque-plus], [data-disque-duree]')).toBeNull();
    expect(enTetes(el2)[0].classList.contains('actif')).toBe(false);
  });

  it('🟢 sans le rappel, ou en lecture seule (Tune Circle) : l’en-tête reste un libellé', () => {
    const el = poser({ pistes: COFFRET, enTetesDisque: true });
    expect(el.querySelector('[data-disque-lire]')).toBeNull();
    unmount(monte!); hote!.remove();
    const el2 = poser({ pistes: COFFRET, enTetesDisque: true, lectureSeule: true, onGesteDisque: () => {} });
    expect(el2.querySelector('[data-disque-lire]')).toBeNull();
  });
});

describe('web#2221 — la fiche d’album joue le disque', () => {
  async function ouvrir(): Promise<HTMLDivElement> {
    vi.mocked(api.getAlbumTracks).mockResolvedValue(COFFRET as any);
    currentZoneId.set(7);
    queuePosition.set(4);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(AlbumDetailV2, {
      target: hote,
      props: { album: { id: 900, title: 'Coffret', source: 'local' } as Album, onClose: () => {} },
    });
    for (let i = 0; i < 8; i++) await respirer();
    flushSync();
    return hote;
  }

  it('🔴 « Lire le disque » 2 : la file est REMPLACÉE par les pistes 3 et 4, sans album_id', async () => {
    const el = await ouvrir();
    const h = enTetes(el);
    expect(h.length).toBe(3);
    lireDe(h[1])!.click();
    for (let i = 0; i < 4; i++) await respirer();
    expect(api.play).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.play).mock.calls[0]).toEqual([7, { track_ids: [3, 4], context_type: 'album', context_id: '900', context_source: 'local' }]);
    expect(api.addToQueue).not.toHaveBeenCalled();
  });

  it('🔴 « Lire ensuite » insère le disque après le titre en cours ; « Ajouter à la file » à la fin', async () => {
    const el = await ouvrir();
    plusDe(enTetes(el)[1])!.click();
    flushSync();
    entreeDuMenu('v2.album.playNext')!.click();
    for (let i = 0; i < 4; i++) await respirer();
    expect(vi.mocked(api.addToQueue).mock.calls[0]).toEqual([7, { track_ids: [3, 4], position: 5, context_type: 'album', context_id: '900', context_source: 'local' }]);
    flushSync();
    plusDe(enTetes(el)[1])!.click();
    flushSync();
    entreeDuMenu('v2.album.addQueue')!.click();
    for (let i = 0; i < 4; i++) await respirer();
    expect(vi.mocked(api.addToQueue).mock.calls[1]).toEqual([7, { track_ids: [3, 4], context_type: 'album', context_id: '900', context_source: 'local' }]);
    expect(api.play).not.toHaveBeenCalled();
  });

  it('témoin : « Lire à partir d’ici » sur la 1re piste du disque 2 envoie l’album ENTIER (la suite continue au disque 3)', async () => {
    const el = await ouvrir();
    const ligne = [...el.querySelectorAll<HTMLElement>('.trow')][2];
    ligne.querySelector<HTMLButtonElement>('.titre')!.click();
    for (let i = 0; i < 4; i++) await respirer();
    expect(vi.mocked(api.play).mock.calls[0]).toEqual([7, { album_id: 900, start_index: 2 }]);
  });
});
