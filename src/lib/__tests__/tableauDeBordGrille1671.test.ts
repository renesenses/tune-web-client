// @vitest-environment jsdom
//
// tune-web-client#1671 — Levente Toth (designer des maquettes), fil 1994,
// 0.9.166 Linux, écran de ~2 560 px :
//
//   « Dashboard in previous versions was organized better, seems something
//     happened with the padding / layout and looks like a stretched mobile /
//     table view. »
//
// LA CAUSE : la réécriture du 25/09 (5aa7b565) a monté le Tableau de bord sur
// `PageWidgets`, qui EMPILE ses widgets dans `.scroll`, chacun en pleine
// largeur. Pour des bandes qui défilent, c'est voulu ; pour onze blocs, cela
// donne la capture : une grille 7 × 24 aux cases de 70 px, des barres de
// 1 600 px. Décision de Bertrand : suivre les maquettes de Levente — carré de
// 315 px, « tout sur la grille » (PR web#1656).
//
// Et la Tendance sans aucune barre : chaque barre porte sa valeur en `height:%`
// d'une rangée dont la hauteur n'était jamais DÉFINIE (`flex:1` sous un
// parent à simple `min-height`) — un pourcentage d'une hauteur indéfinie vaut
// `auto`, donc zéro pour un `<div>` vide.
//
// CE TÉMOIN NE LIT PAS LE SOURCE. Il monte le VRAI écran (`TableauDeBordV2`),
// pose dans le document les feuilles COMPILÉES par Svelte (portée comprise,
// comme en production — procédé de #1344), et lit le style CALCULÉ.
//
// 🔴 CONTRE-ÉPREUVE : la même `PageWidgets` montée SANS `grille` (l'Accueil,
// Qobuz, Tidal) reste une pile — sans quoi ce témoin serait vert dans un monde
// où toutes les pages seraient passées en grille, règle « tous horizontaux »
// du 02/09 cassée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
import TableauDeBordV2 from '../../components/v2/TableauDeBordV2.svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import * as api from '../api';
import { currentProfileId } from '../stores/profile';
import {
  BLOCS_TABLEAU_DE_BORD,
  DISPOSITION_DEFAUT_TABLEAU_DE_BORD,
  COTE_GRILLE,
  GOUTTIERE_GRILLE,
  largeurBloc,
} from '../tableauDeBordWidgets';

const MONTAGE = 40_000;
vi.setConfig({ testTimeout: MONTAGE, hookTimeout: MONTAGE });

const FEUILLES = [
  'src/components/v2/PageWidgets.svelte',
  'src/components/v2/blocs/BlocTendance.svelte',
];
let styles: HTMLStyleElement[] = [];
let portees: Record<string, string> = {};

function injecter() {
  for (const chemin of FEUILLES) {
    const src = readFileSync(resolve(process.cwd(), chemin), 'utf-8');
    const { css } = compile(src, { css: 'external', filename: chemin });
    if (!css?.code) throw new Error(`${chemin} : aucune feuille compilée`);
    const portee = css.code.match(/\.(svelte-[a-z0-9]+)/)?.[1];
    if (!portee) throw new Error(`${chemin} : aucune classe de portée`);
    portees[chemin] = portee;
    const el = document.createElement('style');
    el.textContent = css.code;
    document.head.appendChild(el);
    styles.push(el);
  }
}

/** La feuille compilée ici et le composant monté par Vite portent-ils la
 *  MÊME portée ? Sinon aucune règle ne s'applique, et un « pas de grille »
 *  serait vrai pour une mauvaise raison. */
function verifierPortee(racine: HTMLElement, chemin: string) {
  if (!racine.querySelector(`.${portees[chemin]}`)) {
    throw new Error(`${chemin} : la portée ${portees[chemin]} n'est sur aucun élément monté`);
  }
}

function jour(i: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TABLEAU = {
  period: '7d', range: { from: null, to: '' },
  totals: { plays: 108, listening_ms: 1, unique_tracks: 1, unique_artists: 1 },
  top_artists: [], top_albums: [], top_tracks: [],
  trend: [{ day: jour(0), plays: 40, listening_ms: 1 }, { day: jour(2), plays: 11, listening_ms: 1 }],
  hourly: [{ hour: 21, plays: 30 }], weekday_hourly: [{ weekday: 3, hour: 21, plays: 12 }],
  by_zone: [{ zone_id: 1, zone_name: 'Fosi Audio SK02', plays: 98, listening_ms: 1 }],
  by_source: [{ source: 'local', plays: 105, listening_ms: 1 }],
  by_genre: [], streak: { current: 4, best: 4, last_day: null }, on_this_day: [],
  completion: { completed: 75, skipped: 25, avg_listened_ms: 0, avg_track_duration_ms: 0 },
} as any;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const souffler = (ms = 140) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.restoreAllMocks();
  currentProfileId.set(1);
  vi.spyOn(api, 'getDashboard').mockResolvedValue(TABLEAU);
  vi.spyOn(api, 'getGenreTree').mockResolvedValue({ tree: {} } as any);
  vi.spyOn(api, 'getProfilePreferences').mockResolvedValue({} as any);
  vi.spyOn(api, 'setProfilePreferences').mockImplementation(async (_p: any, c: any) => c);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  injecter();
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  for (const s of styles) s.remove();
  styles = [];
  portees = {};
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function poser(C: any, props: Record<string, unknown> = {}): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props });
  flushSync();
  await souffler();
  flushSync();
  await souffler();
  flushSync();
  verifierPortee(hote, 'src/components/v2/PageWidgets.svelte');
  return hote;
}

const sansEspaces = (v: string) => v.replace(/\s+/g, '');

describe('#1671 — le Tableau de bord est une GRILLE aux cotes des maquettes', () => {
  it('les cotes sont celles de la maquette : carré de 315 px, gouttière de 16 px', () => {
    expect(COTE_GRILLE).toBe(315);
    expect(GOUTTIERE_GRILLE).toBe(16);
    expect(largeurBloc(1)).toBe(315);
    expect(largeurBloc(2)).toBe(646);
  });

  it('les onze widgets restent, et trois d’entre eux (les plus larges) prennent deux colonnes', () => {
    expect(BLOCS_TABLEAU_DE_BORD).toHaveLength(11);
    expect(DISPOSITION_DEFAUT_TABLEAU_DE_BORD).toHaveLength(11);
    const larges = BLOCS_TABLEAU_DE_BORD.filter((w) => w.bloc?.colonnes === 2).map((w) => w.id);
    expect(larges).toEqual(['tdb-tendance', 'tdb-semaine-heures', 'tdb-heures']);
  });

  it('🔴 l’écran monté range ses blocs sur une grille de colonnes de 315 px', async () => {
    const page = await poser(TableauDeBordV2);
    const grille = page.querySelector<HTMLElement>('.mosaique');
    expect(grille, 'aucun conteneur de grille : les blocs sont empilés en pleine largeur').toBeTruthy();
    const cs = getComputedStyle(grille!);
    expect(cs.display).toBe('grid');
    expect(sansEspaces(cs.gridTemplateColumns)).toBe(`repeat(auto-fill,${COTE_GRILLE}px)`);
    expect(cs.columnGap).toBe(`${GOUTTIERE_GRILLE}px`);
    // Les onze blocs sont DANS la grille, pas à côté.
    expect(grille!.querySelectorAll(':scope > section.bloc')).toHaveLength(11);
    expect(grille!.querySelectorAll('.blocpropre')).toHaveLength(11);
  });

  it('🔴 aucun bloc ne s’étire au-delà de ses colonnes', async () => {
    const page = await poser(TableauDeBordV2);
    const sections = [...page.querySelectorAll<HTMLElement>('.mosaique > section.bloc')];
    expect(sections).toHaveLength(11);
    sections.forEach((el, i) => {
      const w = BLOCS_TABLEAU_DE_BORD.find((x) => x.id === DISPOSITION_DEFAUT_TABLEAU_DE_BORD[i])!;
      const n = w.bloc?.colonnes ?? 1;
      const cs = getComputedStyle(el);
      expect(cs.maxWidth, `${w.id} : largeur maximale`).toBe(`${largeurBloc(n)}px`);
      if (n === 2) expect(sansEspaces(cs.gridColumn), `${w.id} : deux colonnes`).toBe('span2');
      else expect(sansEspaces(cs.gridColumn), `${w.id} : une colonne`).not.toBe('span2');
    });
  });

  it('🔴 la Tendance a une rangée de barres de hauteur DÉFINIE (sinon aucune barre ne se dessine)', async () => {
    const page = await poser(TableauDeBordV2);
    verifierPortee(page, 'src/components/v2/blocs/BlocTendance.svelte');
    const rangee = page.querySelector<HTMLElement>(`.barres.${portees['src/components/v2/blocs/BlocTendance.svelte']}`);
    expect(rangee, 'la rangée de barres de la Tendance n’est pas rendue').toBeTruthy();
    expect(rangee!.querySelectorAll('.barre').length).toBe(7);
    expect(getComputedStyle(rangee!).height, 'hauteur indéfinie : les barres en % retombent à zéro')
      .toMatch(/^\d+px$/);
  });

  it('contre-épreuve : une PageWidgets SANS `grille` reste une pile (Accueil, Qobuz, Tidal)', async () => {
    const page = await poser(PageWidgets, {
      catalogue: BLOCS_TABLEAU_DE_BORD,
      dispositionDefaut: DISPOSITION_DEFAUT_TABLEAU_DE_BORD,
      cle: 'tableau_de_bord_widgets',
      cleChiffres: 'tableau_de_bord_stats',
      cleChiffresMigre: 'tableau_de_bord_stats_migre',
      cleTitre: 'dashboard.title',
    });
    // Les feuilles s'appliquent bien (sinon « pas de grille » ne prouverait rien).
    expect(getComputedStyle(page.querySelector<HTMLElement>('.scroll')!).overflowY).toBe('auto');
    expect(page.querySelectorAll('.blocpropre')).toHaveLength(11);
    expect(page.querySelector('.mosaique')).toBeNull();
    const premiere = page.querySelector<HTMLElement>('section.bloc')!;
    expect(getComputedStyle(premiere.parentElement!).display).not.toBe('grid');
    expect(getComputedStyle(premiere).maxWidth).not.toBe("646px");
  });
});
