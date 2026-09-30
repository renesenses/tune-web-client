// @vitest-environment jsdom
//
// Bertrand, réunion avec Yves Corbat du 30/09/2026, v0.9.168 :
//
//   « Dans la fiche artiste, si on choisit Qobuz comme source des albums puis
//     qu'on clique sur un album, c'est l'album LOCAL qui s'ouvre, pas celui
//     de Qobuz. »
//
// Cause : la pastille « Qobuz » garde une vignette dès qu'UN exemplaire vient
// de Qobuz (`dansProvenances`), mais la vignette ouvrait toujours son
// `principal` — le premier de `ORDRE_SOURCES`, donc la BIBLIOTHÈQUE quand
// l'album est aussi rangé en local.
//
// Le composant réel est monté, le geste est rejoué (pastille puis clic sur
// l'album), et on lit l'exemplaire remis à `onOuvrir` — celui qu'`ArtisteServiceV2`
// ouvre (`ouvrirExemplaire` : `serviceOuvert = ex.source`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { fusionnerDiscographie, recentrerSurProvenances, type Exemplaire } from '../discographieCommune';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const al = (o: Record<string, unknown>) => o as unknown as Album;

// « Harvest » est en local ET sur Qobuz ; « Zuma » n'est que sur Qobuz ;
// « Démo » n'est qu'en local.
const LOCAUX = [
  al({ id: 11, title: 'Harvest', source: 'local', year: 1972 }),
  al({ id: 12, title: 'Démo', source: 'local', year: 1970 }),
];
const SERVICES = [
  { service: 'qobuz', albums: [
    al({ source_id: 'Q-HARVEST', title: 'Harvest', year: 1972 }),
    al({ source_id: 'Q-ZUMA', title: 'Zuma', year: 1975 }),
  ] },
];

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let ouverts: Exemplaire[] = [];
let lus: Exemplaire[] = [];

function monter(provenance: string | null = null) {
  monte = mount(DiscographieCommune as any, {
    target: hote!,
    props: {
      locaux: LOCAUX, services: SERVICES, nomArtiste: 'Neil Young', provenance,
      onOuvrir: (ex: Exemplaire) => { ouverts.push(ex); },
      onLire: (ex: Exemplaire) => { lus.push(ex); },
    },
  });
  flushSync();
}

const carte = (titre: string) =>
  Array.from(hote!.querySelectorAll('.carte')).find((c) => c.querySelector('.ct')?.textContent === titre) as HTMLElement | undefined;
const pastille = (cle: string) => hote!.querySelector(`button.pill[data-pastille="${cle}"]`) as HTMLButtonElement | null;
const titres = () => Array.from(hote!.querySelectorAll('.carte .ct')).map((n) => n.textContent).sort();

describe('fiche artiste, source Qobuz : le clic ouvre l’album Qobuz', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
    if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
    ouverts = [];
    lus = [];
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    if (monte) { try { unmount(monte); } catch { /* hors sujet */ } monte = null; }
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  it('🔴 pastille Qobuz, puis clic sur « Harvest » (local + Qobuz) : c’est l’exemplaire Qobuz qui s’ouvre', () => {
    monter();
    const q = pastille('qobuz');
    expect(q, 'la pastille Qobuz n’est pas rendue : le décor est faux').not.toBeNull();
    q!.click();
    flushSync();
    expect(titres()).toEqual(['Harvest', 'Zuma']);

    (carte('Harvest')!.querySelector('button.meta') as HTMLButtonElement).click();
    (carte('Harvest')!.querySelector('button.ouvrir') as HTMLButtonElement).click();
    flushSync();
    expect(ouverts.map((e) => [e.source, e.album.source_id ?? e.album.id])).toEqual([
      ['qobuz', 'Q-HARVEST'],
      ['qobuz', 'Q-HARVEST'],
    ]);
  });

  it('🔴 même chose quand Qobuz arrive coché depuis la grille de la Bibliothèque', () => {
    monter('qobuz');
    (carte('Harvest')!.querySelector('button.meta') as HTMLButtonElement).click();
    flushSync();
    expect(ouverts.map((e) => e.source)).toEqual(['qobuz']);
    expect(ouverts[0].album.source_id).toBe('Q-HARVEST');
  });

  it('contre-épreuve : sans filtre, ou sous « Local », « Harvest » ouvre toujours la copie LOCALE', () => {
    monter();
    (carte('Harvest')!.querySelector('button.meta') as HTMLButtonElement).click();
    pastille('local')!.click();
    flushSync();
    expect(titres()).toEqual(['Démo', 'Harvest']);
    (carte('Harvest')!.querySelector('button.meta') as HTMLButtonElement).click();
    flushSync();
    expect(ouverts.map((e) => [e.source, e.album.id])).toEqual([['local', 11], ['local', 11]]);
  });

  it('local ET Qobuz cochés : la bibliothèque garde la main (règle 3)', () => {
    monter();
    pastille('qobuz')!.click();
    pastille('local')!.click();
    flushSync();
    (carte('Harvest')!.querySelector('button.meta') as HTMLButtonElement).click();
    (carte('Zuma')!.querySelector('button.meta') as HTMLButtonElement).click();
    flushSync();
    expect(ouverts.map((e) => e.source)).toEqual(['local', 'qobuz']);
  });

  it('la règle : entrée non modifiée en place, principal inchangé si rien ne le justifie', () => {
    const [harvest] = fusionnerDiscographie(LOCAUX, SERVICES).filter((e) => e.principal.album.title === 'Harvest');
    expect(harvest.principal.source).toBe('local');
    const recentree = recentrerSurProvenances(harvest, new Set(['qobuz']));
    expect(recentree.principal.source).toBe('qobuz');
    expect(harvest.principal.source, 'l’entrée fusionnée a été mutée').toBe('local');
    expect(recentrerSurProvenances(harvest, new Set())).toBe(harvest);
    expect(recentrerSurProvenances(harvest, new Set(['local']))).toBe(harvest);
    expect(recentrerSurProvenances(harvest, new Set(['tidal']))).toBe(harvest);
  });
});
