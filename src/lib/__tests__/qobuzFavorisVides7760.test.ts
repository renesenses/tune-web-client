// @vitest-environment jsdom
//
// renesenses/tune-server-rust#7760 — Streaming › Qobuz › Editorial, compte
// SANS aucun favori : « Favourite albums » et « My playlists » affichaient
// « This widget could not be loaded. (delai) ».
//
// La cause du délai est côté serveur (lecture de Qobuz qui tardait à se
// replier). Ces témoins gardent ce que le client doit en faire, avec les VRAIS
// widgets du catalogue Qobuz et un faux serveur :
// - un compte vide (réponse rapide, listes vides) montre l'état vide ;
// - un serveur qui ne répond pas montre la phrase traduite, jamais le code
//   interne `delai`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { catalogueService, cleService } from '../widgetsService';
import { currentProfileId } from '../stores/profile';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const WIDGETS = ['qobuz-albums-favoris', 'qobuz-mes-playlists'];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
/** Le faux Qobuz ne répond jamais aux listes du compte. */
let compteMuet = false;

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function reponse(corps: unknown): Response {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

beforeEach(() => {
  compteMuet = false;
  locale.set('en');
  currentProfileId.set(1);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // Les formes que rend le serveur pour un compte Qobuz sans favoris.
    if (/\/streaming\/qobuz\/favorites\/albums/.test(url)) {
      if (compteMuet) return new Promise<Response>(() => {});
      return reponse({ albums: [] });
    }
    if (/\/streaming\/qobuz\/playlists(\?|$)/.test(url)) {
      if (compteMuet) return new Promise<Response>(() => {});
      return reponse([]);
    }
    if (/\/profiles\/1\/settings/.test(url)) return reponse({});
    return reponse([]);
  }));
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function poserLesWidgetsQobuz() {
  const catalogue = (await catalogueService('qobuz')).filter((w) => WIDGETS.includes(w.id));
  expect(catalogue.map((w) => w.id), 'prémisse : les deux widgets du compte existent').toEqual(WIDGETS);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue, dispositionDefaut: WIDGETS, cle: cleService('qobuz') },
  });
  flushSync();
  return hote;
}

describe('#7760 — widgets « Favourite albums » et « My playlists » d’un compte Qobuz sans favoris', () => {
  it('🔴 un compte vide montre l’état vide, pas une erreur', async () => {
    const page = await poserLesWidgetsQobuz();
    await souffler(150);
    flushSync();
    expect(
      page.querySelectorAll('[data-widget-echec]').length,
      `un compte sans favoris est affiché en échec : « ${page.textContent} »`,
    ).toBe(0);
    const vides = [...page.querySelectorAll('.state.mince')].map((e) => e.textContent?.trim());
    expect(vides, 'chacun des deux widgets doit dire qu’il est vide').toEqual([
      'Nothing to show here yet.',
      'Nothing to show here yet.',
    ]);
  });

  it('🔴 un serveur qui ne répond pas : phrase traduite, jamais le code « delai »', async () => {
    compteMuet = true;
    const page = await poserLesWidgetsQobuz();
    // Le widget abandonne au bout de 8 s (`DELAI_MS`).
    await souffler(8_600);
    flushSync();
    const echecs = [...page.querySelectorAll('[data-widget-echec]')].map((e) => e.textContent?.trim() ?? '');
    expect(echecs.length, 'les deux widgets doivent dire qu’ils n’ont pas pu charger').toBe(2);
    for (const texte of echecs) {
      expect(texte, `le code interne s’affiche brut : « ${texte} »`).not.toMatch(/\bdelai\b/);
      expect(texte).toBe('This widget could not be loaded. (no response in time)');
    }
  });
});
