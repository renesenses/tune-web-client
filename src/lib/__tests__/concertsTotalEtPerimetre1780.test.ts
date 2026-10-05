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
 * renesenses/tune-web-client#1780 — suite de tune-server-rust#5369 et #5368
 * (Lulu, fil forum 2023, 0.9.167).
 *
 * Le serveur (lot `batch/fix-5369-20260929`) rend désormais :
 *   GET  /ext/concerts/upcoming[?offset=]  → { …, total, limit, offset, has_more, applied_scope, located }
 *   POST /ext/concerts/location            → { …, located, ambiguous }
 *
 * Ce qui est gardé : « N sur total » et le bouton « Plus » qui demande la page
 * suivante ; « Autour de moi » et le kilométrage NON actifs quand la commune
 * n'est pas localisée, avec la raison ; la demande du code postal quand la
 * commune est ambiguë ; et, contre-épreuve, un serveur ancien (champs absents)
 * qui laisse l'écran tel qu'avant.
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

describe('Concerts — la liste dit combien il y en a, et donne la suite (#5369)', () => {
  it('« 2 sur 3 », puis « Plus » demande la page suivante et l’ajoute', async () => {
    upcoming = (offset) =>
      offset === 0
        ? { concerts: [concert(1), concert(2)], total: 3, limit: 2, offset: 0, has_more: true, scope: 'country', applied_scope: 'country', country: 'FR' }
        : { concerts: [concert(3)], total: 3, limit: 2, offset: 2, has_more: false, scope: 'country', applied_scope: 'country', country: 'FR' };

    const el = await poser();
    expect(texte(el)).toContain(nSurTotal(2, 3));
    expect(lignes(el)).toBe(2);

    bouton(el, fr['concerts.plus'])!.click();
    await laisserFaire();

    expect(lectures().at(-1)!.url).toContain('/ext/concerts/upcoming?offset=2');
    expect(lignes(el)).toBe(3);
    expect(texte(el)).toContain(nSurTotal(3, 3));
    expect(bouton(el, fr['concerts.plus']), 'plus rien à voir : plus de bouton').toBeUndefined();
  });

  it('contre-épreuve : un serveur ancien (ni total ni has_more) n’affiche ni compte ni « Plus »', async () => {
    const el = await poser();
    expect(lignes(el)).toBe(2);
    expect(el.querySelector('.cc-compte')).toBeNull();
    expect(bouton(el, fr['concerts.plus'])).toBeUndefined();
    // Et il ne redemande jamais de page : il ignorerait `offset`.
    expect(lectures().every((a) => !a.url.includes('offset='))).toBe(true);
  });
});

describe('Concerts — un rayon qui ne s’applique pas n’est pas affiché actif (#5368)', () => {
  it('commune non localisée : « Autour de moi » et le kilométrage ne sont pas actifs, et l’écran dit pourquoi', async () => {
    upcoming = () => ({
      concerts: [concert(1)], total: 1, has_more: false,
      scope: 'radius', applied_scope: 'country', located: false, radius_km: 100, city: '31700', country: 'FR',
    });
    localisationLue = { scope: 'radius', city: '31700', postal_code: null, country: 'FR', radius_km: 100 };

    const el = await poser();

    expect(bouton(el, fr['concerts.autourDeMoi'])!.classList.contains('actif')).toBe(false);
    expect(bouton(el, fr['concerts.dansMonPays'])!.classList.contains('actif')).toBe(true);
    expect(el.querySelector('.cc-commune select')!.classList.contains('cc-inactif')).toBe(true);
    expect(texte(el.querySelector('.cc-introuvable') as HTMLElement)).toContain(fr['concerts.communeIntrouvable']);
    expect(texte(el.querySelector('.cc-rayon-inactif') as HTMLElement)).toContain(fr['concerts.rayonInactif']);
    // Le formulaire reste ouvert : c'est là qu'on corrige la commune.
    expect(el.querySelector('.cc-commune')).not.toBeNull();
  });

  it('contre-épreuve : commune localisée, « Autour de moi » est actif et rien n’est signalé', async () => {
    upcoming = () => ({
      concerts: [concert(1)], total: 1, has_more: false,
      scope: 'radius', applied_scope: 'radius', located: true, radius_km: 100, city: 'Beauzelle', country: 'FR',
    });
    localisationLue = { scope: 'radius', city: 'Beauzelle', postal_code: '31700', country: 'FR', radius_km: 100, located: true };

    const el = await poser();

    expect(bouton(el, fr['concerts.autourDeMoi'])!.classList.contains('actif')).toBe(true);
    expect(el.querySelector('.cc-commune select')!.classList.contains('cc-inactif')).toBe(false);
    expect(el.querySelector('.cc-introuvable')).toBeNull();
    expect(el.querySelector('.cc-rayon-inactif')).toBeNull();
  });

  it('commune ambiguë : l’écran demande le code postal', async () => {
    upcoming = () => ({ concerts: [concert(1)], scope: 'radius', applied_scope: 'radius', located: true, radius_km: 100, city: 'Valence', country: 'FR' });
    localisationLue = { scope: 'radius', city: 'Valence', postal_code: null, country: 'FR', radius_km: 100, located: true, ambiguous: true };

    const el = await poser();

    expect(texte(el)).toContain(fr['concerts.communeAmbigue']);
    expect(el.querySelector('.cc-cp')!.getAttribute('aria-invalid')).toBe('true');

    // Le code postal saisi et appliqué : le nuage tranche, l'avertissement part.
    retenuPost = { ambiguous: false };
    const cp = el.querySelector('.cc-cp') as HTMLInputElement;
    cp.value = '26000';
    cp.dispatchEvent(new Event('input'));
    bouton(el, fr['concerts.appliquer'])!.click();
    await laisserFaire();

    expect(texte(el)).not.toContain(fr['concerts.communeAmbigue']);
  });
});
