// @vitest-environment jsdom
//
// « JOUE AVEC » SUR LA PAGE ARTISTE — web#2794 (lot 2, PR 5, suite de #2639).
//
// Le serveur (tune-server-rust#7768, PR #8398) ajoute à
// `GET /library/artists/{id}/albums?sections=1` la clé `played_with` :
// `{ artist_id: number | null, artist_name, shared_tracks }[]`, déjà triée,
// ABSENTE quand elle est vide ou devant un serveur antérieur.
//
// Fixtures : les exemples § 6.1 et § 6.2 du contrat de la route
// (`fixtures/contratRouteArtiste2639.fixture.json`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { flushSync, mount, unmount } from 'svelte';

const ouvertures: any[] = [];
vi.mock('../ouvrirArtisteDepuis', async (orig) => ({
  ...(await orig<typeof import('../ouvrirArtisteDepuis')>()),
  ouvrirArtisteDepuis: vi.fn(async (a: any) => { ouvertures.push(a); }),
}));

import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { sectionsDepuisReponse, type AlbumsArtisteSections } from '../api';
import type { Album } from '../types';
import { locale } from '../i18n';
import CONTRAT from './fixtures/contratRouteArtiste2639.fixture.json';

vi.setConfig({ testTimeout: 30_000 });

const JAZZ = CONTRAT.jazz as unknown as AlbumsArtisteSections & Record<string, unknown>;
const CHEF = CONTRAT.chef as unknown as AlbumsArtisteSections & Record<string, unknown>;
const sansJoueAvec = (r: AlbumsArtisteSections & Record<string, unknown>) => {
  const { played_with: _p, ...reste } = r;
  return reste as AlbumsArtisteSections;
};

let hote: HTMLDivElement | null = null;
let monte: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  locale.set('fr');
  ouvertures.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

/** Ce que `ArtisteServiceV2` transmet à la grille. */
function poser(r: AlbumsArtisteSections): HTMLDivElement {
  const s = sectionsDepuisReponse(r);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(DiscographieCommune, {
    target: hote,
    props: {
      onOuvrir: () => {}, onLire: () => {},
      locaux: (s.albums ?? []) as Album[],
      ecriture: (s.writing ?? []) as Album[],
      joueAvec: s.played_with ?? [],
    } as any,
  });
  flushSync();
  return hote;
}
const lignes = (h: Element) => [...h.querySelectorAll<HTMLElement>('section[data-section="played-with"] li')];

describe('web#2794 — la réponse', () => {
  it('`played_with` passe telle quelle ; absente, elle RESTE absente', () => {
    expect(sectionsDepuisReponse(JAZZ).played_with).toEqual(JAZZ.played_with);
    expect(sectionsDepuisReponse(sansJoueAvec(JAZZ)).played_with).toBeUndefined();
    expect(sectionsDepuisReponse(JAZZ.albums).played_with).toBeUndefined();
  });
});

describe('web#2794 — le bloc « Joue avec »', () => {
  it('rendu dans l’ordre reçu, avec les pistes partagées', () => {
    const h = poser(JAZZ);
    const bloc = h.querySelector('section[data-section="played-with"]');
    expect(bloc, 'le bloc « Joue avec » manque').not.toBeNull();
    expect(bloc!.querySelector('h3')!.textContent).toContain('Joue avec');
    expect(lignes(h).map((l) => l.dataset.joueAvec)).toEqual(['Nora Vidal Quartet', 'Nora Vidal', 'Sam Okafor', 'Tomas Reyes']);
    expect(lignes(h)[0].textContent).toContain('10 titres');
  });

  it('le client ne retrie pas : un ordre inverse reste inverse', () => {
    const inverse = { ...JAZZ, played_with: [...(JAZZ.played_with as any[])].reverse() };
    const h = poser(inverse);
    expect(lignes(h).map((l) => l.dataset.joueAvec)).toEqual(['Tomas Reyes', 'Sam Okafor', 'Nora Vidal', 'Nora Vidal Quartet']);
  });

  it('chaque nom est un lien : par `artist_id` quand il existe, sinon par le nom (#2961)', () => {
    const h = poser(JAZZ);
    const [quartet, nora, sam] = lignes(h);
    expect(quartet.querySelector('[role="link"]')).not.toBeNull();
    expect(nora.querySelector('[role="link"]')).not.toBeNull();
    const lienSam = sam.querySelector<HTMLElement>('[role="link"]');
    expect(lienSam, 'un musicien sans fiche est AUSSI un lien (#2961)').not.toBeNull();
    expect(lienSam!.textContent).toBe('Sam Okafor');
    nora.querySelector<HTMLElement>('[role="link"]')!.click();
    expect(ouvertures).toHaveLength(1);
    expect(ouvertures[0]).toMatchObject({ id: 402, name: 'Nora Vidal' });
    lienSam!.click();
    expect(ouvertures).toHaveLength(2);
    expect(ouvertures[1]).toEqual({ name: 'Sam Okafor' });
  });

  it('une piste partagée : le singulier', () => {
    const h = poser(CHEF);
    const okapi = lignes(h).find((l) => l.dataset.joueAvec === 'DJ Okapi')!;
    expect(okapi.textContent).toContain('1 titre');
    expect(okapi.textContent).not.toContain('titres');
  });

  it('clé absente (serveur rc11, ou personne) : pas de bloc, aucun message', () => {
    const h = poser(sansJoueAvec(JAZZ));
    expect(h.querySelector('section[data-section="played-with"]')).toBeNull();
    expect(h.querySelector('[role="alert"]')).toBeNull();
    expect(h.querySelector('section[data-section="discographie"]')).not.toBeNull();
  });
});

describe('web#2794 — branchements', () => {
  it('la page artiste lit `played_with` sans valeur inventée et la transmet', () => {
    const art = readFileSync('src/components/v2/ArtisteServiceV2.svelte', 'utf8');
    expect(art).toContain('d.value?.played_with ?? []');
    expect(art).toContain('{joueAvec}');
  });

  it('les cinq clés existent dans les 15 langues', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of ['v2.disco.playedWith', 'v2.disco.sharedTracks', 'v2.disco.sharedTrackOne', 'v2.disco.sharedAlbums', 'v2.disco.sharedAlbumOne']) {
        const m = src.match(new RegExp(`"${c.replace(/\./g, '\\.')}": "([^"]*)"`));
        expect(m, `${l} : ${c}`).not.toBeNull();
        if (c !== 'v2.disco.playedWith') expect(m![1], `${l} : ${c} sans {n}`).toContain('{n}');
      }
    }
  });
});
