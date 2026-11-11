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
import { estTronque, lireClassements } from '../classementsBibliotheque';
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
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } })));
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
    expect(lignes).toEqual(['Johann Sebastian Bach 20 244 pistes', 'Antonio Vivaldi 3 120 pistes']);
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
