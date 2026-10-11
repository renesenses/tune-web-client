// @vitest-environment jsdom
//
// Fil 2166 (Bilou, Windows, rc3) — ce que Bilou VOIT : la vraie coquille,
// montée dans l'onglet que Tune ouvre au lancement.
//
// La copie locale de cet onglet dit `startupView: 'home'` — le défaut, que le
// magasin sérialise dès sa première émission, jamais choisi. Le PROFIL, au
// serveur, dit `'library'` : le réglage a été fait ailleurs (autre navigateur,
// autre adresse). En rc3, la coquille lit la vue de démarrage À SON MONTAGE,
// avant la réponse du serveur, et la fusion fait gagner la copie locale :
// Tune s'ouvre sur l'Accueil.
//
// La copie locale est posée par `vi.hoisted`, AVANT l'évaluation du magasin
// (il lit `localStorage` à l'import) ; la coquille est importée en tête de
// fichier, jamais dans un cas (garde #1333).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  localStorage.setItem('tune-preferences', JSON.stringify({ startupView: 'home', theme: 'dark' }));
});

import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView } from '../stores/navigation';

const PROFIL = { startupView: 'library', theme: 'dark' };

const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres|sources)(\?|\/|$)/;

function reponsePour(url: string) {
  const corps = url.includes('system/config')
    ? { ui_preferences: JSON.stringify(PROFIL) }
    : COLLECTIONS.test(url) ? [] : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserRepondreLeServeur() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
  flushSync();
}

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
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  activeView.set('home');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  activeView.set('home');
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fil 2166 — l’onglet du lancement suit la vue de démarrage du profil', () => {
  it('🔴 copie locale « home », profil « library » : Tune s’ouvre sur la Bibliothèque', { timeout: 60_000 }, async () => {
    const el = ouvrirTune('');
    const longueur = history.length;
    await laisserRepondreLeServeur();

    expect(get(activeView), 'la coquille a gardé la vue de la copie locale').toBe('library');
    expect(el.querySelector('.v2-lib'), 'la Bibliothèque n’est pas rendue').not.toBeNull();
    expect(location.hash).toBe('#library');
    expect(history.length, 'la vue relue réécrit l’entrée, elle n’en empile pas').toBe(longueur);
  });

  it('un lien profond reste une demande expresse : #queue n’est pas recouvert par le profil', { timeout: 60_000 }, async () => {
    ouvrirTune('#queue');
    await laisserRepondreLeServeur();
    expect(get(activeView)).toBe('queue');
  });
});
