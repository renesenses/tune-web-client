// @vitest-environment jsdom
/**
 * Accueil — maquette de Levente « Home Dashboard with Album Grid » (Figma
 * 612:5808), go de Bertrand du 15/11/2026.
 *
 * Ce banc tient ce que la maquette change, et ce qu'elle ne doit PAS changer :
 *   1. le panneau « Zones » liste TOUTES les zones, actives d'abord, avec le
 *      nombre de zones actives et un bouton lecture/pause qui vise LA zone ;
 *   2. décoché, les cartes carrées reviennent (rien ne disparaît) ;
 *   3. « 2026 · Jazz » sous un album vient de l'objet, jamais d'une invention ;
 *   4. la variante visuelle est posée sur l'ACCUEIL seul.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PanneauZones from '../../components/v2/ligne1/PanneauZones.svelte';
import { zones } from '../stores/zones';
import { locale } from '../i18n';
import { nbZonesActives, zonesDuPanneau, PANNEAUX_L1, PANNEAUX_L1_LEVENTE, panneauxDeLaLigne } from '../premiereLigne';
import { detailsAlbum, versElement, WIDGETS, DISPOSITION_DEFAUT } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { concertsPlugin } from '../stores/concerts';
import type { Zone } from '../types';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const Z = (id: number, name: string, state: string, titre?: string): Zone =>
  ({
    id, name, state,
    current_track: titre ? { title: titre, artist_name: 'Nora Vale', source: 'local', track_id: id * 10 } : null,
  }) as unknown as Zone;

describe('les zones du panneau', () => {
  const liste = [Z(1, 'Salon', 'stopped'), Z(2, 'Bureau', 'playing', 'Lumen'), Z(3, 'Cuisine', 'paused', 'Solace'), { id: null, name: 'x' } as any];

  it('toutes les zones pilotables, actives en tête, ordre du serveur conservé', () => {
    expect(zonesDuPanneau(liste).map((z) => z.name)).toEqual(['Bureau', 'Cuisine', 'Salon']);
  });

  it('compte les zones qui jouent OU sont en pause', () => {
    expect(nbZonesActives(liste)).toBe(2);
    expect(nbZonesActives(null)).toBe(0);
  });

  it('« Zones » n’existe QUE dans la présentation de Levente', () => {
    expect(PANNEAUX_L1.map((p) => p.id)).toEqual(['genres', 'concerts', 'stats']);
    expect(panneauxDeLaLigne(undefined)).toEqual(['genres', 'concerts', 'stats']);
    expect(PANNEAUX_L1_LEVENTE[0].id).toBe('zones');
    expect(panneauxDeLaLigne(undefined, PANNEAUX_L1_LEVENTE)).toEqual(['zones', 'genres', 'concerts', 'stats']);
  });
});

describe('le panneau monté', () => {
  let hote: HTMLDivElement;
  let monte: ReturnType<typeof mount> | null = null;
  let appels: string[] = [];

  beforeEach(() => {
    locale.set('fr');
    appels = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://tune.test');
      if (init?.method === 'POST' || init?.method === 'PUT') appels.push(u.pathname);
      return {
        ok: true, status: 200, statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({}), text: async () => '{}',
      } as unknown as Response;
    }));
    zones.set([Z(1, 'Salon', 'stopped'), Z(2, 'Bureau', 'playing', 'Lumen'), Z(3, 'Cuisine', 'paused', 'Solace')]);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(PanneauZones, { target: hote });
    flushSync();
  });

  afterEach(async () => {
    if (monte) await unmount(monte);
    monte = null;
    hote.remove();
    zones.set([]);
    vi.unstubAllGlobals();
  });

  it('une ligne par zone, le titre et l’artiste sous le nom, la pastille des actives', () => {
    const noms = [...hote.querySelectorAll('li .nom')].map((e) => e.textContent);
    expect(noms).toEqual(['Bureau', 'Cuisine', 'Salon']);
    expect(hote.querySelector('li .sous')?.textContent).toBe('Lumen — Nora Vale');
    expect(hote.querySelector('[data-zones-actives]')?.textContent).toBe('2 actives');
    expect(hote.textContent).toContain('Gérer les zones');
  });

  it('pas de bouton lecture sur une zone sans piste — il ne saurait quoi jouer', () => {
    const lignes = [...hote.querySelectorAll('li')];
    expect(lignes[2].querySelector('.galet')).toBeNull();
    expect(lignes[0].querySelector('.galet')).not.toBeNull();
  });

  it('le bouton met en pause LA zone de sa ligne', async () => {
    hote.querySelector<HTMLButtonElement>('li .galet')!.click();
    await tick(); await new Promise((r) => setTimeout(r, 20));
    expect(appels.some((p) => /\/zones\/2\/pause$/.test(p)), appels.join(', ')).toBe(true);
    expect(appels.some((p) => /\/zones\/3\//.test(p))).toBe(false);
  });

  it('une seule zone active : « 1 active », au singulier (relecture du 15/11)', async () => {
    zones.set([Z(1, 'Salon', 'stopped'), Z(2, 'Bureau', 'playing', 'Lumen')]);
    flushSync();
    expect(hote.querySelector('[data-zones-actives]')?.textContent).toBe('1 active');
    locale.set('en');
    flushSync();
    expect(hote.querySelector('[data-zones-actives]')?.textContent).toBe('1 active');
  });

  it('aucune zone active : pas de pastille « 0 actives »', async () => {
    zones.set([Z(1, 'Salon', 'stopped')]);
    flushSync();
    expect(hote.querySelector('[data-zones-actives]')).toBeNull();
  });
});

describe('« 2026 · Jazz » sous la vignette', () => {
  it('l’année et le genre quand l’objet les porte', () => {
    expect(detailsAlbum({ year: 2026, genre: 'Jazz' })).toBe('2026 · Jazz');
    expect(detailsAlbum({ release_date: '2025-03-14', genres: [{ name: 'Ambient' }] })).toBe('2025 · Ambient');
    expect(detailsAlbum({ genres: ['Indie'] })).toBe('Indie');
  });

  it('rien d’inventé : ni zéro, ni genre vide', () => {
    expect(detailsAlbum({})).toBeNull();
    expect(detailsAlbum({ year: 0, genre: '  ' })).toBeNull();
    expect(detailsAlbum(null)).toBeNull();
  });

  it('le champ générique `date` ne donne PAS l’année — ce peut être un ajout ou une écoute', () => {
    expect(detailsAlbum({ date: '2019-05-02', genre: 'Jazz' })).toBe('Jazz');
    expect(detailsAlbum({ date: '2019-05-02' })).toBeNull();
    expect(detailsAlbum({ releaseDate: '2024-01-01' })).toBe('2024');
  });

  it('versElement le pose sur un album, pas sur une playlist', () => {
    expect(versElement({ id: 1, title: 'Lumen', year: 2026, genre: 'Indie' }, 0, 'alb').details).toBe('2026 · Indie');
    expect(versElement({ id: 1, title: 'Mix', year: 2026 }, 0, 'pl', { genre: 'playlist' }).details).toBeNull();
  });
});

describe('la variante visuelle est celle de l’ACCUEIL seul', () => {
  const src = lire('src/components/v2/PageWidgets.svelte');

  it('posée par `salut`, que seul l’accueil passe', () => {
    expect(src).toContain('class:accueil={salut}');
    expect(lire('src/components/v2/HomeV2.svelte')).toContain('<PageWidgets salut');
  });

  it('la ligne d’année et de genre ne s’affiche que sur l’accueil', () => {
    expect(src).toContain('{#if salut && el.details}');
  });

  it('décoché, le panneau « Zones » rend les cartes carrées', () => {
    const i = src.indexOf("{#if panneauxLevente.includes('zones')}");
    expect(i).toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 400);
    expect(bloc).toContain('<PanneauZones />');
    expect(bloc).toMatch(/\{:else\}[\s\S]*<CarteZoneL1 zone=\{z\} \/>/);  });
});

/**
 * Bertrand, 15/11/2026 : « garde en widget le widget de la première ligne et
 * crée-en un nouveau à partir du design de Levente ». Les deux widgets, montés
 * dans la vraie page, chacun seul.
 */
describe('deux widgets de première ligne', () => {
  let hote: HTMLDivElement;
  let monte: ReturnType<typeof mount> | null = null;
  const souffler = () => new Promise((r) => setTimeout(r, 120));

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); let corps: any = [];
      if (url.includes('/settings')) corps = {};
      else if (url.includes('/library/genres')) corps = [{ name: 'Jazz', count: 3, plays: 2 }];
      else if (url.includes('/concerts')) corps = { concerts: [] };
      else if (url.includes('/dashboard')) corps = { totals: { plays: 0 }, trend: [], hourly: [], by_zone: [], by_source: [] };
      return { ok: true, status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'application/json' }), json: async () => corps, text: async () => JSON.stringify(corps) } as Response;
    }));
    currentProfileId.set(1); locale.set('en'); concertsPlugin.set({ name: 'concerts', enabled: true } as any);
    zones.set([Z(2, 'Bureau', 'playing', 'Lumen'), Z(1, 'Salon', 'stopped')]);
  });

  afterEach(async () => {
    if (monte) await unmount(monte);
    monte = null; hote?.remove(); zones.set([]); concertsPlugin.set(null);
    vi.unstubAllGlobals();
  });

  async function ouvrir(id: string) {
    hote = document.createElement('div'); document.body.appendChild(hote);
    const w = WIDGETS.filter((x) => x.id === id);
    monte = mount(PageWidgets, { target: hote, props: { catalogue: w as any, dispositionDefaut: [id], cle: 'accueil_temoin' } });
    flushSync(); await souffler(); flushSync();
  }
  // Les titres des PANNEAUX seulement : la carte de zone a aussi son `h3`.
  const titres = () => [...hote.querySelectorAll('.l1 .panneau h3')].map((e) => e.textContent);

  it('les deux sont au catalogue de « Modifier », et le défaut garde la ligne d’origine', () => {
    const ids = WIDGETS.map((w) => w.id);
    expect(ids).toContain('premiere-ligne');
    expect(ids).toContain('premiere-ligne-levente');
    expect(DISPOSITION_DEFAUT[0]).toBe('premiere-ligne');
    expect(DISPOSITION_DEFAUT).not.toContain('premiere-ligne-levente');
    const lev = WIDGETS.find((w) => w.id === 'premiere-ligne-levente')!;
    expect(lev.cleTitre).toBe('v2.home.wFirstRowLevente');
    expect(lev.sansTitre).toBe(true);
  });

  it('la ligne d’ORIGINE est rendue comme avant : cartes, trois panneaux, largeurs fixes, pas de Zones', async () => {
    await ouvrir('premiere-ligne');
    expect(titres()).toEqual(['Genres', 'Concerts near you', 'My listening']);
    expect(hote.querySelector('.l1 .carte'), 'la carte de la zone qui joue a disparu').not.toBeNull();
    expect(hote.querySelector('[data-zones-actives]')).toBeNull();
    expect(hote.querySelector('.panneau.levente')).toBeNull();
    const genres = hote.querySelector<HTMLElement>('.l1 .panneau')!;
    expect(genres.style.width).toBe('150px');
    expect(hote.querySelector('.tuile'), 'les tuiles de Levente ont fui dans la ligne d’origine').toBeNull();
  });

  it('la NOUVELLE ligne est rendue avec Zones, tuiles et panneaux qui se partagent la largeur', async () => {
    await ouvrir('premiere-ligne-levente');
    expect(titres()).toEqual(['Zones', 'Genres', 'Concerts near you', 'My listening']);
    expect(hote.querySelector('[data-zones-actives]')?.textContent).toBe('1 active');
    expect(hote.querySelector('.l1 .carte'), 'le panneau Zones remplace les cartes').toBeNull();
    expect(hote.querySelector('.tuile')).not.toBeNull();
    const p = [...hote.querySelectorAll<HTMLElement>('.l1 .panneau')];
    expect(p.every((x) => x.classList.contains('levente'))).toBe(true);
    // Vérification du .18 à 1440 px : un panneau à largeur propre débordait
    // et était coupé. Dans la nouvelle présentation, AUCUNE largeur propre :
    // c'est la grille de la ligne qui range, sur plusieurs rangées au besoin.
    expect(p.every((x) => x.style.width === '' && x.style.minWidth === '')).toBe(true);
    expect(hote.querySelector('.l1.grille-levente')).not.toBeNull();
    const src = lire('src/components/v2/PageWidgets.svelte');
    expect(src).toMatch(/\.l1\.grille-levente\{display:grid; grid-template-columns:repeat\(auto-fill, minmax\(260px, 1fr\)\)/);
    // Les noms de genre ne sont plus coupés d'une ellipse.
    expect(lire('src/components/v2/ligne1/PanneauGenres.svelte')).toMatch(/\.tuile span \{[^}]*overflow-wrap: anywhere/);
    // Décision de Bertrand : la lecture aléatoire reste où elle est — aucun
    // bouton « Shuffle » ajouté par la nouvelle présentation.
    expect(hote.querySelector('.l1 [class*="aleatoire"], .l1 [aria-label*="huffle" i]')).toBeNull();
  });
});
