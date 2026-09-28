// @vitest-environment jsdom
//
// web#1649 — LE PRÉCÉDENT DU NAVIGATEUR REFERME UNE PLAYLIST OUVERTE DEPUIS
// L'ÉCRAN D'UN SERVICE (Qobuz > onglet Playlists).
//
// FabienM, fil 1982 (0.9.166), point 2 : « dans le menu Qobuz, onglet
// Playlist, on ouvre une playlist Qobuz, le BACK devrait simuler le bouton
// Retour mais il renvoie à la dernière page de 1er niveau ».
//
// CAUSE, lue dans le code : `StreamingV2` ouvrait sa fiche playlist en posant
// `fichePlaylist`, un `$state` local, sans `ouvrirDetail`. Le calque album du
// même écran empilait (#980) ; la playlist, non. web#1619 avait fait le même
// branchement dans `PlaylistsV2` seulement.
//
// Point 2, même fil : « Menu Playlists, onglet SmartPlaylists, on ouvre une
// playlist ». Le seul calque de cet onglet est l'éditeur de règle
// (`PlaylistSmartEditeurV2`), ouvert par `editeurSmart` sans `ouvrirDetail`.
// Décision de Bertrand (28/09) : le Précédent le REFERME, sans confirmation.
//
// ON MONTE LA VRAIE `ShellV2` et l'on clique là où le testeur clique ; le test
// n'appelle jamais `pushState` lui-même.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { activeStreamingService } from '../stores/streaming';
import { detailOuvert } from '../historiqueCoquille';
import { t } from '../i18n';
import { reculer } from './reculer';

vi.setConfig({ testTimeout: 30_000 });

const SMART = { id: 9, name: 'Coups de cœur', rules: [], match_mode: 'all', track_count: 4 };
const PLAYLIST_QOBUZ = { source_id: 'q-777', name: 'Sleepy Mix', track_count: 50, source: 'qobuz' };

function corpsPour(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/library/smart-playlists') return [SMART];
  if (p === '/library/smart-playlists/9') return SMART;
  if (p === '/streaming/services') return { qobuz: { authenticated: true, enabled: true } };
  if (p === '/streaming/qobuz/playlists') return [PLAYLIST_QOBUZ];
  if (/^\/streaming\/qobuz\/playlists\/q-777/.test(p)) return [];
  if (/\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|featured|new-releases)(\/|$)/.test(p)) return [];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function stabiliser(tours = 10): Promise<void> {
  for (let i = 0; i < tours; i++) { await respirer(); flushSync(); }
}

async function attendreQue(cond: () => boolean, quoi: string, ms = 4_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await respirer();
    flushSync();
  }
}

function popstateAttendu(quoi: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const filet = setTimeout(() => reject(new Error(`aucun popstate : ${quoi}`)), 4_000);
    window.addEventListener('popstate', () => { clearTimeout(filet); resolve(); }, { once: true });
  });
}

async function precedent(): Promise<void> {
  await reculer();
  flushSync();
  await stabiliser();
}

const detailPlaylist = (el: HTMLElement) => el.querySelector('.v2-pldetail');

/** Accueil → Qobuz → onglet Playlists → Sleepy Mix : le chemin du signalement. */
async function ouvrirLaPlaylistQobuz(): Promise<{ el: HTMLDivElement; hauteur: number }> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote, props: {} });
  flushSync();
  const el = hote;
  activeStreamingService.set('qobuz');
  activeView.set('streaming');
  flushSync();
  const libelle = get(t)('v2.nav.playlists' as any);
  const onglet = () => [...el.querySelectorAll<HTMLButtonElement>('.subs button')]
    .find((b) => b.textContent?.trim() === libelle);
  await attendreQue(() => !!onglet(), 'l’onglet Playlists de Qobuz');
  onglet()!.click();
  flushSync();
  const titre = () => [...el.querySelectorAll<HTMLElement>('.v2-str [title="Sleepy Mix"], .v2-str button')]
    .find((b) => b.textContent?.includes('Sleepy Mix') && b.tagName === 'BUTTON');
  await attendreQue(() => !!titre(), 'la carte Sleepy Mix');
  await stabiliser();
  const hauteur = history.length;
  titre()!.click();
  flushSync();
  await attendreQue(() => !!detailPlaylist(el), 'le détail de Sleepy Mix');
  return { el, hauteur };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const corps = corpsPour(String(url));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver);
  for (const [prop, valeur] of [['clientHeight', 2000], ['clientWidth', 1400]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => valeur });
  }
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  activeView.set('home');
  pendingLibraryAlbum.set(null);
  vueDeRetour.set(null);
  detailOuvert.set(null);
  history.replaceState(null, '', '/');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('web#1649 — Qobuz > Playlists : ouvrir une playlist empile une étape', () => {
  it('🔴 ouvrir EMPILE une entrée qui porte la playlist', async () => {
    const { hauteur } = await ouvrirLaPlaylistQobuz();
    expect(history.length, 'ouvrir une playlist de service n’empile AUCUNE entrée').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'streaming', detail: 'streamingplaylists:qobuz:q-777' });
  });

  it('🔴 le Précédent referme le détail et reste sur l’écran Qobuz', async () => {
    const { el } = await ouvrirLaPlaylistQobuz();
    await precedent();
    expect(get(activeView), 'le Précédent a quitté l’écran Qobuz').toBe('streaming');
    expect(detailPlaylist(el), 'le Précédent ne referme pas la playlist Qobuz').toBeNull();
  });

  it('le Retour du détail referme ET dépile : aucun cran mort derrière', async () => {
    const { el } = await ouvrirLaPlaylistQobuz();
    const attente = popstateAttendu('le Retour du détail n’a pas dépilé');
    el.querySelector<HTMLButtonElement>('.v2-pldetail button.close')!.click();
    await attente;
    flushSync();
    await stabiliser();
    expect(detailPlaylist(el)).toBeNull();
    expect(history.state).toMatchObject({ vue: 'streaming', detail: null });

    await precedent();
    expect(get(activeView), 'un Précédent après le Retour est resté sur place : cran mort').toBe('home');
  });
});

/* ------------------------------------------------------------------ */
/* POINT 2 — PLAYLISTS > SMARTPLAYLISTS : L'ÉDITEUR DE RÈGLE           */
/* ------------------------------------------------------------------ */

const editeur = (el: HTMLElement) => el.querySelector('.v2-spl');

/** Accueil → Playlists → onglet SmartPlaylists. */
async function ouvrirLOngletSmart(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote, props: {} });
  flushSync();
  const el = hote;
  activeView.set('playlists');
  flushSync();
  const libelle = get(t)('v2.pl.tabSmart' as any);
  const onglet = () => [...el.querySelectorAll<HTMLButtonElement>('button.onglet')]
    .find((b) => b.textContent?.trim() === libelle);
  await attendreQue(() => !!onglet(), 'l’onglet SmartPlaylists');
  onglet()!.click();
  flushSync();
  await attendreQue(() => !!el.querySelector('.card.local'), 'la carte Coups de cœur');
  await stabiliser();
  return el;
}

/** Le crayon de la carte : « ouvrir la playlist » dans cet onglet. */
function crayon(el: HTMLElement): HTMLButtonElement {
  const b = el.querySelector<HTMLButtonElement>(
    `.card.local button[aria-label="${get(t)('v2.cover.edit' as any)}"]`,
  );
  expect(b, 'pas de crayon sur la carte de la smart playlist').toBeTruthy();
  return b!;
}

describe('web#1649 — Playlists > SmartPlaylists : l’éditeur de règle empile une étape', () => {
  it('🔴 ouvrir l’éditeur EMPILE une entrée qui le porte', async () => {
    const el = await ouvrirLOngletSmart();
    const hauteur = history.length;
    crayon(el).click();
    flushSync();
    await attendreQue(() => !!editeur(el), 'l’éditeur de règle');
    expect(history.length, 'ouvrir l’éditeur n’empile AUCUNE entrée').toBe(hauteur + 1);
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'playlists', detail: 'smartplaylist:9' });
  });

  it('🔴 le Précédent referme l’éditeur et reste dans l’onglet SmartPlaylists', async () => {
    const el = await ouvrirLOngletSmart();
    crayon(el).click();
    flushSync();
    await attendreQue(() => !!editeur(el), 'l’éditeur de règle');

    await precedent();
    expect(get(activeView), 'le Précédent a quitté les Playlists').toBe('playlists');
    expect(editeur(el), 'le Précédent ne referme pas l’éditeur').toBeNull();
    expect(el.querySelector('.card.local'), 'l’onglet SmartPlaylists n’est plus affiché').toBeTruthy();

    await precedent();
    expect(get(activeView)).toBe('home');
  });

  it('🔴 « Nouvelle » : le Précédent referme aussi l’éditeur vierge', async () => {
    const el = await ouvrirLOngletSmart();
    el.querySelector<HTMLButtonElement>('.grp.creer button')!.click();
    flushSync();
    await attendreQue(() => !!editeur(el), 'l’éditeur vierge');
    expect(history.state).toMatchObject({ vue: 'playlists', detail: 'smartplaylist:nouvelle' });

    await precedent();
    expect(get(activeView)).toBe('playlists');
    expect(editeur(el)).toBeNull();
  });

  it('la croix de l’éditeur referme ET dépile : aucun cran mort derrière', async () => {
    const el = await ouvrirLOngletSmart();
    crayon(el).click();
    flushSync();
    await attendreQue(() => !!editeur(el), 'l’éditeur de règle');

    const attente = popstateAttendu('la croix de l’éditeur n’a pas dépilé');
    el.querySelector<HTMLButtonElement>('.v2-spl button.fermer')!.click();
    await attente;
    flushSync();
    await stabiliser();
    expect(editeur(el)).toBeNull();
    expect(history.state).toMatchObject({ vue: 'playlists', detail: null });

    await precedent();
    expect(get(activeView), 'un Précédent après la croix est resté sur place : cran mort').toBe('home');
  });
});
