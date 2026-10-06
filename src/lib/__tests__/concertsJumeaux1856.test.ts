// @vitest-environment jsdom
//
// jsdom : l'écran est monté pour de vrai — sans `window`, `onMount` ne lirait
// jamais `/ext/concerts/upcoming` et le test serait vert sans rien rendre.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ConcertsView from '../../components/v2-heritage/ConcertsView.svelte';
import { grouperConcerts } from '../concertsTri';
import type { Concert } from '../api';
import { preparerLocale } from '../i18n';
import { activeView } from '../stores/navigation';
import { concertsPlugin } from '../stores/concerts';
import { preferences } from '../stores/preferences';

/**
 * web#1856 (Didier, fil 2047) : `Uncaught Error each_key_duplicate` à chaque
 * ouverture de l'écran Concerts, et l'écran reste bloqué.
 *
 * Cause : la clé des dates d'un bloc était `date + salle + ville`. Deux
 * concerts jumeaux — Muse, Nanterre, 27/11, deux soirs confirmés par la
 * capture réseau du 02/10 — ont la même. Le rangement par artiste les met
 * dans le même bloc, et Svelte refuse deux lignes de même clé.
 */

const muse = (): Concert => ({
  artist_name: 'Muse',
  event_date: '2026-11-27',
  venue: 'Paris La Défense Arena',
  city: 'Nanterre',
  country: 'FR',
  event_url: 'https://t.example/muse',
});

const LISTE: Concert[] = [
  muse(),
  muse(),
  { artist_name: 'Air', event_date: '2026-10-20', venue: 'Le Liberté', city: 'Rennes', country: 'FR', event_url: null },
];

describe('#1856 — clés des dates de concert', () => {
  for (const tri of ['artiste', 'date'] as const) {
    it(`deux concerts jumeaux ont deux clés distinctes (tri ${tri})`, () => {
      const cles = grouperConcerts(LISTE, tri).flatMap((g) => g.cles);
      expect(cles).toHaveLength(LISTE.length);
      expect(new Set(cles).size).toBe(cles.length);
    });
  }

  it('chaque bloc porte une clé par date, dans l’ordre de ses dates', () => {
    for (const g of grouperConcerts(LISTE, 'artiste')) expect(g.cles).toHaveLength(g.concerts.length);
  });

  it('la clé est stable : la même liste rend les mêmes clés', () => {
    const a = grouperConcerts(LISTE, 'artiste').flatMap((g) => g.cles);
    const b = grouperConcerts([...LISTE], 'artiste').flatMap((g) => g.cles);
    expect(b).toEqual(a);
  });
});

/* ------------------------------------------------------------------ */

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
  activeView.set('concerts');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/ext/concerts/upcoming')) return reponse(200, { concerts: LISTE, scope: 'country', country: 'FR' });
    if (u.includes('/ext/concerts/location')) {
      return reponse(200, { scope: 'country', city: 'Nanterre', country: 'FR', radius_km: 100, located: true });
    }
    return reponse(200, {});
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  preferences.update((p) => ({ ...p, concertsTri: null }));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('#1856 — l’écran Concerts rangé par artiste, avec deux concerts jumeaux', () => {
  it('s’ouvre sans each_key_duplicate et affiche les deux soirs', async () => {
    // Le choix « Par artiste » enregistré : celui de qui a ouvert l'écran avant
    // que « Par date » ne devienne le défaut (web#1718).
    preferences.update((p) => ({ ...p, concertsTri: 'artiste' }));
    const erreurs: unknown[] = [];
    hote = document.createElement('div');
    document.body.appendChild(hote);
    try {
      monte = mount(ConcertsView as never, { target: hote });
      for (let i = 0; i < 8; i++) {
        await vi.advanceTimersByTimeAsync(0);
        flushSync();
      }
    } catch (e) {
      erreurs.push(e);
    }
    expect(erreurs.map(String)).toEqual([]);
    const blocMuse = [...hote.querySelectorAll('.cc-liste > li')]
      .find((li) => li.querySelector('h3')?.textContent?.trim() === 'Muse');
    expect(blocMuse, 'bloc Muse absent').toBeTruthy();
    expect(blocMuse!.querySelectorAll('.cc-dates > li')).toHaveLength(2);
  });
});
