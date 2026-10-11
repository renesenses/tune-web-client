// @vitest-environment jsdom
//
// renesenses/tune-web-client#2050 — FabienM, fil 2199 point 9, 1.0.0-rc3 :
//
//   « Raccourci sur un sous répertoire ne fonctionne pas »
//
// CAUSE, lue dans le code : l'écran Répertoires (`v2-heritage/BrowseView`)
// ne publiait AUCUNE cible de raccourci (`setShortcutTarget`), contrairement
// aux playlists, collections, étiquettes ou fiches. Le raccourci posé sur un
// sous-dossier ne retenait donc que la vue `browse` : le cliquer rouvrait la
// liste des emplacements, pas le dossier.
//
// ON MONTE LA VRAIE `ShellV2` : on descend dans un sous-dossier en cliquant,
// on capture le raccourci comme le fait le signet de la coquille, on part
// ailleurs, puis on clique le raccourci (`navigateToShortcut`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { repertoireCible } from '../stores/repertoireCible';
import { detailOuvert } from '../historiqueCoquille';
import {
  captureCurrentView, clearShortcutTarget, currentShortcutTarget, navigateToShortcut, type Shortcut,
} from '../stores/shortcuts';

vi.setConfig({ testTimeout: 30_000 });

const RACINE = { name: 'Musique', path: '/music', track_count: 12, exists: true };
const DOSSIERS: Record<string, { parent: string | null; enfants: string[] }> = {
  '/music': { parent: null, enfants: ['/music/Blues', '/music/Jazz'] },
  '/music/Blues': { parent: '/music', enfants: ['/music/Blues/Chicago'] },
  '/music/Blues/Chicago': { parent: '/music/Blues', enfants: [] },
  '/music/Jazz': { parent: '/music', enfants: [] },
};

function dossier(path: string) {
  const d = DOSSIERS[path];
  return {
    path,
    parent: d?.parent ?? null,
    music_root: '/music',
    directories: (d?.enfants ?? []).map((p) => ({ name: p.split('/').pop(), path: p, track_count: 1 })),
    tracks: [],
    accessible: true,
  };
}

function corpsPour(url: string): unknown {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  if (p === '/library/browse') return { roots: [RACINE] };
  if (p === '/library/browse/dir') return dossier(u.searchParams.get('path') ?? '');
  if (/\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\/|$)/.test(p)) return [];
  return {};
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function stabiliser(tours = 10): Promise<void> {
  for (let i = 0; i < tours; i++) { await respirer(); flushSync(); }
}
/** Attendre qu'une condition tienne, sans chronomètre fixe (charge de Shrek). */
async function attendreQue(cond: () => boolean, quoi: string, ms = 4_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
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
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  activeView.set('home');
  vueDeRetour.set(null);
  repertoireCible.set(null);
  detailOuvert.set(null);
  clearShortcutTarget();
  history.replaceState(null, '', '/');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote, props: {} });
  flushSync();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const dossierCourant = () =>
  hote!.querySelector('.browse-view .breadcrumb-current')?.textContent?.trim() ?? null;

function cliquerDossier(nom: string) {
  const b = [...hote!.querySelectorAll<HTMLButtonElement>('.browse-view .dir-item, .browse-view .root-item')]
    .find((x) => x.textContent?.includes(nom));
  expect(b, `pas de dossier « ${nom} » à cliquer`).toBeTruthy();
  b!.click();
  flushSync();
}

/** Répertoires → Musique → Blues → Chicago, puis le raccourci tel que le signet le capture. */
async function raccourciSurChicago(): Promise<Shortcut> {
  activeView.set('browse');
  flushSync();
  await attendreQue(() => !!hote!.querySelector('.browse-view .root-item'), 'la liste des emplacements');
  cliquerDossier('Musique');
  await attendreQue(() => dossierCourant() === 'music', 'le dossier /music');
  cliquerDossier('Blues');
  await attendreQue(() => dossierCourant() === 'Blues', 'le dossier Blues');
  cliquerDossier('Chicago');
  await attendreQue(() => dossierCourant() === 'Chicago', 'le dossier Chicago');
  const capture = captureCurrentView();
  return { id: 'sc-test', name: 'Chicago', ...capture } as Shortcut;
}

describe('#2050 — un raccourci sur un sous-répertoire rouvre CE dossier', () => {
  it('🔴 le sous-dossier ouvert se déclare comme cible de raccourci', async () => {
    const sc = await raccourciSurChicago();
    expect(get(currentShortcutTarget)?.key, 'les Répertoires ne publient aucune cible').toBe('dossier:/music/Blues/Chicago');
    expect(sc).toMatchObject({ view: 'browse', state: { target: { key: 'dossier:/music/Blues/Chicago' } } });
  });

  it('🔴 cliqué depuis un autre écran, le raccourci ouvre le dossier, pas la liste des emplacements', async () => {
    const sc = await raccourciSurChicago();
    activeView.set('home');
    await stabiliser();
    expect(get(currentShortcutTarget), 'quitter les Répertoires oublie la cible').toBeNull();

    navigateToShortcut(sc);
    await stabiliser();
    expect(get(activeView)).toBe('browse');
    await attendreQue(() => dossierCourant() === 'Chicago', 'le raccourci rouvre Chicago (fil 2199 point 9)');
    expect(hote!.querySelector('.browse-view .roots-list'), 'la liste des emplacements à la place du dossier').toBeNull();
  });

  it('cliqué depuis les Répertoires eux-mêmes (autre dossier ouvert), il ouvre aussi le dossier', async () => {
    const sc = await raccourciSurChicago();
    // On remonte à la main par le fil d'Ariane.
    hote!.querySelector<HTMLButtonElement>('.browse-view .breadcrumb-link')?.click();
    flushSync();
    await attendreQue(() => dossierCourant() !== 'Chicago', 'remonté hors de Chicago');

    navigateToShortcut(sc);
    await attendreQue(() => dossierCourant() === 'Chicago', 'le raccourci rouvre Chicago depuis les Répertoires');
  });

  it('à la liste des emplacements, aucune cible : le raccourci garde la vue seule', async () => {
    activeView.set('browse');
    flushSync();
    await attendreQue(() => !!hote!.querySelector('.browse-view .root-item'), 'la liste des emplacements');
    expect(get(currentShortcutTarget)).toBeNull();
    expect(captureCurrentView().state?.target).toBeUndefined();
  });
});
