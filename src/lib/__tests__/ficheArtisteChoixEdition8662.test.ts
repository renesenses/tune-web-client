// @vitest-environment jsdom
//
// tune-server-rust#8662 — Simon, fil forum 2795 (13/11/2026, rc11) :
//
//   « When browsing an artist in Qobuz, not all versions of an album are
//     shown. e.g. Tears For Fears only shows one version of The Hurting. »
//
// Qobuz rend plusieurs éditions de « The Hurting » sous le même titre (et la
// même version) : la fusion n'en gardait qu'une par source (règle de #4652),
// les autres n'étaient atteignables nulle part.
//
// Décision de Bertrand (13/11/2026) : UNE vignette par album, et un badge
// « N éditions » qui ouvre la liste des éditions (qualité, date, nombre de
// titres, label si connu) ; chacune s'ouvre et se lit. Rien n'est perdu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { detailEdition, editionsCachees, fusionnerDiscographie, type Exemplaire } from '../discographieCommune';
import type { Album } from '../types';

vi.setConfig({ testTimeout: 30_000 });

const al = (o: Record<string, unknown>) => o as unknown as Album;

// Trois éditions Qobuz de même titre, dans l'ordre où Qobuz les rend.
const HURTING_CD = al({
  source_id: 'Q-H-CD', title: 'The Hurting', track_count: 10, year: 1983,
  released_at: 416102400, quality: { codec: 'FLAC', sample_rate: 44100, bit_depth: 16 },
});
const HURTING_HIRES = al({
  source_id: 'Q-H-HR', title: 'The Hurting', track_count: 10, year: 2013,
  quality: { codec: 'FLAC', sample_rate: 96000, bit_depth: 24 }, label: 'Mercury',
});
const HURTING_DELUXE = al({
  source_id: 'Q-H-DX', title: 'The Hurting', track_count: 33, release_date: '2013-10-07',
  quality: { codec: 'FLAC', sample_rate: 44100, bit_depth: 16 },
});
const SONGS = al({ source_id: 'Q-SONGS', title: 'Songs from the Big Chair', track_count: 8 });
const SERVICES = [{ service: 'qobuz', albums: [HURTING_CD, HURTING_HIRES, HURTING_DELUXE, SONGS] }];

describe('#8662 — la fusion garde toutes les éditions de même titre', () => {
  it('3 éditions de « The Hurting » ⇒ 1 vignette, 3 éditions', () => {
    const entrees = fusionnerDiscographie([], SERVICES);
    const hurting = entrees.filter((e) => e.principal.album.title === 'The Hurting');
    expect(hurting).toHaveLength(1);
    const [e] = hurting;
    // La règle de #4652 tient : on ouvre l'édition qui a le plus de titres.
    expect(e.principal.album.source_id).toBe('Q-H-DX');
    expect(e.exemplaires).toHaveLength(1);
    expect(e.editions.map((x) => x.album.source_id).sort()).toEqual(['Q-H-CD', 'Q-H-DX', 'Q-H-HR']);
    expect(e.editions[0]).toBe(e.principal);
    expect(editionsCachees(e)).toBe(true);
  });

  it('un album seul dans sa source n’a pas de badge, même présent ailleurs', () => {
    const entrees = fusionnerDiscographie([al({ id: 7, title: 'Songs from the Big Chair' })], SERVICES);
    const songs = entrees.find((e) => e.principal.album.title === 'Songs from the Big Chair')!;
    expect(songs.editions).toHaveLength(2);
    expect(editionsCachees(songs)).toBe(false);
  });

  it('le détail d’une édition : qualité, date, nombre de titres, label', () => {
    const d = (album: Album) => detailEdition({ source: 'qobuz', album });
    expect(d(HURTING_HIRES)).toMatchObject({ resolution: '24/96', qualite: 'hires', date: '2013', pistes: 10, label: 'Mercury' });
    expect(d(HURTING_CD)).toMatchObject({ resolution: '16/44.1', qualite: 'cd', date: '1983-03-10', pistes: 10, label: null });
    expect(d(HURTING_DELUXE)).toMatchObject({ date: '2013-10-07', pistes: 33 });
    expect(d(al({ title: 'X' }))).toMatchObject({ date: null, pistes: null, resolution: null, label: null });
  });
});

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let ouverts: Exemplaire[] = [];
let lus: Exemplaire[] = [];

function monter() {
  monte = mount(DiscographieCommune as any, {
    target: hote!,
    props: {
      locaux: [], services: SERVICES, nomArtiste: 'Tears For Fears',
      onOuvrir: (ex: Exemplaire) => { ouverts.push(ex); },
      onLire: (ex: Exemplaire) => { lus.push(ex); },
    },
  });
  flushSync();
}

const cartes = (titre: string) =>
  Array.from(hote!.querySelectorAll('.carte')).filter((c) => c.querySelector('.ct')?.textContent === titre) as HTMLElement[];

describe('#8662 — la vignette et son choix d’édition', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
    if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
    localStorage.clear();
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

  it('🔴 une carte « The Hurting », un badge « 3 », trois éditions qui s’ouvrent et se lisent', () => {
    monter();
    const liste = cartes('The Hurting');
    expect(liste).toHaveLength(1);
    const [carte] = liste;
    const badge = carte.querySelector('button.badge-editions') as HTMLButtonElement | null;
    expect(badge, 'pas de badge « N éditions »').not.toBeNull();
    expect(badge!.dataset.editions).toBe('3');
    expect(badge!.getAttribute('aria-expanded')).toBe('false');
    expect(carte.querySelector('.editions')).toBeNull();

    badge!.click();
    flushSync();
    expect(badge!.getAttribute('aria-expanded')).toBe('true');
    const panneau = carte.querySelector('.editions') as HTMLElement;
    expect(panneau).not.toBeNull();
    expect(badge!.getAttribute('aria-controls')).toBe(panneau.id);
    const editions = Array.from(panneau.querySelectorAll('li.edition')) as HTMLElement[];
    expect(editions.map((li) => li.dataset.edition).sort()).toEqual(['Q-H-CD', 'Q-H-DX', 'Q-H-HR']);

    // Chaque édition s'ouvre et se lit, avec SON exemplaire.
    const hires = editions.find((li) => li.dataset.edition === 'Q-H-HR')!;
    expect(hires.textContent).toContain('24/96');
    expect(hires.textContent).toContain('Mercury');
    (hires.querySelector('button.lire-edition') as HTMLButtonElement).click();
    flushSync();
    expect(lus.map((x) => x.album.source_id)).toEqual(['Q-H-HR']);
    for (const id of ['Q-H-CD', 'Q-H-HR']) {
      if (!carte.querySelector('.editions')) { badge!.click(); flushSync(); }
      (carte.querySelector(`li.edition[data-edition="${id}"] button.ouvrir-edition`) as HTMLButtonElement).click();
      flushSync();
    }
    expect(ouverts.map((x) => [x.source, x.album.source_id])).toEqual([['qobuz', 'Q-H-CD'], ['qobuz', 'Q-H-HR']]);
  });

  it('Échap ferme la liste et rend le focus au badge', () => {
    monter();
    const [carte] = cartes('The Hurting');
    const badge = carte.querySelector('button.badge-editions') as HTMLButtonElement;
    badge.click();
    flushSync();
    const bouton = carte.querySelector('.editions button.ouvrir-edition') as HTMLButtonElement;
    bouton.focus();
    bouton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(carte.querySelector('.editions')).toBeNull();
    expect(document.activeElement).toBe(badge);
  });

  it('contre-épreuve : un album à une seule édition n’a pas de badge', () => {
    monter();
    const [songs] = cartes('Songs from the Big Chair');
    expect(songs).toBeTruthy();
    expect(songs.querySelector('button.badge-editions')).toBeNull();
  });
});
