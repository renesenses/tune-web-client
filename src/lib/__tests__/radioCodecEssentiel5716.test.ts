// @vitest-environment jsdom
//
// #5716 — le codec d'une station se lit dès le niveau Essentiel (décision du
// 07/10). Le pays, lui, reste réservé à Avancé (#863).
//
// Le test MONTE l'écran Radio et lit le texte rendu, aux deux niveaux.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import RadiosV2 from '../../components/v2/RadiosV2.svelte';

const RADIOS = [
  {
    id: 1, name: 'BBC Radio 3', stream_url: 'https://x.invalid/1', logo_url: null,
    genre: 'Classique', country: 'Royaume-Uni', country_code: 'GB',
    codec: 'aac', homepage_url: null, favorite: false,
  },
  {
    // Le serveur n'a pas encore vu son codec : aucune pastille vide.
    id: 2, name: 'Radio sans codec', stream_url: 'https://x.invalid/2', logo_url: null,
    genre: 'Jazz', country: null, codec: null, homepage_url: null, favorite: false,
  },
];

class Inerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const chemin = String(typeof url === 'string' ? url : url?.url ?? '').split('?')[0];
    const c = chemin.endsWith('/radios') ? RADIOS : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c,
      text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

async function poser(niveau: 'beginner' | 'intermediate'): Promise<HTMLDivElement> {
  preferences.update((p) => ({ ...p, settingsLevel: niveau }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(RadiosV2, { target: hote, props: {} as any });
  flushSync();
  for (let i = 0; i < 400 && !(hote.textContent ?? '').includes('BBC Radio 3'); i++) {
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
  return hote;
}

const pastilles = (racine: HTMLElement) =>
  Array.from(racine.querySelectorAll('.tk')).map((n) => (n.textContent ?? '').trim());

describe('#5716 — le codec des radios dès Essentiel', () => {
  it('🔴 en Essentiel, la vignette porte le codec, sans le pays', async () => {
    const racine = await poser('beginner');
    expect(racine.textContent).toContain('BBC Radio 3');
    expect(pastilles(racine)).toEqual(['AAC']);
  });

  it('en Avancé, le codec et le pays partagent la pastille, comme avant', async () => {
    const racine = await poser('intermediate');
    expect(racine.textContent).toContain('BBC Radio 3');
    expect(pastilles(racine)).toEqual(['AAC · Royaume-Uni']);
  });
});
