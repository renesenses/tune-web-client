// @vitest-environment jsdom
//
// web#3032 — PAGE ARTISTE : LES ALBUMS EN SECTIONS PAR TYPE, REPLIABLES.
//
// Bertrand, recette du 14/11/2026, page Miles Davis : « beaucoup d'albums, il
// faudrait faciliter la navigation ». Au-delà de `SEUIL_SECTIONS_PAR_TYPE`
// vignettes, la discographie se range en Albums studio / Live / Compilations /
// Bandes originales / EP / Singles / Autres, chacune repliable et comptée ;
// « Apparaît sur » se replie aussi. En dessous, la grille d'avant, telle quelle.
//
// 🔴 CES TÉMOINS MONTENT la grille et CLIQUENT.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import {
  fusionnerDiscographie, rangerParType, SEUIL_SECTIONS_PAR_TYPE, titreAnnonceUneBandeOriginale,
} from '../discographieCommune';
import type { Album } from '../types';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });

const fr = lFr as unknown as Record<string, string>;

const album = (id: number, title: string, year: number, extra: Partial<Album> = {}): Album =>
  ({ id, title, year, source: 'local', ...extra }) as Album;

/** Une discographie à la Miles Davis : 17 vignettes, de tous les types — une sans type. */
const MILES: Album[] = [
  album(1, 'Kind of Blue', 1959, { release_type: 'album' }),
  album(2, 'Bitches Brew', 1970, { release_type: 'album' }),
  album(3, 'Birth of the Cool', 1957, { release_type: 'album' }),
  album(4, 'Sketches of Spain', 1960, { inferred_release_type: 'album' }),
  album(5, 'Miles Smiles', 1967, { release_type: 'album' }),
  album(6, 'In a Silent Way', 1969, { release_type: 'album' }),
  album(7, 'Live at the Plugged Nickel', 1965, { release_type: 'album', release_secondary_types: ['live'] }),
  album(8, 'Agharta', 1975, { release_type: 'album', release_secondary_types: ['live'] }),
  album(9, 'The Very Best of Miles Davis', 2006, { is_compilation: true }),
  album(10, 'Love Songs', 1999, { release_type: 'album', release_secondary_types: ['compilation'] }),
  album(11, "Ascenseur pour l'échafaud", 1958, { release_type: 'album', release_secondary_types: ['soundtrack'] }),
  album(12, 'Siesta (Original Motion Picture Soundtrack)', 1987),
  album(13, 'Jean Pierre', 1982, { release_type: 'ep' }),
  album(14, 'Tutu', 1986, { release_type: 'album' }),
  album(15, 'Bootleg Box', 2000, { release_type: 'broadcast' }),
  album(16, 'Rarities', 1992, { release_type: 'other' }),
  album(17, 'Round About Midnight', 1957),
];

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  try { localStorage.clear(); } catch { /* sans stockage */ }
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

const titresDe = (racine: Element, section: string) =>
  [...racine.querySelectorAll(`[data-section="${section}"] .ct`)].map((n) => n.textContent?.trim());
const compteDe = (racine: Element, section: string) =>
  racine.querySelector(`[data-section="${section}"] .titre-connexes .cpt`)?.textContent?.trim();

describe('web#3032 — beaucoup d’albums : des sections par type', () => {
  it('le seuil est de 12 vignettes', () => {
    expect(SEUIL_SECTIONS_PAR_TYPE).toBe(12);
    expect(MILES.length).toBeGreaterThan(SEUIL_SECTIONS_PAR_TYPE);
  });

  it('chaque vignette va dans UNE section, dans l’ordre de la page, avec son compte', () => {
    const racine = poserGrille({ locaux: MILES });
    const ordre = [...racine.querySelectorAll('[data-section="discographie"] > section[data-section]')]
      .map((n) => n.getAttribute('data-section'));
    // Live en premier, dans les deux modes (Bertrand, 14/11/2026).
    expect(ordre).toEqual(['live', 'albums-studio', 'compilations-artiste', 'bandes-originales', 'eps', 'autres']);
    expect(compteDe(racine, 'albums-studio')).toBe('8');
    expect(compteDe(racine, 'live')).toBe('2');
    expect(compteDe(racine, 'compilations-artiste')).toBe('2');
    expect(compteDe(racine, 'bandes-originales')).toBe('2');
    expect(compteDe(racine, 'eps')).toBe('1');
    expect(compteDe(racine, 'autres')).toBe('2');
    // Une section vide n'est pas rendue.
    expect(racine.querySelector('[data-section="singles"]')).toBeNull();
    // Les libellés de la page.
    const titre = (s: string) => racine.querySelector(`[data-section="${s}"] .replier`)?.textContent ?? '';
    expect(titre('albums-studio')).toContain(fr['v2.disco.studioAlbums']);
    expect(titre('bandes-originales')).toContain(fr['v2.disco.soundtracks']);
    expect(titre('autres')).toContain(fr['v2.disco.otherReleases']);
  });

  it('l’ordre chronologique (tri par défaut) vaut dans chaque section', () => {
    const racine = poserGrille({ locaux: MILES });
    expect(titresDe(racine, 'albums-studio')).toEqual([
      'Birth of the Cool', 'Round About Midnight', 'Kind of Blue', 'Sketches of Spain', 'Miles Smiles', 'In a Silent Way', 'Bitches Brew', 'Tutu',
    ]);
    expect(titresDe(racine, 'live')).toEqual(['Live at the Plugged Nickel', 'Agharta']);
    expect(titresDe(racine, 'bandes-originales')).toEqual(["Ascenseur pour l'échafaud", 'Siesta (Original Motion Picture Soundtrack)']);
  });

  it('« Autres » ne garde que les types explicites other/broadcast ; sans type, l’album reste un album', () => {
    const racine = poserGrille({ locaux: MILES });
    expect(titresDe(racine, 'autres')).toEqual(['Rarities', 'Bootleg Box']);
    expect(titresDe(racine, 'albums-studio')).toContain('Round About Midnight');
  });

  it('fiche de SERVICE sans types (> 12 albums) : pas de sections, la grille d’avant', () => {
    const sansType = MILES.map((a) => ({ id: null, source_id: `dz${a.id}`, title: a.title, year: a.year, artist_name: 'Miles Davis' }) as unknown as Album);
    const racine = poserGrille({ services: [{ service: 'deezer', albums: sansType }], nomArtiste: 'Miles Davis' });
    expect(racine.querySelectorAll('[data-section="discographie"] .ct').length).toBeGreaterThan(SEUIL_SECTIONS_PAR_TYPE);
    expect(racine.querySelector('[data-section="autres"]')).toBeNull();
    expect(racine.querySelector('.replier')).toBeNull();
  });

  it('fiche bibliothèque : un album présent seulement chez un service, sans type, va sous « Albums studio »', () => {
    const racine = poserGrille({
      locaux: MILES,
      services: [{ service: 'deezer', albums: [{ id: null, source_id: 'dz1', title: 'Water Babies', year: 1976, artist_name: 'Miles Davis' } as unknown as Album] }],
      nomArtiste: 'Miles Davis',
    });
    expect(titresDe(racine, 'albums-studio')).toContain('Water Babies');
    expect(titresDe(racine, 'autres')).not.toContain('Water Babies');
  });

  it('le seuil ne compte que la bibliothèque : 12 albums locaux et des services ne basculent pas', () => {
    const douze = MILES.filter((a) => ![7, 8, 13].includes(a.id!)).slice(0, 12);
    const services = [{ service: 'deezer', albums: ['A', 'B', 'C'].map((t, i) => ({ id: null, source_id: `x${i}`, title: t, year: 1990, artist_name: 'Miles Davis' }) as unknown as Album) }];
    const racine = poserGrille({ locaux: douze, services, nomArtiste: 'Miles Davis' });
    expect(racine.querySelectorAll('[data-section="discographie"] .ct')).toHaveLength(15);
    expect(racine.querySelector('.replier')).toBeNull();
  });

  it('une section se replie et se rouvre ; le choix est retenu à la fiche suivante', () => {
    let racine = poserGrille({ locaux: MILES });
    const bouton = () => racine.querySelector<HTMLButtonElement>('[data-section="live"] .replier')!;
    expect(bouton().getAttribute('aria-expanded')).toBe('true');
    bouton().click();
    flushSync();
    expect(bouton().getAttribute('aria-expanded')).toBe('false');
    expect(racine.querySelector('[data-section="live"] .gr')).toBeNull();
    // Repliée, la section ne vise pas un identifiant absent.
    expect(bouton().hasAttribute('aria-controls')).toBe(false);
    expect(compteDe(racine, 'live')).toBe('2');
    // Les autres sections restent ouvertes.
    expect(titresDe(racine, 'albums-studio')).toHaveLength(8);

    // Une autre fiche : « Live » reste replié.
    unmount(monte!);
    hote!.remove();
    racine = poserGrille({ locaux: MILES });
    expect(bouton().getAttribute('aria-expanded')).toBe('false');
    bouton().click();
    flushSync();
    expect(titresDe(racine, 'live')).toHaveLength(2);
  });

  it('« Apparaît sur » se replie aussi', () => {
    const racine = poserGrille({
      locaux: MILES,
      apparitions: [album(100, 'Somethin’ Else', 1958, { artist_name: 'Cannonball Adderley' })],
    });
    const bloc = racine.querySelector('[data-section="appears-on"]')!;
    const bouton = bloc.querySelector<HTMLButtonElement>('.replier')!;
    expect(bloc.querySelectorAll('.ct')).toHaveLength(1);
    bouton.click();
    flushSync();
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    expect(bloc.querySelectorAll('.ct')).toHaveLength(0);
    expect(bloc.querySelector('.titre-section .cpt')?.textContent?.trim()).toBe('1');
  });
});

describe('web#3032 — peu d’albums : la grille d’avant', () => {
  it('12 vignettes ou moins, sans EP ni live : une grille plate, sans section ni bouton', () => {
    const peu = MILES.filter((a) => ![7, 8, 13].includes(a.id!)).slice(0, 12);
    const racine = poserGrille({ locaux: peu });
    expect(racine.querySelectorAll('[data-section="discographie"] .ct')).toHaveLength(12);
    expect(racine.querySelector('[data-section="discographie"] > section')).toBeNull();
    expect(racine.querySelector('.replier')).toBeNull();
  });

  it('peu d’albums avec un live : les sous-sections d’avant, non repliables', () => {
    const racine = poserGrille({ locaux: MILES.slice(0, 8) });
    expect(racine.querySelector('[data-section="albums-principaux"]')).not.toBeNull();
    expect(racine.querySelector('[data-section="live"]')).not.toBeNull();
    expect(racine.querySelector('[data-section="albums-studio"]')).toBeNull();
    expect(racine.querySelector('.replier')).toBeNull();
  });
});

describe('web#3032 — les règles de rangement', () => {
  it('bande originale par le titre : des expressions entières, jamais « soundtrack » seul', () => {
    expect(titreAnnonceUneBandeOriginale('Siesta (Original Motion Picture Soundtrack)')).toBe(true);
    expect(titreAnnonceUneBandeOriginale('Ascenseur pour l’échafaud (Bande originale du film)')).toBe(true);
    expect(titreAnnonceUneBandeOriginale('Dingo (Original Motion Picture Score)')).toBe(true);
    expect(titreAnnonceUneBandeOriginale('Soundtrack to My Life')).toBe(false);
    // 10cc, 1975 : un album studio.
    expect(titreAnnonceUneBandeOriginale('The Original Soundtrack')).toBe(false);
    expect(titreAnnonceUneBandeOriginale('The Original Quintet')).toBe(false);
  });

  it('un type secondaire explicite n’est jamais contredit par le titre', () => {
    const [e] = fusionnerDiscographie([album(1, 'Jack Johnson (Original Motion Picture Soundtrack)', 1971, { release_secondary_types: ['remix'] })], []);
    expect(rangerParType([e]).studio).toHaveLength(1);
  });

  it('un live reste un live, même compilation ou bande originale', () => {
    const [e] = fusionnerDiscographie([album(1, 'At Newport', 1958, { is_compilation: true, release_secondary_types: ['live', 'soundtrack'] })], []);
    expect(rangerParType([e]).live).toHaveLength(1);
  });
});
