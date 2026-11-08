// @vitest-environment jsdom
//
// Fil 2705 (rc10, Windows 11 / Firefox) — « Autres artistes du label X » :
// depuis la fiche d'un album de la Bibliothèque, le lien ramenait sur l'onglet
// Albums au lieu d'ouvrir le label ; depuis la fiche d'un artiste il marchait,
// mais le Retour de la page du label menait à la liste des labels.
//
// Cause : la fiche d'album se referme en RECULANT (`history.back()`), dont le
// `popstate` arrive APRÈS que le lien a demandé l'onglet Labels ; la coquille
// repose alors l'onglet de l'entrée atteinte (Albums) et efface le label.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView, pendingLibraryAlbum, pendingLibraryArtist, pendingLibraryYear, vueDeRetour } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import { brancherHistoriqueCoquille, detailOuvert } from '../historiqueCoquille';
import { ouvrirLabelDansLaBibliotheque } from '../artistesDuLabel';
import { preferences } from '../stores/preferences';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const ALBUM: Album = {
  id: 55, title: 'Living Proof', artist_id: 994, artist_name: 'Robin Beck', year: 2003,
  label: 'Frontiers Records',
} as Album;
const AUTRE: Album = { id: 56, title: 'Autre', artist_id: 995, artist_name: 'Autre Artiste', year: 2001, label: 'Frontiers Records' } as Album;

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
const attendre = async (n = 14) => { for (let i = 0; i < n; i++) await respirer(); await new Promise((r) => setTimeout(r, 60)); flushSync(); };

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let debrancher: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  (Element.prototype as any).scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const corps: unknown = /\/library\/albums\/55(\?|$)/.test(u) ? ALBUM
      : /\/tracks/.test(u) ? []
      : /\/library\/albums/.test(u) ? [ALBUM, AUTRE]
      : /\/library\/(artists|tracks)/.test(u) ? [] : {};
    return { ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  try { localStorage.clear(); } catch { /* */ }
  preferences.update((p) => ({ ...p, settingsLevel: 'intermediate' }));
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  pendingLibraryArtist.set(null);
  pendingLibraryYear.set(null);
  vueDeRetour.set(null);
  detailOuvert.set(null);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  debrancher?.(); debrancher = null;
  if (monte) unmount(monte);
  monte = null;
  hote?.remove(); hote = null;
  albumsStore.set([]);
  activeView.set('home');
  detailOuvert.set(null);
  delete (Element.prototype as any).scrollIntoView;
  vi.unstubAllGlobals();
});

async function poserBibliotheque(): Promise<HTMLDivElement> {
  albumsStore.set([ALBUM, AUTRE]);
  debrancher = brancherHistoriqueCoquille();
  activeView.set('library');
  flushSync();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as any });
  await attendre();
  return hote;
}

const fiche = (el: HTMLElement) => el.querySelector('.v2-detail');
const sectionLabel = (el: HTMLElement) => el.querySelector<HTMLElement>('.facets section.facet[data-facette]');

async function ouvrirFicheEtLien(el: HTMLElement) {
  [...el.querySelectorAll<HTMLElement>('.grid .card')].find((c) => c.textContent?.includes('Living Proof'))!.querySelector<HTMLButtonElement>('button.meta')!.click();
  await attendre();
  expect(fiche(el), 'la fiche d’album ne s’est pas ouverte').not.toBeNull();
  const lien = el.querySelector<HTMLButtonElement>('[data-lien-label]');
  expect(lien, 'le lien « Autres artistes du label » est absent').not.toBeNull();
  lien!.click();
  await attendre();
}

describe('fil 2705 — le lien « Autres artistes du label » depuis une fiche d’album', () => {
  it('🔴 ouvre la page du label (et non l’onglet Albums)', async () => {
    const el = await poserBibliotheque();
    await ouvrirFicheEtLien(el);
    expect(fiche(el), 'la fiche est restée ouverte').toBeNull();
    expect(sectionLabel(el)?.dataset.facette, 'la page du label n’est pas ouverte').toBe('Frontiers Records');
    expect(el.querySelector('.tab.active')?.getAttribute('data-onglet')).toBe('labels');
  });

  it('🔴 Retour rouvre la fiche de l’album d’où l’on vient', async () => {
    const el = await poserBibliotheque();
    await ouvrirFicheEtLien(el);
    el.querySelector<HTMLButtonElement>('.fretour')!.click();
    await attendre();
    expect(fiche(el), 'Retour ne rouvre pas la fiche d’album').not.toBeNull();
    expect(el.querySelector('.v2-detail')?.textContent).toContain('Living Proof');
  });
});

describe('fil 2705 — Retour de la page du label ouverte depuis une fiche d’artiste', () => {
  it('🔴 rend l’artiste d’où l’on vient', async () => {
    const el = await poserBibliotheque();
    activeView.set('library');
    await ouvrirLabelDansLaBibliotheque('Frontiers Records', { genre: 'artiste', id: 994, nom: 'Robin Beck' });
    await attendre();
    expect(sectionLabel(el)?.dataset.facette).toBe('Frontiers Records');
    el.querySelector<HTMLButtonElement>('.fretour')!.click();
    await attendre();
    expect(get(activeView), 'Retour ne rend pas la page artiste').not.toBe('library');
  });

  it('sans origine (Favoris, Recherche) : Retour revient à la liste des labels', async () => {
    const el = await poserBibliotheque();
    await ouvrirLabelDansLaBibliotheque('Frontiers Records');
    await attendre();
    el.querySelector<HTMLButtonElement>('.fretour')!.click();
    await attendre();
    expect(sectionLabel(el)).toBeNull();
    expect(el.querySelector('.fliste')).not.toBeNull();
  });
});
