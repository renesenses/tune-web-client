// @vitest-environment jsdom
//
// Fil forum 2143, point 2 — FabienM, v1.0.0-rc2 : « impossible de définir un
// raccourci sur un sous menu ». Le raccourci figeait le SERVICE (#1138),
// jamais son sous-onglet : posé sur « Playlists » de Tidal, il rouvrait
// l'éditorial. Le sous-onglet passe désormais par `ongletCourant`, comme les
// onglets des Favoris (web#1790).
//
// Le fixture est celui de `raccourciServiceStreaming1138.test.ts` (deux
// services connectés, Tidal n'est PAS le premier de la rangée).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import { captureCurrentView, navigateToShortcut, shortcuts } from '../stores/shortcuts';
import { ongletCourant } from '../historiqueCoquille';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';

/** Monter `StreamingV2` compile un composant de plus de mille lignes. */
vi.setConfig({ testTimeout: 60_000 });

/** Le cas d'Alain, complété d'un second service : Qobuz ET Tidal connectés. */
const SERVICES = {
  qobuz: { enabled: true, authenticated: true, username: 'Alain' },
  tidal: { enabled: true, authenticated: true, username: null },
  deezer: { enabled: true, authenticated: false, username: null },
} as any;

function reponse(corps: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/**
 * Le serveur : deux services connectés, pas d'extension Bandcamp, et une
 * configuration qui accepte tout (les raccourcis se persistent par
 * `PATCH /config`).
 */
function serveur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension non chargée');
      if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
      if (/\/config/.test(u)) return reponse({});
      return reponse([]);
    }),
  );
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

function demonter() {
  if (monte) {
    try {
      unmount(monte);
    } catch {
      /* le démontage n'est pas le sujet */
    }
    monte = null;
  }
  hote!.innerHTML = '';
}

/** Les onglets de services rendus, dans l'ordre du DOM. */
function ongletsRendus(): string[] {
  return Array.from(hote!.querySelectorAll('nav.svcs > button')).map((b) =>
    (b.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

/** L'onglet ALLUMÉ — la seule chose qui dise quel service est réellement ouvert. */
function ongletAllume(): string | null {
  const b = hote!.querySelector('nav.svcs > button.on');
  return b ? (b.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
}

/**
 * 🔴 L'ÉCRAN EST IMPORTÉ À LA COLLECTE, PAS DANS LE CAS — #1326 / #1333.
 *
 * Un `await import('….svelte')` posé DANS un cas fait payer la compilation du
 * composant par vite au chronomètre de ce cas. Sous charge (huit portes
 * simultanées sur Shrek), le chronomètre saute : vitest déclare le cas expiré,
 * `afterEach` retire l'hôte, le cas suivant s'ouvre — puis la continuation
 * abandonnée reprend et exécute son `mount(…, { target: hote! })`. `hote`
 * est une variable de MODULE : elle désigne alors l'hôte du cas SUIVANT. Deux
 * écrans dans la même boîte, et un faux rouge qui accuse le code de terrain.
 *
 * L'import statique déplace la compilation vers la COLLECTE, hors de tout
 * chronomètre, et rend `mount` SYNCHRONE ici : plus aucune continuation ne peut
 * se poser dans l'hôte du cas suivant. `StreamingV2.svelte` n'a pas de
 * `<script module>` : l'importer avant les `vi.stubGlobal(…)` ne déclenche rien.
 * Gardé par `composantsALaCollecte1333.test.ts`.
 */
async function monterEcran() {
  monte = mount(StreamingV2 as any, { target: hote! });
  for (let i = 0; i < 60; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (ongletsRendus().length) break;
  }
  await laisserTourner(10);
}

function cliquerOnglet(motif: RegExp) {
  const b = Array.from(hote!.querySelectorAll('nav.svcs > button')).find((x) =>
    motif.test(x.textContent ?? ''),
  ) as HTMLButtonElement | undefined;
  expect(b, `aucun onglet ${motif} dans [${ongletsRendus().join(' | ')}]`).toBeDefined();
  b!.click();
  flushSync();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) {
    vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  }
  serveur();
  hote = document.createElement('div');
  document.body.appendChild(hote);
  shortcuts.set([]);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('streaming');
  ongletCourant.set(null);
});

afterEach(() => {
  demonter();
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


/** Le sous-onglet ALLUMÉ. */
function sousOngletAllume(): string | null {
  const b = hote!.querySelector('nav.subs > button.on');
  return b ? (b.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
}
function cliquerSousOnglet(motif: RegExp) {
  const b = Array.from(hote!.querySelectorAll('nav.subs > button')).find((x) => motif.test(x.textContent ?? '')) as
    | HTMLButtonElement
    | undefined;
  expect(b, `aucun sous-onglet ${motif}`).toBeDefined();
  b!.click();
  flushSync();
}

describe('fil 2143 point 2 — un raccourci sur un sous-onglet de service', () => {
  it('🔴 le sous-onglet est figé, et le raccourci le rouvre', async () => {
    await monterEcran();
    cliquerOnglet(/Tidal/);
    await laisserTourner(10);
    cliquerSousOnglet(/Playlists/);
    await laisserTourner(5);
    const capte = captureCurrentView();
    expect(capte.state?.streamingService).toBe('tidal');
    expect(capte.state?.onglet, 'le sous-onglet n’est pas retenu — fil 2143, point 2').toBe('playlists');

    // On quitte, puis on rouvre par le raccourci.
    demonter();
    activeView.set('home');
    activeStreamingService.set(null);
    navigateToShortcut({ id: 's', name: 'Tidal playlists', icon: '⭐', view: 'streaming', state: capte.state! });
    await monterEcran();
    await laisserTourner(10);
    expect(ongletAllume()).toMatch(/Tidal/);
    expect(sousOngletAllume(), 'le raccourci rouvre l’éditorial au lieu du sous-onglet').toMatch(/Playlists/);
  });
});
