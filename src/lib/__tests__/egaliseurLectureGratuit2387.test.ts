// @vitest-environment jsdom
//
// web#2387 — l'égaliseur de l'écran de lecture se verrouillait dès que
// l'application croyait le serveur en offre gratuite (`$isPremium` faux), alors
// que l'égaliseur est GRATUIT côté serveur (`check_feature` accorde toujours
// `Feature::DspEq`). Un abonné dont le serveur n'avait pas pu revalider sa
// licence voyait le cadenas. Ce qui ferme vraiment l'écriture est le greffon
// absent : `409 plugin_unavailable`.
//
// Le témoin monte le VRAI `NowPlaying`, licence chargée en palier gratuit,
// ouvre le panneau EQ, et constate : pas de cadenas, préréglages cliquables ;
// puis un 409 du serveur fait dire « greffon non installé » avec le lien vers
// les Extensions.
//
// Contre-épreuve : sur `origin/main`, le cadenas « Premium » est affiché et
// les préréglages sont désactivés dès le montage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { licenseState } from '../stores/license';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

const PISTE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'Video Games', artist_name: 'Lana Del Rey', album_title: 'Born To Die',
  source: 'local', duration_ms: 281000,
};

let refusGreffon = false;
let ecrituresEq = 0;
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function reponse(url: string, methode: string): Response {
  if (/\/zones\/1\/eq(\?|$)/.test(url) && methode === 'POST') {
    ecrituresEq++;
    if (refusGreffon) {
      const corps = { error: 'plugin_unavailable', plugin: 'equalizer', message: 'Extension indisponible' };
      return {
        ok: false, status: 409, statusText: 'Conflict',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps, text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }
  }
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/zones\/1\/eq(\?|$)/.test(url)) corps = methode === 'POST' ? { applied_live: true } : { enabled: true, bands: [] };
  if (/\/queue/.test(url)) corps = { tracks: [], position: 0, length: 0 };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 80) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  locale.set('fr');
  refusGreffon = false;
  ecrituresEq = 0;
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, options?: RequestInit) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    return reponse(url, String(options?.method ?? 'GET').toUpperCase());
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  // Licence CHARGÉE, palier gratuit : le cas de l'abonné non revalidé.
  licenseState.update((s) => ({ ...s, loaded: true, tier: 'free' }));
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 }] as never);
  currentZoneId.set(1);
  activeView.set('nowplaying');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  licenseState.update((s) => ({ ...s, loaded: false, tier: 'free' }));
  vi.unstubAllGlobals();
});

async function ouvrirPanneauEq(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as never }) as Record<string, unknown>;
  flushSync();
  await respirer();
  const bouton = [...hote.querySelectorAll<HTMLButtonElement>('.np-credits-btn')]
    .find((b) => (b.textContent ?? '').trim() === 'EQ');
  expect(bouton, 'bouton du panneau EQ absent — témoin sans objet').toBeTruthy();
  bouton!.click();
  flushSync();
  await respirer();
  expect(hote.querySelector('.np-eq'), 'panneau EQ non ouvert').not.toBeNull();
  return hote;
}

describe('web#2387 — l’égaliseur de l’écran de lecture ne dépend pas de l’abonnement', () => {
  it('🔴 palier gratuit : pas de cadenas, préréglages cliquables', async () => {
    const h = await ouvrirPanneauEq();
    expect(h.querySelector('.eq-premium-notice'), 'cadenas « Premium » sur un égaliseur gratuit (#2387)').toBeNull();
    const prereglages = [...h.querySelectorAll<HTMLButtonElement>('.eq-preset')];
    expect(prereglages.length).toBeGreaterThan(0);
    expect(prereglages.every((b) => !b.disabled), 'préréglages désactivés hors abonnement').toBe(true);
    prereglages[1].click();
    await respirer();
    expect(ecrituresEq, 'le préréglage n’est pas parti au serveur').toBe(1);
  });

  it('🔴 greffon absent (409 plugin_unavailable) : le panneau le dit et mène aux Extensions', async () => {
    refusGreffon = true;
    const h = await ouvrirPanneauEq();
    h.querySelectorAll<HTMLButtonElement>('.eq-preset')[1].click();
    await respirer();
    flushSync();
    const avis = h.querySelector('[data-testid="eq-greffon-absent"]');
    expect(avis, 'le refus du greffon ne se dit pas').not.toBeNull();
    expect(avis!.textContent).toContain('greffon facultatif');
    expect(h.querySelector('.eq-premium-notice'), 'un greffon absent n’est pas un refus d’offre').toBeNull();
    avis!.querySelector<HTMLButtonElement>('button')!.click();
    flushSync();
    expect(get(activeView)).toBe('plugins');
  });
});
