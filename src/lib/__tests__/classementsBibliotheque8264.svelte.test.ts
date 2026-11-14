// @vitest-environment jsdom
//
// tune-server-rust#8264 (demande #7781) — jfpaquet, fils 2634 et 2733 :
// « combien de titres de Jean-Sébastien Bach ? combien de titres du genre
// concertos pour violon ? ». L'écran Statistiques de la bibliothèque montait
// quatre répartitions (formats, fréquences, décennies, rôles) et aucune carte
// par artiste ni par genre : la réponse n'y était pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import StatsBibliothequeV2 from '../../components/v2/StatsBibliothequeV2.svelte';
import { estTronque, filtrerLocalement, lireClassements, lireRecherche } from '../classementsBibliotheque';
import { ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';

vi.mock('../ouvrirArtisteDepuis', () => ({ ouvrirArtisteDepuis: vi.fn(async () => {}) }));
import { locale } from '../i18n';

const espaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]+/g, ' ').trim();

const DISTRIBUTIONS = {
  by_codec: [{ value: 'flac', tracks: 9 }],
  by_sample_rate: [{ value: 44100, tracks: 9 }],
  by_decade: [{ value: 1990, tracks: 9 }],
  by_credit_role: [],
};
const RANKINGS = {
  by_artist: { items: [{ value: 'Johann Sebastian Bach', tracks: 20244 }, { value: 'Antonio Vivaldi', tracks: 3120 }], total: 6812 },
  by_genre: { items: [{ value: 'Baroque', tracks: 30500 }, { value: 'Violin Concerto', tracks: 1416 }], total: 2 },
};
let stats: unknown;
/** Réponse de `/library/stats/rankings` ; `null` : route absente (404). */
let rankingsRoute: ((url: URL) => unknown) | null = null;
const appels: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

async function attendre() {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function monter(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(StatsBibliothequeV2, { target: hote, props: {} });
  await attendre();
  return hote;
}

beforeEach(() => {
  locale.set('fr');
  appels.length = 0;
  rankingsRoute = null;
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
    const url = new URL(String(entree), 'http://tune.local');
    appels.push(url.pathname + url.search);
    if (url.pathname.endsWith('/library/stats/rankings')) {
      if (!rankingsRoute) return new Response('{"error":"not found"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(rankingsRoute(url)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#8264 — Statistiques : artistes et genres par nombre de pistes', () => {
  it('🔴 les cartes Artistes et Genres répondent « combien de titres de Bach / de concertos pour violon »', async () => {
    stats = { tracks: 742923, albums: 42151, artists: 6812, distributions: DISTRIBUTIONS, rankings: RANKINGS };
    const el = await monter();
    const artistes = el.querySelector('[data-classement="by_artist"]');
    const genres = el.querySelector('[data-classement="by_genre"]');
    expect(artistes, 'carte Artistes absente').not.toBeNull();
    expect(genres, 'carte Genres absente').not.toBeNull();
    expect(espaces(artistes!.querySelector('h2')?.textContent)).toBe('Artistes, par nombre de pistes');
    const lignes = [...artistes!.querySelectorAll('li')].map((li) => espaces(li.textContent));
    // Go du 13/11 — chaque ligne commence par son rang.
    expect(lignes).toEqual(['1 Johann Sebastian Bach 20 244 pistes', '2 Antonio Vivaldi 3 120 pistes']);
    expect(espaces(genres!.textContent)).toContain('Violin Concerto 1 416 pistes');
    // Classement tronqué par le serveur : l'écran le dit ; complet : il se tait.
    expect(espaces(artistes!.querySelector('.aide')?.textContent)).toBe('Les 2 premiers sur 6 812');
    expect(genres!.querySelector('.aide')).toBeNull();
  });

  it('serveur plus ancien (sans `rankings`) : les quatre répartitions seules, sans erreur', async () => {
    stats = { tracks: 9, albums: 1, artists: 1, distributions: DISTRIBUTIONS };
    const el = await monter();
    expect(el.querySelectorAll('[data-repartition]').length).toBe(4);
    expect(el.querySelector('[data-classement]')).toBeNull();
  });

  it('lecture : un classement à null ou mal formé est écarté, le total ne descend jamais sous la liste', () => {
    expect(lireClassements({})).toBeNull();
    expect(lireClassements({ rankings: { by_artist: null, by_genre: null } })).toBeNull();
    const c = lireClassements({ rankings: { by_artist: { items: [{ value: 'A', tracks: 3 }, { value: '', tracks: 1 }, null], total: 1 }, by_genre: 'oups' } })!;
    expect(c.by_artist).toEqual({ items: [{ value: 'A', tracks: 3 }], total: 1 });
    expect(c.by_genre).toBeNull();
    expect(estTronque(c.by_artist!)).toBe(false);
  });
});

async function taper(el: HTMLElement, cle: string, texte: string) {
  const champ = el.querySelector<HTMLInputElement>(`[data-recherche-classement="${cle}"]`);
  expect(champ, `champ de recherche ${cle} absent`).not.toBeNull();
  champ!.value = texte;
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  await attendre();
}

describe('Go du 13/11 — chercher dans TOUT le classement des statistiques', () => {
  it('🔴 un artiste au-delà des cent premiers se trouve, avec son rang et son nombre de pistes', async () => {
    stats = { tracks: 742923, albums: 42151, artists: 2957, distributions: DISTRIBUTIONS, rankings: RANKINGS };
    rankingsRoute = (url) => ({
      by: url.searchParams.get('by'),
      items: [{ rank: 151, value: 'Antonín Dvořák', tracks: 12 }],
      matched: 1,
      total: 2957,
    });
    const el = await monter();
    const carte = el.querySelector('[data-classement="by_artist"]')!;
    expect((carte.querySelector('[data-recherche-classement]') as HTMLInputElement).placeholder).toBe('Chercher un artiste');
    await taper(el, 'by_artist', 'dvorak');
    expect(appels.some((a) => a.includes('/library/stats/rankings?by=artist&q=dvorak'))).toBe(true);
    const lignes = [...carte.querySelectorAll('li')].map((li) => espaces(li.textContent));
    expect(lignes).toEqual(['151 Antonín Dvořák 12 pistes']);
    expect(espaces(carte.querySelector('[data-resultats]')?.textContent)).toBe('1 résultat sur 2 957');
    // Le bandeau « Les N premiers » cède la place au compte des résultats.
    expect(espaces(carte.textContent)).not.toContain('premiers sur');
    // Effacer la recherche rend le classement.
    await taper(el, 'by_artist', '');
    expect([...carte.querySelectorAll('li')].length).toBe(2);
  });

  it('un clic sur un nom ouvre la page de l’artiste, ou le genre dans la Bibliothèque', async () => {
    stats = { tracks: 9, albums: 1, artists: 2, distributions: DISTRIBUTIONS, rankings: RANKINGS };
    const el = await monter();
    (el.querySelector('[data-classement="by_artist"] [data-ouvrir]') as HTMLButtonElement).click();
    await attendre();
    expect(ouvrirArtisteDepuis).toHaveBeenCalledWith({ name: 'Johann Sebastian Bach' }, 'library');
    const recus: unknown[] = [];
    const ecoute = (e: Event) => recus.push((e as CustomEvent).detail);
    window.addEventListener('tune:v2-facette', ecoute);
    try {
      const boutons = el.querySelectorAll<HTMLButtonElement>('[data-classement="by_genre"] [data-ouvrir]');
      boutons[1].click();
      await attendre();
    } finally {
      window.removeEventListener('tune:v2-facette', ecoute);
    }
    expect(recus).toEqual([{ onglet: 'genres', valeur: 'Violin Concerto' }]);
  });

  it('serveur plus ancien (route absente) : la recherche se replie sur les premiers, et le dit', async () => {
    stats = { tracks: 9, albums: 1, artists: 6812, distributions: DISTRIBUTIONS, rankings: RANKINGS };
    const el = await monter();
    await taper(el, 'by_artist', 'VIVALDI');
    const carte = el.querySelector('[data-classement="by_artist"]')!;
    expect([...carte.querySelectorAll('li')].map((li) => espaces(li.textContent))).toEqual(['2 Antonio Vivaldi 3 120 pistes']);
    expect(carte.querySelector('[data-recherche-locale]')).not.toBeNull();
    await taper(el, 'by_artist', 'zzz');
    expect(espaces(carte.querySelector('.etat')?.textContent)).toBe('Aucun résultat.');
  });

  it('lecture de la réponse de recherche, et repli local sans accents ni casse', () => {
    expect(lireRecherche(null)).toBeNull();
    expect(lireRecherche({ items: 'x' })).toBeNull();
    expect(lireRecherche({ items: [{ rank: 3, value: 'A', tracks: 2 }, { rank: 0, value: 'B', tracks: 1 }, { value: '' }], matched: 0, total: 1 }))
      .toEqual({ items: [{ rank: 3, value: 'A', tracks: 2 }], matched: 1, total: 1 });
    const c = { items: [{ value: 'Bach', tracks: 9 }, { value: 'Dvořák', tracks: 3 }], total: 50 };
    expect(filtrerLocalement(c, ' DVORAK ')).toEqual({ items: [{ value: 'Dvořák', tracks: 3, rank: 2 }], matched: 1, total: 50 });
  });
});
