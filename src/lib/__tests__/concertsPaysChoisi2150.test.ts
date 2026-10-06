// @vitest-environment jsdom
//
// jsdom : sans `window`, `onMount` ne se déclenche pas et l'écran ne lirait
// jamais `/ext/concerts/*` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ConcertsView from '../../components/v2-heritage/ConcertsView.svelte';
import { preparerLocale } from '../i18n';
import { activeView } from '../stores/navigation';
import { concertsPlugin } from '../stores/concerts';
import { notifications } from '../stores/notifications';
import fr from '../locales/fr';

/**
 * Fil forum 2150 (Tune 1.0.0-rc2, macOS) — « la recherche de concerts ne prend
 * pas en compte une ville en Suisse ».
 *
 * L'écran n'avait aucun champ pays : il envoyait `country: 'FR'` quoi qu'on
 * fasse. Une commune suisse partait au géocodeur du nuage avec `FR`, et
 * « Dans mon pays » filtrait la France. Ce qui est gardé ici : le pays se
 * choisit, il part tel quel dans `POST /location` (rayon comme pays), le pays
 * enregistré pré-remplit le sélecteur, et les noms viennent de
 * `Intl.DisplayNames` (aucune table de noms dans le client).
 */

const concert = (i: number) => ({
  artist_name: `Artiste ${i}`,
  event_date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
  venue: `Salle ${i}`,
  city: `Ville ${i}`,
  country: 'FR',
});

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
/** Le corps rendu par `upcoming`, selon l'`offset` demandé. */
let upcoming: (offset: number) => Record<string, unknown>;
let localisationLue: Record<string, unknown>;
let retenuPost: Record<string, unknown>;

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
  for (const n of get(notifications)) notifications.dismiss(n.id);
  upcoming = () => ({ concerts: [concert(1), concert(2)], scope: 'country', country: 'FR' });
  localisationLue = { scope: 'country', city: 'Dijon', postal_code: null, country: 'FR', radius_km: 100 };
  retenuPost = {};
  concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
  activeView.set('concerts');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      appels.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('/ext/concerts/upcoming')) {
        const offset = Number(new URL(u, 'http://x').searchParams.get('offset') ?? 0);
        return reponse(200, upcoming(offset));
      }
      if (u.includes('/ext/concerts/location')) {
        if (method === 'POST') {
          const b = JSON.parse(String(init?.body));
          return reponse(200, { scope: b.scope, city: b.city, country: b.country, radius_km: b.radius_km, located: true, ...retenuPost });
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

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');
const bouton = (el: HTMLElement, libelle: string) =>
  [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === libelle) as HTMLButtonElement | undefined;
const lectures = () => appels.filter((a) => a.url.includes('/ext/concerts/upcoming'));
const lignes = (el: HTMLElement) => el.querySelectorAll('.cc-dates li').length;
const nSurTotal = (n: number, total: number) =>
  fr['concerts.nSurTotal'].replace('{n}', String(n)).replace('{total}', String(total));

const selecteurPays = (el: HTMLElement) =>
  el.querySelector('.cc-pays select') as HTMLSelectElement | null;
const posts = () => appels.filter((a) => a.url.includes('/ext/concerts/location') && a.method === 'POST');

async function choisirPays(el: HTMLElement, code: string) {
  const s = selecteurPays(el)!;
  s.value = code;
  s.dispatchEvent(new Event('change', { bubbles: true }));
  await laisserFaire();
}

describe('Concerts — le pays se choisit (fil 2150)', () => {
  it('« Dans mon pays » : choisir la Suisse envoie CH au nuage, aussitôt', async () => {
    const el = await poser();
    const s = selecteurPays(el);
    expect(s, 'un sélecteur de pays est offert sous « Dans mon pays »').not.toBeNull();
    expect(s!.value).toBe('FR');
    const options = [...s!.options].map((o) => o.value);
    expect(options).toContain('CH');

    await choisirPays(el, 'CH');
    expect(posts().length, 'changer le pays sous « Dans mon pays » enregistre la localisation').toBe(1);
    expect(posts()[0].body).toMatchObject({ scope: 'country', country: 'CH' });
  });

  it('« Autour de moi » : la commune part avec le pays choisi, pas FR', async () => {
    const el = await poser();
    bouton(el, fr['concerts.autourDeMoi'])!.click();
    await laisserFaire();
    await choisirPays(el, 'CH');
    expect(posts().length, 'sous le rayon, le pays attend « Appliquer »').toBe(0);

    const commune = el.querySelector('.cc-commune input') as HTMLInputElement;
    commune.value = 'Lausanne';
    commune.dispatchEvent(new Event('input', { bubbles: true }));
    await laisserFaire();
    bouton(el, fr['concerts.appliquer'])!.click();
    await laisserFaire();

    expect(posts().length).toBe(1);
    expect(posts()[0].body).toMatchObject({ scope: 'radius', city: 'Lausanne', country: 'CH' });
  });

  it('le pays enregistré pré-remplit le sélecteur, nommé dans la langue de l’écran', async () => {
    localisationLue = { scope: 'country', city: '—', postal_code: null, country: 'ch', radius_km: 100 };
    upcoming = () => ({ concerts: [concert(1)], scope: 'country' });
    const el = await poser();
    const s = selecteurPays(el)!;
    expect(s.value).toBe('CH');
    expect(s.selectedOptions[0].textContent?.trim()).toBe(
      new Intl.DisplayNames(['fr'], { type: 'region' }).of('CH'),
    );
  });

  it('un pays enregistré hors de la liste reste proposé', async () => {
    localisationLue = { scope: 'country', city: '—', postal_code: null, country: 'AR', radius_km: 100 };
    upcoming = () => ({ concerts: [concert(1)], scope: 'country' });
    const el = await poser();
    expect(selecteurPays(el)!.value).toBe('AR');
  });

  it('« Partout » ne demande pas de pays', async () => {
    const el = await poser();
    upcoming = () => ({ concerts: [concert(1)], scope: 'world' });
    bouton(el, fr['concerts.partout'])!.click();
    await laisserFaire();
    expect(selecteurPays(el)).toBeNull();
  });
});
