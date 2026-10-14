// @vitest-environment jsdom
//
// web#1755 (fil 2028) — « Concerts ne m'a pas demandé où j'habitais à quelle
// distance j'acceptais d'aller ». L'écran DEMANDE désormais la commune et le
// rayon quand ni ce profil ni le serveur n'en ont une, et retient la réponse
// PAR PROFIL (préférences synchronisées). Sans réponse (« Pas maintenant »),
// il garde le comportement d'avant : pays ou Partout.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ConcertsView from '../../components/v2-heritage/ConcertsView.svelte';
import { preparerLocale } from '../i18n';
import { activeView } from '../stores/navigation';
import { concertsPlugin } from '../stores/concerts';
import { preferences } from '../stores/preferences';
import { lieuDejaApplique, normaliserLieuConcerts } from '../concertsLieu';
import fr from '../locales/fr';

const concert = (i: number) => ({
  artist_name: `Artiste ${i}`, event_date: `2026-11-0${i}`, venue: `Salle ${i}`, city: `Ville ${i}`, country: 'FR',
});

type Appel = { url: string; method: string; body: any };
let appels: Appel[] = [];
let localisationLue: Record<string, unknown>;

function reponse(status: number, corps: unknown): Response {
  return { ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
}

const SANS_COMMUNE = { scope: 'world', city: '', postal_code: null, country: '', radius_km: 100, code: 'concerts.no_location' };

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  localisationLue = { ...SANS_COMMUNE };
  preferences.update((p) => ({ ...p, concertsLieu: null }));
  concertsPlugin.set({ name: 'concerts', installed: true, enabled: true });
  activeView.set('concerts');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, body });
    if (u.includes('/ext/concerts/upcoming')) return reponse(200, { concerts: [concert(1), concert(2)], scope: localisationLue.scope, country: 'FR' });
    if (u.includes('/ext/concerts/location')) {
      if (method === 'POST') {
        localisationLue = { ...body, located: true };
        return reponse(200, { ...body, located: true });
      }
      return reponse(200, localisationLue);
    }
    return reponse(200, {});
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  preferences.update((p) => ({ ...p, concertsLieu: null }));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() { for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); } }
async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ConcertsView as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}
const bouton = (el: HTMLElement, libelle: string) =>
  [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === libelle) as HTMLButtonElement | undefined;
const concertsAppels = () => appels.filter((a) => a.url.includes('/ext/concerts/'));
const posts = () => appels.filter((a) => a.url.includes('/ext/concerts/location') && a.method === 'POST');
const lieu = () => get(preferences).concertsLieu;
function saisir(champ: HTMLInputElement | HTMLSelectElement, v: string) {
  champ.value = v;
  champ.dispatchEvent(new Event(champ instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

describe('web#1755 — l’écran demande où l’on habite', () => {
  it('sans commune nulle part : la question est posée, et la liste d’avant se charge quand même', async () => {
    const el = await poser();
    const q = el.querySelector('.cc-question');
    expect(q, 'aucune question posée').not.toBeNull();
    expect(q!.textContent).toContain(fr['concerts.questionLieu']);
    expect(q!.querySelector('input[aria-label="' + fr['concerts.commune'] + '"]')).not.toBeNull();
    expect(q!.querySelector('select[aria-label="' + fr['concerts.rayon'] + '"]')).not.toBeNull();
    expect(appels.some((a) => a.url.includes('/ext/concerts/upcoming')), 'la liste ne se charge plus').toBe(true);
    // La localisation est lue AVANT la recherche (fil 2028 : la commune n'était relue qu'après).
    const ordre = concertsAppels().map((a) => (a.url.includes('location') ? 'location' : 'upcoming'));
    expect(ordre.slice(0, 2)).toEqual(['location', 'upcoming']);
  });

  it('« Appliquer » enregistre commune et rayon, et les retient pour ce profil', async () => {
    const el = await poser();
    const q = el.querySelector('.cc-question')!;
    saisir(q.querySelector('input[aria-label="' + fr['concerts.commune'] + '"]') as HTMLInputElement, 'Dijon');
    saisir(q.querySelector('select[aria-label="' + fr['concerts.rayon'] + '"]') as HTMLSelectElement, '50');
    await laisserFaire();
    bouton(q as HTMLElement, fr['concerts.appliquer'])!.click();
    await laisserFaire();
    expect(posts().length).toBe(1);
    expect(posts()[0].body).toMatchObject({ scope: 'radius', city: 'Dijon', radius_km: 50, country: 'FR' });
    expect(lieu()).toMatchObject({ scope: 'radius', city: 'Dijon', radius_km: 50, country: 'FR' });
    expect(el.querySelector('.cc-question'), 'la question reste posée').toBeNull();
  });

  it('« Pas maintenant » garde le comportement d’avant, sans rien envoyer, et ne redemande pas', async () => {
    let el = await poser();
    bouton(el, fr['concerts.pasMaintenant'])!.click();
    await laisserFaire();
    expect(posts().length).toBe(0);
    expect(el.querySelector('.cc-question')).toBeNull();
    // L'écran d'avant : rien d'enregistré, « Partout » (`concerts.no_location`).
    expect(bouton(el, fr['concerts.partout'])?.classList.contains('actif')).toBe(true);
    expect(lieu()).toBe('plus-tard');
    unmount(monte!); monte = null; hote!.remove();
    el = await poser();
    expect(el.querySelector('.cc-question'), 'la question revient à chaque ouverture').toBeNull();
    expect(posts().length).toBe(0);
  });

  it('une commune déjà enregistrée sur le serveur est reprise, sans question', async () => {
    localisationLue = { scope: 'radius', city: 'Dijon', postal_code: '21000', country: 'FR', radius_km: 100, located: true };
    const el = await poser();
    expect(el.querySelector('.cc-question')).toBeNull();
    expect(posts().length).toBe(0);
    expect(lieu()).toMatchObject({ scope: 'radius', city: 'Dijon', postal_code: '21000', radius_km: 100 });
  });
});

describe('web#1755 — retenu PAR PROFIL', () => {
  it('le serveur garde le lieu d’un autre profil : celui-ci est rejoué avant la recherche', async () => {
    preferences.update((p) => ({ ...p, concertsLieu: { scope: 'radius', city: 'Lyon', postal_code: null, country: 'FR', radius_km: 200 } }));
    localisationLue = { scope: 'radius', city: 'Dijon', postal_code: null, country: 'FR', radius_km: 50, located: true };
    const el = await poser();
    expect(posts().length).toBe(1);
    expect(posts()[0].body).toMatchObject({ scope: 'radius', city: 'Lyon', radius_km: 200 });
    const ordre = concertsAppels().map((a) => `${a.method} ${a.url.includes('location') ? 'location' : 'upcoming'}`);
    expect(ordre).toEqual(['GET location', 'POST location', 'GET upcoming']);
    expect((el.querySelector('.cc-commune input') as HTMLInputElement).value).toBe('Lyon');
    expect(el.querySelector('.cc-question')).toBeNull();
  });

  it('le serveur applique déjà ce profil : rien n’est renvoyé', async () => {
    preferences.update((p) => ({ ...p, concertsLieu: { scope: 'radius', city: 'Dijon', postal_code: null, country: 'FR', radius_km: 50 } }));
    localisationLue = { scope: 'radius', city: 'Dijon', postal_code: null, country: 'FR', radius_km: 50, located: true };
    await poser();
    expect(posts().length).toBe(0);
  });

  it('normalisation et comparaison', () => {
    expect(normaliserLieuConcerts(null)).toBeNull();
    expect(normaliserLieuConcerts({ scope: 'radius', city: '  ' }), 'un rayon sans commune n’est pas un choix').toBeNull();
    expect(normaliserLieuConcerts({ scope: 'galaxy', city: 'X' })).toBeNull();
    expect(normaliserLieuConcerts({ scope: 'country', city: '', country: 'ch', radius_km: 75 }))
      .toEqual({ scope: 'country', city: '', postal_code: null, country: 'CH', radius_km: 100 });
    const p = normaliserLieuConcerts({ scope: 'country', city: '', country: 'FR', radius_km: 100 })!;
    expect(lieuDejaApplique(p, { scope: 'country', city: '—', country: 'fr', radius_km: 50 })).toBe(true);
    expect(lieuDejaApplique(p, { scope: 'country', country: 'CH' })).toBe(false);
    expect(lieuDejaApplique(p, { scope: 'world' })).toBe(false);
  });
});
