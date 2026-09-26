// @vitest-environment jsdom
//
// renesenses/tune-server-rust#5103 (FabienM, fil 1957, v0.9.165) — volet WEB.
//
// La barre latérale range ses entrées « Streaming » depuis le magasin
// `streamingServices` (`servicesConnectes`, activé ET connecté). Ce magasin
// n'est chargé qu'UNE fois par page : `statutsStreaming` rend tel quel un
// magasin déjà rempli. Or la case « Actif » des Réglages (`basculerSvc`) ne
// mettait à jour que la variable locale `svcs` de l'écran. Décocher YouTube
// laissait donc YouTube dans la barre — et dans la recherche v2, qui lit le
// même magasin — jusqu'au rechargement de la page.
//
// 🔴 Ce témoin MONTE l'écran Réglages et DÉCOCHE la case, avec un `fetch`
// simulé qui répond comme le serveur. Il regarde le magasin, pas le texte du
// composant.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { streamingServices } from '../stores/streaming';
import { servicesConnectes } from '../ongletsStreaming';
import { servicesInterrogeables } from '../albumsArtisteStreaming';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

/** L'état du serveur, que `POST …/disable` modifie comme le vrai. */
let serveur: Record<string, { enabled: boolean; authenticated: boolean; username: string | null }>;

const fetchSimule = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
  const url = String(entree);
  const methode = (init?.method ?? 'GET').toUpperCase();
  const m = url.match(/\/streaming\/([^/]+)\/(enable|disable)$/);
  if (m && methode === 'POST') {
    serveur[m[1]] = { ...serveur[m[1]], enabled: m[2] === 'enable' };
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/streaming/services')) {
    return new Response(JSON.stringify(serveur), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', fetchSimule);
  fetchSimule.mockClear();
  serveur = {
    qobuz: { enabled: true, authenticated: true, username: 'fabien' },
    youtube: { enabled: true, authenticated: true, username: 'fabien@x' },
  };
  // Le magasin tel que la barre latérale l'a chargé au démarrage de la page.
  streamingServices.set(structuredClone(serveur));
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  streamingServices.set({});
  vi.unstubAllGlobals();
});

describe('#5103 — la case « Actif » met le magasin des services à jour', () => {
  it('🔴 décocher YouTube le retire de la barre latérale sans recharger la page', async () => {
    // Témoin de départ : YouTube est dans la barre.
    expect(servicesConnectes(get(streamingServices))).toContain('youtube');

    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    flushSync();
    await attendre();
    const onglet = [...hote.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === fr['settings.tabAccess'],
    );
    expect(onglet, 'onglet Accès introuvable').toBeDefined();
    (onglet as HTMLButtonElement).click();
    await attendre();

    const rangee = [...hote.querySelectorAll('.svclist > *')].find((r) =>
      (r.querySelector('.sname')?.textContent ?? '').trim().toLowerCase().startsWith('youtube'),
    );
    expect(rangee, 'rangée YouTube introuvable dans les Réglages').toBeDefined();
    const caseActif = rangee!.querySelector<HTMLInputElement>('label.svcon input[type="checkbox"]');
    expect(caseActif, 'case Actif introuvable').toBeTruthy();
    expect(caseActif!.checked).toBe(true);

    caseActif!.checked = false;
    caseActif!.dispatchEvent(new Event('change', { bubbles: true }));
    await attendre(10);

    // Le serveur a bien reçu le geste…
    expect(serveur.youtube.enabled).toBe(false);
    // …et le magasin, que lisent la barre et la recherche, le sait aussi.
    const magasin = get(streamingServices);
    expect(magasin.youtube?.enabled, 'le magasin garde YouTube actif').toBe(false);
    expect(servicesConnectes(magasin), 'YouTube est resté dans la barre latérale').not.toContain('youtube');
    expect(servicesInterrogeables(magasin), 'la recherche interrogerait encore YouTube').not.toContain('youtube');
    // Contre-épreuve : Qobuz, intact, reste partout.
    expect(servicesConnectes(magasin)).toContain('qobuz');
  });
});

describe('#5103 — `servicesInterrogeables` : activé ET connecté', () => {
  it('🔴 un service connecté mais désactivé n’est plus interrogé', () => {
    expect(
      servicesInterrogeables({
        qobuz: { enabled: true, authenticated: true } as never,
        youtube: { enabled: false, authenticated: true } as never,
        tidal: { enabled: true, authenticated: false } as never,
      }),
    ).toEqual(['qobuz']);
  });
});
