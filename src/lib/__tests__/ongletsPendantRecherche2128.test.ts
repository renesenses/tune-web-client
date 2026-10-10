// @vitest-environment jsdom
/**
 * Fil forum 2128 (Didier, 03/10/2026) — « Streaming et filtrage pas
 * opérationnel » : après une recherche (« Roxy Music »), les choix Éditorial,
 * Playlists, Favoris, Genres « ne sont plus actifs ». Sa capture montre
 * l'onglet Favoris EN GRAS au-dessus d'une grille de résultats Qobuz.
 *
 * Cause : la zone de contenu affiche les résultats avant de regarder le
 * sous-onglet ; le clic changeait `sub` sans rien de visible, et l'onglet
 * restait allumé.
 *
 * Correctif du 03/10 : un clic sur un sous-onglet sortait de la recherche en
 * VIDANT le champ. Remplacé le 09/10 (#2030, décision de Bertrand pour la
 * rc4) : la saisie est GARDÉE et s'applique au nouvel onglet. Ce qui reste
 * acquis de 2128 : le clic ouvre bien l'onglet, les résultats du catalogue ne
 * le masquent plus, et l'onglet allumé est celui dont on voit le contenu —
 * Éditorial, puisque ses résultats sont la recherche dans le catalogue.
 * Le comportement de #2030 lui-même est tenu par
 * `rechercheGardeeEntreOnglets2030.test.ts`.
 *
 * Témoin COMPORTEMENTAL : vrai écran monté, `fetch` simulé, on tape, on clique.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

const SERVICES = { qobuz: { enabled: true, authenticated: true, username: 'Didier' } } as any;
const RESULTATS = {
  albums: [{ id: 'a1', title: 'Avalon', artist: 'Roxy Music' }],
  artists: [], tracks: [], playlists: [], has_more: false,
};

function reponse(corps: unknown) {
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

async function laisserTourner(n = 40) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
const sousOnglets = () => Array.from(hote!.querySelectorAll('nav.subs > button')) as HTMLButtonElement[];
const sousOngletAllume = () => hote!.querySelector('nav.subs > button.on')?.textContent?.trim() ?? null;
const avalonAffiche = () => (hote!.textContent ?? '').includes('Avalon');
const champ = () => hote!.querySelector('header input') as HTMLInputElement | null;

async function monterEtChercher() {
  monte = mount(StreamingV2 as any, { target: hote! });
  for (let i = 0; i < 60 && !sousOnglets().length; i++) await laisserTourner(1);
  expect(sousOnglets().length, 'aucun sous-onglet rendu').toBeGreaterThan(1);
  const input = champ();
  expect(input, 'le champ de recherche du service a disparu').not.toBeNull();
  input!.value = 'Roxy Music';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await new Promise((r) => setTimeout(r, 320));
  await laisserTourner(20);
  expect(avalonAffiche(), 'les résultats de recherche ne sont pas affichés').toBe(true);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension non chargée');
    if (/\/streaming\/services/.test(u)) return reponse(SERVICES);
    if (/\/streaming\/qobuz\/search/.test(u)) return reponse(RESULTATS);
    if (/\/config/.test(u)) return reponse({});
    return reponse([]);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('streaming');
});

afterEach(() => {
  try { if (monte) unmount(monte); } catch { /* hors sujet */ }
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fil 2128 — les sous-onglets pendant une recherche', () => {
  it('au-dessus des résultats du catalogue, seul Éditorial est allumé', async () => {
    await monterEtChercher();
    expect(sousOngletAllume(), 'l’onglet allumé ne décrit pas les résultats affichés')
      .toBe(sousOnglets()[0].textContent?.trim());
  });

  it('un clic sur un sous-onglet ouvre l’onglet sans effacer la saisie (#2030)', async () => {
    await monterEtChercher();
    const cible = sousOnglets().at(-1)!;
    const libelle = cible.textContent?.trim();
    cible.click();
    flushSync();
    await laisserTourner(10);
    expect(avalonAffiche(), 'les résultats masquent toujours l’onglet cliqué').toBe(false);
    expect(champ()!.value, 'la saisie a été effacée (#2030)').toBe('Roxy Music');
    expect(sousOngletAllume()).toBe(libelle);
  });

  it('témoin : sans recherche, l’onglet par défaut est allumé', async () => {
    monte = mount(StreamingV2 as any, { target: hote! });
    for (let i = 0; i < 60 && !sousOnglets().length; i++) await laisserTourner(1);
    expect(sousOngletAllume()).toBe(sousOnglets()[0].textContent?.trim());
  });
});
