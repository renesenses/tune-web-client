// @vitest-environment jsdom
//
// Fil 2166 du forum (v1.0.0-rc2, Windows) : « le choix d'ouvrir Tune sur la
// vue bibliothèque (en paramètre général) n'est pas respecté. Tune s'ouvre
// toujours sur la vue "accueil". »
//
// 🔴 La cause : un réglage ÉCRIT, plus aucun LECTEUR. Réglages › Général
// enregistre `preferences.startupView`, mais la seule ligne qui le lisait vivait
// dans `App.svelte`, retiré avec l'ancienne interface (phase 5). La coquille v2
// naissait donc toujours sur `activeView = 'home'`.
//
// Comme `routeAuChargement.test.ts`, ce témoin monte la VRAIE coquille et
// regarde l'écran rendu : appeler une fonction pure ne prouverait pas qu'elle
// est branchée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, pendingLibraryAlbum, vueDeRetour } from '../stores/navigation';
import { preferences, type StartupView } from '../stores/preferences';
import { detailOuvert } from '../historiqueCoquille';
import { vueAuChargement } from '../routeAuChargement';

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;

function reponsePour(url: string) {
  const corps = COLLECTIONS.test(url) ? [] : {};
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

/** Même budget que `routeAuChargement.test.ts` : la coquille entière se monte. */
const DELAI_MONTAGE = 60_000;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poserVueDeDemarrage(v: StartupView) {
  preferences.update((p) => ({ ...p, startupView: v }));
}

/** Ouvrir Tune : l'adresse porte (ou non) un fragment au montage. */
function ouvrirTune(fragment: string): HTMLDivElement {
  history.replaceState(null, '', fragment === '' ? '/' : `/${fragment}`);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => reponsePour(String(url))));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  // « Lecture en cours » mesure sa pochette : jsdom n'a pas d'observateurs.
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
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
  poserVueDeDemarrage('home');
  activeView.set('home');
  detailOuvert.set(null);
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fil 2166 — la vue de démarrage choisie dans Réglages › Général', () => {
  it('🔴 « Bibliothèque » choisie : Tune s’ouvre sur la Bibliothèque, pas sur l’Accueil', { timeout: DELAI_MONTAGE }, () => {
    poserVueDeDemarrage('library');
    const el = ouvrirTune('');

    expect(get(activeView), 'la coquille ignore preferences.startupView').toBe('library');
    expect(el.querySelector('.v2-lib'), 'la Bibliothèque n’est pas rendue').not.toBeNull();
    expect(el.querySelector('.v2-home')).toBeNull();
    // L'entrée ancrée dit ce que l'écran montre, sans en empiler une.
    expect(location.hash).toBe('#library');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'library', detail: null });
  });

  it('chaque choix du réglage ouvre son écran', { timeout: DELAI_MONTAGE }, () => {
    for (const v of ['nowplaying', 'queue', 'playlists', 'search', 'settings'] as StartupView[]) {
      poserVueDeDemarrage(v);
      ouvrirTune('');
      expect(get(activeView), `startupView = ${v}`).toBe(v);
      unmount(monte!); monte = null; hote!.remove(); hote = null;
      activeView.set('home');
    }
  });

  it('un lien profond reste une demande expresse : #queue l’emporte sur la vue de démarrage', { timeout: DELAI_MONTAGE }, () => {
    poserVueDeDemarrage('library');
    ouvrirTune('#queue');
    expect(get(activeView)).toBe('queue');
    expect(location.hash).toBe('#queue');
  });

  it('par défaut, rien ne change : l’Accueil', { timeout: DELAI_MONTAGE }, () => {
    const el = ouvrirTune('');
    expect(get(activeView)).toBe('home');
    expect(el.querySelector('.v2-home')).not.toBeNull();
    expect(location.hash).toBe('#home');
  });

  it('une vue déjà posée avant le montage n’est pas recouverte', { timeout: DELAI_MONTAGE }, () => {
    poserVueDeDemarrage('library');
    activeView.set('search');
    ouvrirTune('');
    expect(get(activeView)).toBe('search');
  });

  it('changer le réglage pendant la session ne déplace pas l’écran courant', { timeout: DELAI_MONTAGE }, () => {
    ouvrirTune('');
    activeView.set('radios');
    flushSync();
    poserVueDeDemarrage('library');
    flushSync();
    expect(get(activeView), 'la vue de démarrage ne vaut qu’à l’ouverture').toBe('radios');
  });
});

describe('vueAuChargement — l’adresse d’abord, la préférence ensuite', () => {
  it('sans fragment : la vue de démarrage, si c’est une destination', () => {
    expect(vueAuChargement('', 'library')).toBe('library');
    expect(vueAuChargement('#', 'queue')).toBe('queue');
  });
  it('un fragment désigne l’écran, même quand la préférence dit autre chose', () => {
    expect(vueAuChargement('#queue', 'library')).toBe('queue');
  });
  it('une valeur abîmée (venue du serveur) ne pose rien', () => {
    expect(vueAuChargement('', 'hologramme')).toBeNull();
    expect(vueAuChargement('', 'login')).toBeNull();
    expect(vueAuChargement('', 42)).toBeNull();
    expect(vueAuChargement('', undefined)).toBeNull();
  });
  it('#tv garde son chemin à part : la préférence ne le recouvre pas', () => {
    expect(vueAuChargement('#tv&zone=12', 'library')).toBeNull();
  });
});
