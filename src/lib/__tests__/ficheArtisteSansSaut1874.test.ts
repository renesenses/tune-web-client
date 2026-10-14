// @vitest-environment jsdom
//
// renesenses/tune-web-client#1874 — Levente Toth, fil 2103, 1.0.0-rc1 Linux,
// fiche « Bonobo » (Local 4 / YOUTUBE 10) :
//
//   « When an artist is opened, it takes 1-2 seconds to load all the info from
//   the streaming services […]. The loading and the following screen "jump"
//   as the tracks and albums are added feels distracting. Or could be also a
//   option that the last state is saved, eg. if the Local is selected, that
//   will be the default and it's not jumping back to All. »
//
// Ce qui sautait, relevé dans le code (base `c94d7651`) :
//   1. la rangée des pastilles « Source » n'existait qu'à partir de DEUX
//      provenances : elle naissait à l'arrivée des albums YouTube et poussait
//      la grille d'un cran ;
//   2. les titres phares d'un artiste LOCAL sont demandés aux services APRÈS
//      ses albums, et rendus AU-DESSUS de la discographie : toute la grille
//      descendait d'une liste de dix titres ;
//   3. le filtre « Source » repartait de « Toutes » à chaque fiche.
//
// Ces témoins montent la grille commune et la vraie page artiste, tiennent
// les réponses de YouTube en suspens, et regardent la page AVANT et APRÈS.
//
// Contre-épreuve : `DiscographieCommune.svelte`, `ArtisteServiceV2.svelte` et
// `BioEtTitresPhares.svelte` remis à `origin/main` font rougir les témoins de
// réservation et de mémoire.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import ArtisteServiceV2 from '../../components/v2/ArtisteServiceV2.svelte';
import {
  choixEffectif, CLE_SOURCE_FICHE, relireSource, serialiserSource, type Exemplaire,
} from '../discographieCommune';
import { ficheArtisteService, streamingServices } from '../stores/streaming';
import { activeView } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const al = (o: Record<string, unknown>) => o as unknown as Album;
const CLE_STOCKAGE = 'tune_v2_ecran_' + CLE_SOURCE_FICHE;

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  localStorage.clear();
  hote = document.createElement('div');
  document.body.appendChild(hote);
});
afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* hors sujet */ } monte = null; }
  hote?.remove();
  hote = null;
  localStorage.clear();
  vi.unstubAllGlobals();
});

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 5000): Promise<void> {
  const fin = Date.now() + borne;
  while (!condition()) {
    if (Date.now() > fin) return;
    await respirer();
    flushSync();
  }
}

// ── La règle, sans écran ─────────────────────────────────────────────────
describe('#1874 — le choix retenu', () => {
  it('s’écrit et se relit ; « Toutes » est un tableau vide', () => {
    expect(serialiserSource(new Set(['youtube', 'local']))).toBe('["local","youtube"]');
    expect([...relireSource('["local"]')]).toEqual(['local']);
    expect(relireSource('[]').size).toBe(0);
  });

  it('une valeur illisible vaut « Toutes », jamais une fiche vide', () => {
    for (const v of [null, '', 'local', '{"a":1}', '[1,2]', '[""]', 'pas du json']) {
      expect(relireSource(v as any).size, String(v)).toBe(0);
    }
  });

  it('🔴 un choix dont aucune pastille n’est là vaut « Toutes », sans être oublié', () => {
    expect(choixEffectif(new Set(['local']), ['youtube']).size).toBe(0);
    expect([...choixEffectif(new Set(['youtube']), ['local', 'youtube'])]).toEqual(['youtube']);
    // `upnp` venu de la Bibliothèque couvre chacun de ses serveurs.
    expect([...choixEffectif(new Set(['upnp']), ['local', 'upnp:uuid:a', 'upnp:uuid:b'])]).toEqual(['upnp:uuid:a', 'upnp:uuid:b']);
  });
});

// ── La grille commune ────────────────────────────────────────────────────
const LOCAUX = [
  al({ id: 11, title: 'Black Sands', source: 'local', year: 2010 }),
  al({ id: 12, title: 'Migration', source: 'local', year: 2017 }),
];
const YOUTUBE = [
  { service: 'youtube', artistId: 'yt-1', albums: [
    al({ source_id: 'Y-FRAGMENTS', title: 'Fragments', year: 2022 }),
    al({ source_id: 'Y-DIAL', title: 'Dial M for Monkey', year: 2003 }),
  ] },
];

function monterGrille(props: Record<string, unknown>) {
  monte = mount(DiscographieCommune as any, {
    target: hote!,
    props: {
      locaux: LOCAUX, services: [], nomArtiste: 'Bonobo',
      onOuvrir: (_ex: Exemplaire) => {}, onLire: (_ex: Exemplaire) => {},
      ...props,
    },
  });
  flushSync();
}
const pastille = (cle: string) => hote!.querySelector(`button.pill[data-pastille="${cle}"]`) as HTMLButtonElement | null;
const titres = () => Array.from(hote!.querySelectorAll('.carte .ct')).map((n) => n.textContent).sort();

describe('#1874 — la rangée « Source » est là AVANT les services', () => {
  it('🔴 une seule provenance connue, des services interrogés : la rangée est déjà rendue', () => {
    monterGrille({ servicesEnCharge: true, rangeeSources: true });
    expect(pastille('tout'), 'la rangée naîtra avec le premier service : la grille sautera').not.toBeNull();
    expect(pastille('local')).not.toBeNull();
  });

  it('sans service à interroger, une seule provenance : pas de rangée, comme avant', () => {
    monterGrille({});
    expect(pastille('tout')).toBeNull();
  });
});

describe('#1874 — le filtre « Source » est retenu d’une fiche à l’autre', () => {
  it('🔴 « Local » choisi sur une fiche reste « Local » sur la suivante', () => {
    monterGrille({ services: YOUTUBE });
    pastille('local')!.click();
    flushSync();
    expect(titres()).toEqual(['Black Sands', 'Migration']);
    expect(localStorage.getItem(CLE_STOCKAGE)).toBe('["local"]');
    unmount(monte!); monte = null;

    monterGrille({ services: YOUTUBE });
    expect(pastille('local')!.getAttribute('aria-pressed'), 'la fiche suivante repart de « Toutes »').toBe('true');
    expect(titres()).toEqual(['Black Sands', 'Migration']);
  });

  it('🔴 sous « Local », l’arrivée des albums YouTube ne change pas la grille', async () => {
    localStorage.setItem(CLE_STOCKAGE, '["local"]');
    monterGrille({ servicesEnCharge: true, rangeeSources: true });
    const avant = titres();
    unmount(monte!); monte = null;
    // Même scénario, services arrivés : la grille montrée est la même.
    monterGrille({ services: YOUTUBE, rangeeSources: true });
    expect(titres()).toEqual(avant);
    expect(pastille('youtube'), 'la pastille YouTube est offerte').not.toBeNull();
  });

  it('« Toutes » se retient aussi', () => {
    localStorage.setItem(CLE_STOCKAGE, '["local"]');
    monterGrille({ services: YOUTUBE });
    pastille('tout')!.click();
    flushSync();
    expect(localStorage.getItem(CLE_STOCKAGE)).toBe('[]');
    expect(titres()).toHaveLength(4);
  });

  it('« Local » retenu sur un artiste que la bibliothèque ne connaît pas : tout est montré', () => {
    localStorage.setItem(CLE_STOCKAGE, '["local"]');
    monterGrille({ locaux: [], services: YOUTUBE });
    expect(titres()).toEqual(['Dial M for Monkey', 'Fragments']);
  });

  it('la source posée par la Bibliothèque prime, et n’écrase pas le choix retenu', () => {
    localStorage.setItem(CLE_STOCKAGE, '["youtube"]');
    monterGrille({ services: YOUTUBE, provenance: 'local' });
    expect(titres()).toEqual(['Black Sands', 'Migration']);
    expect(localStorage.getItem(CLE_STOCKAGE)).toBe('["youtube"]');
  });
});

// ── La vraie page, YouTube en suspens ────────────────────────────────────
describe('#1874 — la page d’un artiste LOCAL tient la place des titres phares', () => {
  const ARTISTE = { id: 3, name: 'Bonobo' };
  let relacher: () => void = () => {};
  let youtubeRepond: Promise<void> = Promise.resolve();

  function corpsPour(url: string): unknown {
    if (/\/library\/artists\/3\/albums\?sections=1/.test(url)) return { albums: LOCAUX };
    if (/\/library\/artists\/3\/(bio|metadata)/.test(url)) return {};
    if (/\/library\/artists\/3\/credits/.test(url)) return [];
    if (/\/library\/artists\/3(\?|$)/.test(url)) return ARTISTE;
    if (/\/search\?/.test(url)) return { services: { youtube: { artists: [{ source_id: 'yt-1', name: 'Bonobo' }] } } };
    if (/\/streaming\/youtube\/artists\/yt-1\/albums/.test(url)) return /offset=/.test(url) ? [] : YOUTUBE[0].albums;
    if (/\/streaming\/youtube\/artists\/yt-1\/top-tracks/.test(url)) {
      return Array.from({ length: 10 }, (_, i) => ({ source_id: `t${i}`, title: `Titre ${i}`, artist_name: 'Bonobo' }));
    }
    return {};
  }

  beforeEach(() => {
    youtubeRepond = new Promise<void>((r) => { relacher = r; });
    currentZoneId.set(1);
    streamingServices.set({ youtube: { enabled: true, authenticated: true } } as any);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (/\/streaming\/youtube\/|\/search\?/.test(u)) await youtubeRepond;
      const corps = corpsPour(u);
      return {
        ok: true, status: 200, statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }));
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  });
  afterEach(() => {
    streamingServices.set({} as any);
    ficheArtisteService.set(null);
  });

  async function poserFiche() {
    ficheArtisteService.set({ service: null, id: '3', nom: 'Bonobo' });
    activeView.set('streamingartist');
    monte = mount(ArtisteServiceV2, { target: hote! });
    await jusqua(() => !!hote!.querySelector('.carte'));
  }

  it('🔴 pendant l’attente : la place des titres phares ET la rangée « Source » sont là', async () => {
    await poserFiche();
    expect(hote!.querySelectorAll('.carte').length, 'la discographie locale est rendue').toBe(2);
    expect(hote!.querySelector('[data-titres-reserves]'), 'les titres phares surgiront au-dessus de la grille').not.toBeNull();
    expect(pastille('tout'), 'la rangée naîtra avec YouTube').not.toBeNull();
    relacher();
  });

  it('à l’arrivée : les titres remplacent leur place, sans bloc de plus au-dessus de la grille', async () => {
    await poserFiche();
    const blocsAvant = hote!.querySelectorAll('section.bloc').length;
    relacher();
    await jusqua(() => !hote!.querySelector('[data-titres-reserves]') && hote!.querySelectorAll('.carte').length === 4);
    expect(hote!.querySelector('[data-titres-reserves]')).toBeNull();
    expect(hote!.querySelectorAll('section.bloc').length, 'un bloc est apparu au-dessus de la grille').toBe(blocsAvant);
    expect(hote!.querySelectorAll('.carte').length).toBe(4);
    expect(pastille('youtube')).not.toBeNull();
  });

  it('🔴 « Local » retenu : la grille ne bouge pas quand YouTube répond', async () => {
    localStorage.setItem(CLE_STOCKAGE, '["local"]');
    await poserFiche();
    expect(titres()).toEqual(['Black Sands', 'Migration']);
    relacher();
    await jusqua(() => !!pastille('youtube'));
    expect(pastille('youtube')).not.toBeNull();
    expect(titres()).toEqual(['Black Sands', 'Migration']);
    expect(pastille('local')!.getAttribute('aria-pressed')).toBe('true');
  });
});
