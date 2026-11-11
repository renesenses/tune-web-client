// @vitest-environment jsdom
//
// PAGE ARTISTE EN QUATRE SECTIONS, AVEC COMPTEURS — web#2639 (lot 2, PR 4).
//
// Le serveur (tune-server-rust#7767) ajoute à `GET /library/artists/{id}/albums?sections=1`
// deux clés : `writing` (section « Écriture et production », même forme que
// `covers`) et `credit_counts` (compteurs « interprète / écriture » de
// l'en-tête). Les deux sont ACCEPTÉES ABSENTES : devant un serveur antérieur,
// pas de section, pas de compteurs, aucune erreur.
//
// La page se lit en quatre sections : Discographie (albums, EP, singles,
// lives), « Apparaît sur » (apparitions et collaborations, compilations en
// sous-groupe), « Écriture et production » et Reprises.
//
// Les fixtures sont les deux exemples du CONTRAT DE LA ROUTE remis à Seb le
// 03/11/2026 (`fixtures/contratRouteArtiste2639.fixture.json`, recopié tel
// quel) : une contrebassiste de jazz et un chef d'orchestre.
//
// 🔴 CES TÉMOINS MONTENT la grille et l'en-tête, et CLIQUENT.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import EnTeteArtiste from '../../components/v2/EnTeteArtiste.svelte';
import { focusDeSection } from '../focusArtiste';
import { sectionsDepuisReponse, type AlbumsArtisteSections } from '../api';
import type { Album } from '../types';
import lFr from '../locales/fr';
import CONTRAT from './fixtures/contratRouteArtiste2639.fixture.json';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;
const lire = (f: string) => readFileSync(f, 'utf8');

/** Les deux réponses du contrat, telles que le serveur les rend. */
const JAZZ = CONTRAT.jazz as unknown as AlbumsArtisteSections & Record<string, unknown>;
const CHEF = CONTRAT.chef as unknown as AlbumsArtisteSections & Record<string, unknown>;

/** La réponse d'un serveur SANS le lot 2 (rc11) : mêmes clés, moins les nouvelles. */
function sansLot2(r: AlbumsArtisteSections & Record<string, unknown>) {
  const { writing: _w, credit_counts: _c, played_with: _p, ...reste } = r;
  return reste as AlbumsArtisteSections;
}

/** Ce que `ArtisteServiceV2` transmet à la grille à partir d'une réponse. */
function propsDepuis(r: AlbumsArtisteSections) {
  return {
    locaux: [...(r.albums ?? []), ...(r.live ?? [])] as Album[],
    compilations: (r.compilations ?? []) as Album[],
    apparitions: (r.appearances ?? []) as Album[],
    collaborations: r.collaborations ?? [],
    reprises: (r.covers ?? []) as Album[],
    ecriture: (r.writing ?? []) as Album[],
  };
}

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

function poserGrille(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(DiscographieCommune, { target: hote, props: { onOuvrir: () => {}, onLire: () => {}, ...props } as any });
  flushSync();
  return hote;
}

function poserEnTete(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(EnTeteArtiste, { target: hote, props: { nom: 'Ilse Brandt', onRetour: () => {}, ...props } as any });
  flushSync();
  return hote;
}

const titresDe = (racine: Element | null) =>
  [...(racine?.querySelectorAll('.ct') ?? [])].map((n) => n.textContent?.trim());
const sectionsDe = (h: Element) =>
  [...h.querySelectorAll('section.bloc[data-section]')].map((s) => s.getAttribute('data-section'));
const compteDe = (h: Element, section: string) =>
  h.querySelector(`section[data-section="${section}"] > h3 .cpt`)?.textContent;

describe('web#2639 — la réponse se lit avec ou sans les clés du lot 2', () => {
  it('`writing` et `credit_counts` passent telles quelles', () => {
    const r = sectionsDepuisReponse(JAZZ);
    expect(r.writing).toHaveLength(2);
    expect(r.writing!.map((a) => a.id)).toEqual([911, 930]);
    expect(r.credit_counts).toEqual({ performing: { albums: 5, tracks: 20 }, writing: { albums: 3, tracks: 15 } });
    // `covers` ne change pas : « Lena Park Sings » est à la fois reprise et écriture.
    expect(r.covers!.map((a) => a.id)).toEqual([930]);
  });

  it('absentes (serveur rc11), elles RESTENT absentes : ni valeur par défaut, ni repli sur `covers`', () => {
    const r = sectionsDepuisReponse(sansLot2(JAZZ));
    expect(r.writing).toBeUndefined();
    expect(r.credit_counts).toBeUndefined();
    expect(r.covers).toHaveLength(1);
    // Un tableau nu (serveur qui ignore `?sections=1`) reste une discographie sans sections.
    const nu = sectionsDepuisReponse(JAZZ.albums);
    expect(nu.albums).toHaveLength(1);
    expect(nu.writing).toBeUndefined();
    expect(nu.credit_counts).toBeUndefined();
  });
});

describe('web#2639 — la grille se lit en quatre sections', () => {
  it('musicienne de jazz : Discographie, Apparaît sur, Écriture et production, Reprises — dans cet ordre', () => {
    const h = poserGrille(propsDepuis(JAZZ));
    expect(sectionsDe(h)).toEqual(['discographie', 'appears-on', 'ecriture', 'reprises']);

    const disco = h.querySelector('section[data-section="discographie"]')!;
    expect(disco.querySelector('h3')!.textContent).toContain(fr['v2.disco.discography']);
    expect(titresDe(disco)).toEqual(['Low Tide']);
    expect(compteDe(h, 'discographie')).toBe('1');

    // « Apparaît sur » : 3 collaborations (« Avec … ») + 1 compilation en sous-groupe.
    const app = h.querySelector('section[data-section="appears-on"]')!;
    expect(app.querySelector('h3')!.textContent).toContain(fr['v2.disco.appearsOn']);
    expect(compteDe(h, 'appears-on')).toBe('4');
    const groupes = [...app.querySelectorAll('.groupe h4')].map((n) => n.textContent?.trim());
    expect(groupes).toEqual([
      fr['v2.disco.withArtist'].replace('{artist}', 'Nora Vidal Quartet'),
      fr['v2.disco.withArtist'].replace('{artist}', 'Sam Okafor'),
      `${fr['v2.disco.compilations']} 1`,
    ]);
    expect(titresDe(app.querySelector('[data-section="compilations"]'))).toEqual(['Fixture Sampler Vol. 1']);
    // Plus de section « Compilations » de premier niveau.
    expect(h.querySelector('section[data-section="compilations"]')).toBeNull();

    // « Écriture et production » : `writing`, avec les rôles d'écriture.
    const ecr = h.querySelector('section[data-section="ecriture"]')!;
    expect(ecr.querySelector('h3')!.textContent).toContain(fr['v2.disco.writing']);
    expect(titresDe(ecr)).toEqual(['Second Session', 'Lena Park Sings']);
    expect(ecr.textContent).toContain('producer');
    expect(compteDe(h, 'ecriture')).toBe('2');

    // « Reprises » : `covers`, comme avant.
    const rep = h.querySelector('section[data-section="reprises"]')!;
    expect(rep.querySelector('h3')!.textContent).toContain(fr['v2.disco.covers']);
    expect(titresDe(rep)).toEqual(['Lena Park Sings']);
  });

  it('chef d’orchestre : le live reste dans la discographie, l’apparition va sous « Apparaît sur »', () => {
    const h = poserGrille(propsDepuis(CHEF));
    expect(sectionsDe(h)).toEqual(['discographie', 'appears-on', 'ecriture']);
    const disco = h.querySelector('section[data-section="discographie"]')!;
    expect(titresDe(disco.querySelector('[data-section="live"]'))).toEqual(['Live at the Fixture Hall']);
    expect(titresDe(disco.querySelector('[data-section="albums-principaux"]'))).toEqual(['Sibelius: Symphonies 2 & 5']);
    expect(compteDe(h, 'discographie')).toBe('2');

    const app = h.querySelector('section[data-section="appears-on"]')!;
    expect(titresDe(app.querySelector('[data-section="apparitions"]'))).toEqual(['Fixture Concertos']);
    expect(compteDe(h, 'appears-on')).toBe('3');
    // Un arrangeur seul va dans « Écriture et production », pas dans « Apparaît sur ».
    expect(titresDe(app)).not.toContain('Nordic Songs');
    expect(titresDe(h.querySelector('section[data-section="ecriture"]'))).toEqual(['Nordic Songs']);
    expect(h.querySelector('section[data-section="ecriture"]')!.textContent).toContain('arranger');
    expect(h.querySelector('section[data-section="reprises"]')).toBeNull();
  });

  it('`writing` seule, sans `covers` : la section Écriture et production, et PAS de Reprises', () => {
    // Contre-épreuve : faire lire `reprises` à la section Écriture et
    // production — ce témoin rougit (section absente, titres vides).
    const h = poserGrille({ ecriture: JAZZ.writing as Album[] });
    const ecr = h.querySelector('section[data-section="ecriture"]');
    expect(ecr, 'la section « Écriture et production » n’est pas rendue').not.toBeNull();
    expect(titresDe(ecr)).toEqual(['Second Session', 'Lena Park Sings']);
    expect(h.querySelector('section[data-section="reprises"]')).toBeNull();
  });

  it('repli sans erreur devant un serveur rc11 : trois sections, pas d’Écriture et production', () => {
    const h = poserGrille(propsDepuis(sansLot2(JAZZ)));
    expect(sectionsDe(h)).toEqual(['discographie', 'appears-on', 'reprises']);
    expect(h.querySelector('section[data-section="ecriture"]')).toBeNull();
    expect(titresDe(h.querySelector('section[data-section="reprises"]'))).toEqual(['Lena Park Sings']);
  });

  it('une discographie seule (artiste de service) n’ouvre que sa section', () => {
    const h = poserGrille({ locaux: JAZZ.albums as Album[] });
    expect(sectionsDe(h)).toEqual(['discographie']);
  });

  it('ouvrir un disque d’Écriture et production dit sa section et focalise sur les pistes créditées', () => {
    const ouvertures: { album: Album; origine: unknown }[] = [];
    const h = poserGrille({
      ecriture: JAZZ.writing as Album[],
      onOuvrir: (ex: { album: Album }, origine: unknown) => ouvertures.push({ album: ex.album, origine }),
    });
    const carte = [...h.querySelectorAll('section[data-section="ecriture"] .meta')].find(
      (b) => b.querySelector('.ct')?.textContent === 'Lena Park Sings',
    ) as HTMLButtonElement;
    carte.click();
    expect(ouvertures.map((o) => o.origine)).toEqual(['ecriture']);
    expect(ouvertures[0].album.focus_track_ids).toEqual([9302, 9309]);
    // Ce que la page artiste en fait (`ArtisteServiceV2.ouvrirExemplaire`).
    expect(focusDeSection('ecriture', ouvertures[0].album, { id: 412, name: 'Ilse Brandt' })).toEqual({
      id: 412, nom: 'Ilse Brandt', pistes: [9302, 9309],
    });
    // Sans `focus_track_ids`, pas de focus du tout — comme « Reprises ».
    expect(focusDeSection('ecriture', { id: 1 }, { id: 412, name: 'Ilse Brandt' })).toBeNull();
  });
});

describe('web#2639 — les compteurs « interprète / écriture » de l’en-tête', () => {
  it('rendus depuis `credit_counts`, albums et pistes', () => {
    const h = poserEnTete({ compteurs: JAZZ.credit_counts });
    const bloc = h.querySelector('[data-compteurs]');
    expect(bloc, 'les compteurs ne sont pas rendus').not.toBeNull();
    expect(bloc!.querySelector('[data-compteur="performing"]')!.textContent).toBe(
      fr['v2.disco.performingCount'].replace('{albums}', '5').replace('{tracks}', '20'),
    );
    expect(bloc!.querySelector('[data-compteur="writing"]')!.textContent).toBe(
      fr['v2.disco.writingCount'].replace('{albums}', '3').replace('{tracks}', '15'),
    );
  });

  it('sans `credit_counts` (serveur rc11) : aucun compteur, rien n’est recalculé', () => {
    const h = poserEnTete({ compteurs: null });
    expect(h.querySelector('[data-compteurs]')).toBeNull();
  });

  it('un compteur à zéro ne s’affiche pas', () => {
    const h = poserEnTete({ compteurs: { performing: { albums: 5, tracks: 20 }, writing: { albums: 0, tracks: 0 } } });
    expect(h.querySelector('[data-compteur="performing"]')).not.toBeNull();
    expect(h.querySelector('[data-compteur="writing"]')).toBeNull();
    const rien = poserEnTete({ compteurs: { performing: { albums: 0, tracks: 0 }, writing: { albums: 0, tracks: 0 } } });
    expect(rien.querySelector('[data-compteurs]')).toBeNull();
  });
});

describe('web#2639 — les écrans sont branchés', () => {
  it('la page artiste lit `writing` et `credit_counts` et les transmet', () => {
    const art = lire('src/components/v2/ArtisteServiceV2.svelte');
    expect(art, 'la clé absente vaut section vide').toContain('d.value?.writing ?? []');
    expect(art, 'la clé absente vaut pas de compteurs').toContain('d.value?.credit_counts ?? null');
    expect(art, 'la section n’est pas transmise à la grille').toContain('{ecriture}');
    expect(art, 'les compteurs ne sont pas transmis à l’en-tête').toContain('compteurs={estLocal ? compteurs : null}');
    // 🔴 Jamais de repli sur `covers` pour la section Écriture et production.
    expect(art).not.toMatch(/ecriture\s*=\s*\(?d\.value\?\.covers/);
  });

  it('les cinq clés existent dans les 15 langues', () => {
    const CLES = [
      'v2.disco.discography',
      'v2.disco.appearsOn',
      'v2.disco.writing',
      'v2.disco.performingCount',
      'v2.disco.writingCount',
    ];
    const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl'];
    for (const l of LANGUES) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of CLES) expect(src, `${l} : ${c}`).toContain(`"${c}"`);
      for (const c of ['v2.disco.performingCount', 'v2.disco.writingCount']) {
        const m = src.match(new RegExp(`"${c.replace('.', '\\.')}": "([^"]*)"`));
        expect(m?.[1], `${l} : ${c} sans {albums}/{tracks}`).toMatch(/\{albums\}[\s\S]*\{tracks\}/);
      }
    }
  });
});
