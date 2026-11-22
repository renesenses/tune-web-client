// @vitest-environment jsdom
/**
 * Design v3 de Levente (§9) — le Tableau de bord « Mes écoutes », décision de
 * Bertrand du 22/11/2026 : structure, cartes et icônes d'en-tête du v3, avec
 * les données et les gestionnaires EXISTANTS (aucune route serveur neuve).
 *
 * Le banc monte l'écran avec une réponse `GET /library/history/dashboard`
 * peuplée et vérifie :
 *  - l'en-tête : sur-titre, titre, sous-titre ;
 *  - les trois BANDES (activité, classements, historique) et la rangée neuve
 *    que chacune ouvre ;
 *  - la carte GROUPÉE « Sources d'écoute et zones » (par zone, par source,
 *    puis radio), et qu'en « Modifier » les trois widgets reviennent un à un ;
 *  - les icônes d'en-tête Lucide ;
 *  - les classements : huit rangs, « Tout afficher », la colonne des lectures ;
 *  - l'heure de pointe de l'histogramme horaire, et une série nulle affichée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TableauDeBordV2 from '../../components/v2/TableauDeBordV2.svelte';
import * as api from '../api';
import { currentProfileId } from '../stores/profile';
import {
  BLOCS_TABLEAU_DE_BORD,
  DISPOSITION_DEFAUT_TABLEAU_DE_BORD,
  GROUPES_TABLEAU_DE_BORD,
} from '../tableauDeBordWidgets';
import { choisirPeriode } from '../tableauDeBordPeriode';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 40_000, hookTimeout: 40_000 });

const albums = Array.from({ length: 12 }, (_, i) => ({
  album_title: `Album ${i + 1}`, artist_name: `Artiste ${i + 1}`, cover_path: null, plays: 40 - i, album_id: 100 + i,
}));
const PEUPLE = {
  period: '7d', range: { from: null, to: '' },
  totals: { plays: 90, listening_ms: 1, unique_tracks: 1, unique_artists: 1 },
  top_artists: [], top_albums: albums,
  top_tracks: [{ track_id: 5, title: 'Money for Nothing', artist_name: 'Dire Straits', plays: 21, listening_ms: 1 }],
  trend: [], hourly: [{ hour: 13, plays: 9 }, { hour: 21, plays: 9 }, { hour: 8, plays: 2 }],
  weekday_hourly: [],
  by_zone: [{ zone_id: 1, zone_name: 'Desktop', plays: 89, listening_ms: 1 }, { zone_id: 2, zone_name: 'Browser', plays: 1, listening_ms: 1 }],
  by_source: [{ source: 'local', plays: 82, listening_ms: 1 }],
  by_genre: [{ genre: 'Rock', plays: 12, listening_ms: 1 }],
  radio_listening: [],
  streak: { current: 0, best: 4, last_day: null }, on_this_day: [],
  completion: { completed: 93, skipped: 7, avg_listened_ms: 0, avg_track_duration_ms: 0 },
} as any;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const souffler = (ms = 140) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.restoreAllMocks();
  choisirPeriode('7d');
  currentProfileId.set(1);
  vi.spyOn(api, 'getDashboard').mockResolvedValue(PEUPLE);
  vi.spyOn(api, 'getGenreTree').mockResolvedValue({ tree: {} } as any);
  vi.spyOn(api, 'getProfilePreferences').mockResolvedValue({} as any);
  vi.spyOn(api, 'setProfilePreferences').mockImplementation(async (_p: any, c: any) => c);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TableauDeBordV2, { target: hote, props: {} });
  for (let k = 0; k < 3; k++) { flushSync(); await souffler(); }
  flushSync();
  return hote;
}

const fr = () => dictionnaire('fr') as Record<string, string>;
const sectionDe = (page: HTMLElement, cle: string) =>
  [...page.querySelectorAll<HTMLElement>('.pile > section.bloc')].find((s) => s.querySelector(':scope > .tete h2')?.textContent === fr()[cle]);

describe('Tableau de bord v3 — le catalogue', () => {
  it('chaque bloc a une icône Lucide et une bande ; l’ordre par défaut suit 3 / 4 / 3', () => {
    for (const w of BLOCS_TABLEAU_DE_BORD) {
      expect(w.bloc?.iconeComposant, `${w.id} sans icône Lucide`).toBeTruthy();
      expect(w.bloc?.bande, `${w.id} sans bande`).toBeTruthy();
    }
    const bandes = DISPOSITION_DEFAUT_TABLEAU_DE_BORD.map((id) => BLOCS_TABLEAU_DE_BORD.find((w) => w.id === id)!.bloc!.bande);
    // Activité d'abord, puis classements, puis historique — jamais en retour.
    const ordre = ['activite', 'classements', 'historique'];
    expect(bandes.map((b) => ordre.indexOf(b!))).toEqual([...bandes.map((b) => ordre.indexOf(b!))].sort((a, b) => a - b));
    expect(bandes.filter((b) => b === 'activite')).toHaveLength(3);
  });

  it('le groupe « Sources d’écoute et zones » : par zone, par source, puis radio — des widgets qui existent', () => {
    const g = GROUPES_TABLEAU_DE_BORD.find((x) => x.id === 'tdb-sources-zones')!;
    expect(g.membres.map((m) => m.id)).toEqual(['tdb-zones', 'tdb-sources', 'tdb-radios']);
    for (const m of g.membres) expect(BLOCS_TABLEAU_DE_BORD.some((w) => w.id === m.id), m.id).toBe(true);
    // Avec eux, la bande des classements compte QUATRE cartes par défaut.
    const classements = DISPOSITION_DEFAUT_TABLEAU_DE_BORD.filter((id) =>
      BLOCS_TABLEAU_DE_BORD.find((w) => w.id === id)!.bloc!.bande === 'classements'
      && !g.membres.slice(1).some((m) => m.id === id));
    expect(classements).toHaveLength(4);
  });

  it('les libellés neufs existent dans les seize langues', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l) as Record<string, string>;
      for (const k of ['dashboard.eyebrow', 'dashboard.subtitle', 'dashboard.section.sourcesZones',
        'dashboard.radioEmpty', 'dashboard.peakListeningTime', 'dashboard.showAll']) {
        expect(d[k], `${l} : ${k}`).toBeTruthy();
      }
    }
  });
});

describe('Tableau de bord v3 — l’écran monté', () => {
  it('l’en-tête : sur-titre, titre, sous-titre', async () => {
    const page = await poser();
    expect(page.querySelector('header .v2-eyebrow')?.textContent).toBe(fr()['dashboard.eyebrow']);
    expect(page.querySelector('header h1')?.textContent).toBe(fr()['dashboard.title']);
    expect(page.querySelector('header .v2-sous')?.textContent).toBe(fr()['dashboard.subtitle']);
  });

  it('une seule carte groupée remplace les trois blocs, radio vide dite en une ligne', async () => {
    const page = await poser();
    const groupes = page.querySelectorAll('section.bloc.groupe[data-groupe="tdb-sources-zones"]');
    expect(groupes).toHaveLength(1);
    const g = groupes[0] as HTMLElement;
    expect(g.querySelector('.tete h2')?.textContent).toBe(fr()['dashboard.section.sourcesZones']);
    const membres = [...g.querySelectorAll<HTMLElement>('[data-membre]')].map((m) => m.dataset.membre);
    expect(membres).toEqual(['tdb-zones', 'tdb-sources', 'tdb-radios']);
    expect(g.textContent).toContain('Desktop');
    expect(g.textContent).toContain('89');
    expect(g.querySelector('[data-membre="tdb-radios"] .note-vide')?.textContent).toBe(fr()['dashboard.radioEmpty']);
    // Plus de carte séparée pour les membres.
    expect(sectionDe(page, 'dashboard.section.by_zone')).toBeUndefined();
    expect(sectionDe(page, 'dashboard.section.radio_listening')).toBeUndefined();
  });

  it('une zone ou une source chargée et VIDE ne prend aucune place', async () => {
    vi.mocked(api.getDashboard).mockResolvedValue({ ...PEUPLE, by_source: [] });
    const page = await poser();
    const g = page.querySelector<HTMLElement>('section.bloc.groupe')!;
    expect(g.querySelector('[data-membre="tdb-sources"]')).toBeNull();
    expect(g.querySelector('[data-membre="tdb-zones"]')).not.toBeNull();
  });

  it('chaque bande ouvre une rangée neuve', async () => {
    const page = await poser();
    const cartes = [...page.querySelectorAll<HTMLElement>('.pile > section.bloc')];
    const bandes = cartes.map((c) => c.dataset.bande);
    expect(bandes.slice(0, 7)).toEqual(['activite', 'activite', 'activite', 'classements', 'classements', 'classements', 'classements']);
    expect(cartes[3].classList.contains('debut-bande')).toBe(true);
    expect(cartes[1].classList.contains('debut-bande')).toBe(false);
    expect(cartes[7].dataset.bande).toBe('historique');
    expect(cartes[7].classList.contains('debut-bande')).toBe(true);
  });

  it('en « Modifier », les trois widgets reviennent un à un (la disposition ne change pas de forme)', async () => {
    const page = await poser();
    const modifier = [...page.querySelectorAll<HTMLButtonElement>('header button')].find((b) => b.textContent?.includes(fr()['v2.home.edit']))!;
    modifier.click();
    for (let k = 0; k < 2; k++) { flushSync(); await souffler(); }
    expect(page.querySelector('section.bloc.groupe')).toBeNull();
    expect(sectionDe(page, 'dashboard.section.by_zone')).toBeTruthy();
    expect(sectionDe(page, 'dashboard.section.by_source')).toBeTruthy();
    expect(sectionDe(page, 'dashboard.section.radio_listening')).toBeTruthy();
  });

  it('les en-têtes de carte portent une icône Lucide, cachée aux lecteurs d’écran', async () => {
    const page = await poser();
    const cartes = [...page.querySelectorAll<HTMLElement>('.pile > section.bloc')];
    expect(cartes.length).toBeGreaterThan(8);
    for (const c of cartes) {
      const svg = c.querySelector(':scope > .tete .icone-bloc svg');
      expect(svg, c.querySelector('.tete h2')?.textContent ?? '?').not.toBeNull();
      expect(svg!.getAttribute('class') ?? '').toMatch(/\blucide\b/);
      expect(c.querySelector(':scope > .tete .icone-bloc')!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('les classements : huit rangs, « Tout afficher », et le nombre de lectures', async () => {
    const page = await poser();
    const carte = sectionDe(page, 'dashboard.section.top_albums')!;
    expect(carte.querySelectorAll('ol.liste > li')).toHaveLength(8);
    expect(carte.querySelector('ol.liste > li .nb')?.textContent).toBe('40');
    expect(carte.querySelector('.colonnes')?.textContent).toBe(fr()['dashboard.totals.plays']);
    const plus = carte.querySelector<HTMLButtonElement>('button.plus')!;
    expect(plus.textContent?.trim()).toBe(fr()['dashboard.showAll']);
    expect(plus.getAttribute('aria-expanded')).toBe('false');
    plus.click();
    flushSync();
    expect(carte.querySelectorAll('ol.liste > li')).toHaveLength(12);
    expect(plus.textContent?.trim()).toBe(fr()['dashboard.showLess']);
    // Un seul titre : pas de bouton.
    expect(sectionDe(page, 'dashboard.section.top_tracks')!.querySelector('button.plus')).toBeNull();
  });

  it('l’heure de la journée : un histogramme de 24 barres et la PREMIÈRE heure de pointe', async () => {
    const page = await poser();
    const carte = sectionDe(page, 'dashboard.section.hourly')!;
    expect(carte.querySelectorAll('.histo .barre')).toHaveLength(24);
    expect(carte.querySelector('.grand')?.textContent).toBe('13h');
    expect(carte.textContent).toContain(fr()['dashboard.peakListeningTime']);
  });

  it('une série nulle s’affiche (0), le record en second', async () => {
    const page = await poser();
    const carte = sectionDe(page, 'dashboard.section.streak')!;
    expect(carte.querySelector('.grand')?.textContent).toBe('0');
    expect(carte.querySelector('.moyen')?.textContent).toBe('4');
  });
});
