// @vitest-environment jsdom
//
// tune-server-rust#8145 — « Autres artistes du label » (fil 2705, rc10,
// Firefox) :
//
//   1. « Bibliothèque → Album → cliquer sur le nom [du label] : il ne se passe
//      rien, on revient sur l'onglet Bibliothèque. »
//   2. Depuis la page d'un artiste, le lien marche, mais « quand on fait
//      retour, on revient sur l'onglet Label général et non sur l'artiste ».
//
// Cause du 1 : le lien de la fiche referme la fiche EN RECULANT
// (`fermerDetailEnReculant` → `history.back()`, asynchrone), puis demande
// l'onglet Labels. Le `popstate` arrive APRÈS et repose l'onglet de l'entrée
// atteinte (Albums) : la page du label est défaite aussitôt ouverte.
//
// On monte la VRAIE Bibliothèque, la coquille branchée sur l'historique de
// jsdom (`pushState`, `back()`, `popstate` asynchrones comme dans Firefox),
// on ouvre la fiche d'album et on CLIQUE le lien.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import LibraryV2 from '../../components/v2/LibraryV2.svelte';
import { activeView, pendingLibraryAlbum, pendingLibraryArtist, pendingLibraryYear } from '../stores/navigation';
import { albums as albumsStore } from '../stores/library';
import { preferences } from '../stores/preferences';
import { brancherHistoriqueCoquille, detailOuvert, ongletCourant } from '../historiqueCoquille';
import { ouvrirLabelDansLaBibliotheque } from '../artistesDuLabel';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const ALBUM: Album = {
  id: 55,
  title: 'Köln Concert',
  artist_id: 994,
  artist_name: 'Keith Jarrett',
  year: 1975,
  label: 'ECM',
} as Album;

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function corpsPour(url: string): unknown {
  if (/\/library\/albums\/55\/tracks/.test(url)) return [];
  if (/\/library\/albums\/55(\?|$)/.test(url)) return ALBUM;
  if (/\/library\/artists\/994\/albums/.test(url)) return [ALBUM];
  if (/\/library\/labels\//.test(url)) return { library: [], discover: [] };
  if (/\/library\/artists/.test(url)) return [];
  if (/\/library\/albums/.test(url)) return [ALBUM];
  if (/\/library\/tracks/.test(url)) return [];
  return {};
}

const respirer = () => new Promise((r) => setTimeout(r, 0));
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));
/** Le prochain `popstate`, attendu sur son événement (cf. `reculer.ts`). */
const prochainPopstate = () =>
  new Promise<void>((resolve, reject) => {
    const filet = setTimeout(() => reject(new Error('aucun popstate')), 4_000);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
  });

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let debrancher: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  // jsdom n'a pas de mise en page : la page du label y défile vers sa section.
  (Element.prototype as any).scrollIntoView = () => {};
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = corpsPour(String(url));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  // Les onglets de facette (Labels) sont ceux du niveau intermédiaire.
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  pendingLibraryArtist.set(null);
  pendingLibraryYear.set(null);
  detailOuvert.set(null);
  ongletCourant.set(null);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (debrancher) debrancher();
  debrancher = null;
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  albumsStore.set([]);
  activeView.set('home');
  detailOuvert.set(null);
  ongletCourant.set(null);
  vi.unstubAllGlobals();
});

async function monterBibliotheque(vueAvant: 'home' | 'streamingartist'): Promise<HTMLDivElement> {
  albumsStore.set([ALBUM]);
  activeView.set('home');
  debrancher = brancherHistoriqueCoquille();
  activeView.set(vueAvant === 'home' ? 'library' : vueAvant);
  flushSync();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LibraryV2, { target: hote, props: {} as any });
  for (let i = 0; i < 8; i++) await respirer();
  flushSync();
  return hote;
}

const titreDeLaValeurOuverte = (el: HTMLElement) =>
  el.querySelector('.facette-ouverte .ftitre .fk')?.textContent?.trim() ?? null;

describe('#8145 — « Autres artistes du label » depuis la fiche d’un album', () => {
  it('🔴 le clic ouvre la page du label, et le popstate de la fermeture ne la défait pas', async () => {
    const el = await monterBibliotheque('home');
    const vignette = el.querySelector<HTMLButtonElement>('.grid .card button.meta');
    expect(vignette, 'aucune vignette d’album : le témoin ne mesure rien').not.toBeNull();
    vignette!.click();
    flushSync();
    await attendre();
    flushSync();
    const lien = el.querySelector<HTMLButtonElement>('.v2-detail [data-lien-label]');
    expect(lien, 'le lien « Autres artistes du label » est absent de la fiche').not.toBeNull();

    const retourDeLaFiche = prochainPopstate();
    lien!.click();
    flushSync();
    await retourDeLaFiche;
    for (let i = 0; i < 6; i++) {
      await attendre(20);
      flushSync();
    }

    expect(el.querySelector('.v2-detail'), 'la fiche est restée ouverte').toBeNull();
    expect(get(activeView)).toBe('library');
    expect(get(ongletCourant), 'l’onglet Labels a été défait par le popstate').toBe('labels');
    expect(titreDeLaValeurOuverte(el), 'la page du label ECM n’est pas ouverte').toBe('ECM');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'library', detail: null, onglet: 'labels' });
  });
});

describe('#8145 — le Retour de la page du label ouverte depuis un artiste', () => {
  it('🔴 ramène à la vue de l’artiste, pas à la liste des labels', async () => {
    const el = await monterBibliotheque('streamingartist');
    // Le geste de `ArtisteServiceV2` (lien « Autres artistes du label »).
    await ouvrirLabelDansLaBibliotheque('ECM');
    for (let i = 0; i < 6; i++) {
      await attendre(20);
      flushSync();
    }
    expect(get(activeView)).toBe('library');
    expect(titreDeLaValeurOuverte(el), 'la page du label ECM n’est pas ouverte').toBe('ECM');

    const retour = el.querySelector<HTMLButtonElement>('.facette-ouverte button.fretour');
    expect(retour, 'le bouton Retour de la page du label a disparu').not.toBeNull();
    const precedent = prochainPopstate();
    retour!.click();
    flushSync();
    await precedent;
    flushSync();

    expect(get(activeView), 'le Retour montre la liste des labels au lieu de l’artiste').toBe('streamingartist');
  });

  it('ouverte à la main dans la Bibliothèque, le Retour rend la liste (inchangé)', async () => {
    const el = await monterBibliotheque('home');
    await ouvrirLabelDansLaBibliotheque('ECM');
    for (let i = 0; i < 6; i++) {
      await attendre(20);
      flushSync();
    }
    expect(titreDeLaValeurOuverte(el)).toBe('ECM');
    el.querySelector<HTMLButtonElement>('.facette-ouverte button.fretour')!.click();
    flushSync();
    await attendre();
    flushSync();
    expect(get(activeView)).toBe('library');
    expect(titreDeLaValeurOuverte(el)).toBeNull();
  });
});
