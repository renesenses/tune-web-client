// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ConcertsView from '../../components/v2-heritage/ConcertsView.svelte';
import { preparerLocale } from '../i18n';
import { activeView } from '../stores/navigation';
import { concertsPlugin } from '../stores/concerts';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import hu from '../locales/hu';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const CATALOGUES: Record<string, Record<string, string>> = {
  fr, en, de, es, it: it_, hu, ja, ko, ro, sv, zh,
} as unknown as Record<string, Record<string, string>>;

/**
 * Fil forum 2150 (#5807) — Sevy habite en France près de Genève et veut les
 * concerts de France ET de Suisse.
 *
 * Le nuage garde UNE localisation par instance et filtre `/upcoming` avec :
 * un pays (`where country = ?`, un seul), ou un rayon autour de la commune
 * géocodée (distance orthodromique, AUCUN filtre de pays —
 * `PerimetreConcerts::appliquer`, site-mozaiklabs). Le rayon répond donc déjà
 * à la demande sans toucher au nuage. Ce qui manquait, c'est de le DIRE :
 * l'écran ne disait nulle part que le rayon franchit la frontière.
 *
 * Ce qui est gardé ici : sous « Autour de moi », la note le dit, et la
 * demande part en UN appel `{scope: 'radius'}` avec la commune française —
 * pas un appel par pays. Sous « Dans mon pays », une note renvoie vers le
 * rayon.
 */

type Appel = { url: string; method: string; body: any };
let appels: Appel[] = [];
let localisationLue: Record<string, unknown>;

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

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  localisationLue = { scope: 'country', city: 'Saint-Julien-en-Genevois', postal_code: null, country: 'FR', radius_km: 100 };
  concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
  activeView.set('concerts');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('/ext/concerts/upcoming')) {
        return reponse(200, {
          concerts: [
            { artist_name: 'A', event_date: '2026-11-02', venue: 'Arena', city: 'Genève', country: 'CH' },
            { artist_name: 'B', event_date: '2026-11-03', venue: 'Bonlieu', city: 'Annecy', country: 'FR' },
          ],
          scope: localisationLue.scope,
          country: 'FR',
        });
      }
      if (u.includes('/ext/concerts/location')) {
        if (method === 'POST') {
          const b = JSON.parse(String(init?.body));
          localisationLue = { ...localisationLue, ...b };
          return reponse(200, { scope: b.scope, city: b.city, country: b.country, radius_km: b.radius_km, located: true });
        }
        return reponse(200, localisationLue);
      }
      return reponse(200, {});
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ConcertsView as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}

describe('fil 2150 — deux pays voisins par le rayon (#5807)', () => {
  it('sous « Dans mon pays », une note renvoie vers le rayon pour les pays voisins', async () => {
    const el = await poser();
    const note = el.querySelector('.cc-pays-voisins');
    expect(note, '🔴 #5807 — « Dans mon pays » ne dit pas que le rayon couvre les pays voisins').not.toBeNull();
    expect(note?.textContent).toContain('pays voisins');
    expect(el.querySelector('.cc-sans-frontiere')).toBeNull();
  });

  it('sous « Autour de moi », la note dit que le rayon franchit la frontière, et UN appel part', async () => {
    const el = await poser();
    const autour = [...el.querySelectorAll('.cc-crans button')].find((b) =>
      (b.textContent ?? '').includes('Autour de moi'),
    ) as HTMLButtonElement;
    autour.click();
    await laisserFaire();
    const note = el.querySelector('.cc-sans-frontiere');
    expect(note, '🔴 #5807 — « Autour de moi » ne dit pas que le rayon franchit la frontière').not.toBeNull();
    expect(note?.textContent).toContain('frontières');
    expect(el.querySelector('.cc-pays-voisins')).toBeNull();

    appels = [];
    (el.querySelector('.cc-commune .cc-principal') as HTMLButtonElement).click();
    await laisserFaire();
    const posts = appels.filter((a) => a.method === 'POST' && a.url.includes('/ext/concerts/location'));
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ scope: 'radius', city: 'Saint-Julien-en-Genevois', country: 'FR' });
    // Les concerts suisses rendus par le nuage sont affichés tels quels.
    expect(el.textContent).toContain('Genève');
  });

  it('les deux notes existent dans les 11 langues', () => {
    expect(Object.keys(CATALOGUES)).toHaveLength(11);
    for (const [lg, cat] of Object.entries(CATALOGUES)) {
      expect(cat['concerts.rayonSansFrontiere'], lg).toBeTruthy();
      expect(cat['concerts.paysVoisinsNote'], lg).toBeTruthy();
    }
  });
});
