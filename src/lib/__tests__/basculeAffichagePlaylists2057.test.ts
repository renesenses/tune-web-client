// @vitest-environment jsdom
//
// FabienM (fil 2057), go de Bertrand du 30/09/2026 : Playlists et Playlists
// intelligentes reçoivent la bascule d'affichage de Collections (web#1801) et
// d'« Écouter plus tard » (web#1802) — petites vignettes, grandes vignettes,
// liste.
//
// Le témoin MONTE les deux écrans que la barre latérale ouvre
// (`PlaylistManagerView`, `SmartPlaylistsView`), lit la grille et clique la
// bascule :
//   1. par défaut, les petites vignettes, et RIEN n'est écrit au montage (le
//      piège de #1650 : un défaut écrit se fige en faux choix) ;
//   2. un clic mène aux grandes vignettes, un autre à la liste, un troisième
//      revient ; chaque clic est retenu sous la clé de CET écran ;
//   3. le choix d'un écran ne déteint pas sur l'autre ;
//   4. un choix retenu est relu à l'ouverture, un choix illisible retombe sur
//      les petites vignettes ;
//   5. chaque forme garde la pochette ou la mosaïque de la carte (#1841).
//
// CONTRE-ÉPREUVE (jouée sur Shrek) : sans `class:liste` / `class:grandes` sur
// la grille de `PlaylistManagerView.svelte`, puis sur celle de
// `SmartPlaylistsView.svelte`, les témoins 2, 4 et 5 de l'écran visé
// rougissent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistManagerView from '../../components/v2-heritage/PlaylistManagerView.svelte';
import SmartPlaylistsView from '../../components/v2-heritage/SmartPlaylistsView.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

const CLE_PLAYLISTS = 'tune_v2_ecran_v2.playlistmanager.display';
const CLE_SMART = 'tune_v2_ecran_v2.smartplaylists.display';

const LOCALE = { id: 42, name: 'Nocturnes', track_count: 3 };
const QOBUZ = {
  source_id: 'q-777',
  name: 'Matin Qobuz',
  track_count: 12,
  duration_ms: 1000,
  cover_path: '/covers/qobuz-matin.jpg',
  source: 'qobuz',
};
const SMART = [
  { id: 1, name: 'Most Played', rules: [], match_mode: 'all' },
  { id: 2, name: 'Recently Added', rules: [], match_mode: 'all' },
];
const PISTES_SMART = [
  { id: 1, title: 'A', album_title: 'Album A', cover_path: '/covers/a.jpg' },
  { id: 2, title: 'B', album_title: 'Album B', cover_path: '/covers/b.jpg' },
];

function corpsPour(url: string): unknown {
  if (url.includes('/playlist-manager/services')) {
    return { qobuz: { authenticated: true, supports_write: true, supports_delete: true } };
  }
  if (url.includes('/streaming/services')) return { qobuz: { authenticated: true } };
  if (url.includes('/streaming/qobuz/playlists')) return [QOBUZ];
  if (/\/library\/smart-playlists\/\d+\/tracks/.test(url)) return PISTES_SMART;
  if (/\/library\/smart-playlists(\?|$)/.test(url)) return SMART;
  if (/\/playlists\/\d+\/tracks/.test(url)) return [];
  if (/\/playlists(\?|$)/.test(url)) return [LOCALE];
  return [];
}

class Inerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const c = corpsPour(String(typeof url === 'string' ? url : url?.url ?? ''));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c, text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  localStorage.clear();
  vi.unstubAllGlobals();
});

async function tourner(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

type Forme = 'petites' | 'liste' | 'grandes';

interface Ecran {
  nom: string;
  cle: string;
  autreCle: string;
  monter: () => Promise<HTMLDivElement>;
  grille: string;
  carte: string;
  vignette: string;
}

const ECRANS: Ecran[] = [
  {
    nom: 'Playlists',
    cle: CLE_PLAYLISTS,
    autreCle: CLE_SMART,
    grille: '.pl-grille',
    carte: '.pl-carte',
    vignette: '.pl-vignette',
    monter: async () => {
      hote = document.createElement('div');
      document.body.appendChild(hote);
      monte = mount(PlaylistManagerView, { target: hote, props: { onAddToPlaylist: () => {} } as any });
      flushSync();
      await tourner();
      return hote;
    },
  },
  {
    nom: 'Playlists intelligentes',
    cle: CLE_SMART,
    autreCle: CLE_PLAYLISTS,
    grille: '.aveclettres .grid',
    carte: '.card',
    vignette: '.cv',
    monter: async () => {
      hote = document.createElement('div');
      document.body.appendChild(hote);
      monte = mount(SmartPlaylistsView, { target: hote, props: {} as any });
      flushSync();
      await tourner();
      return hote;
    },
  },
];

function forme(e: Ecran, racine: HTMLElement): Forme {
  const grille = racine.querySelector<HTMLElement>(e.grille);
  expect(grille, `grille de ${e.nom} introuvable — témoin sans objet`).not.toBeNull();
  expect(grille!.querySelectorAll(e.carte).length, `aucune carte dans ${e.nom} — témoin sans objet`).toBeGreaterThan(0);
  if (grille!.classList.contains('liste')) return 'liste';
  if (grille!.classList.contains('grandes')) return 'grandes';
  return 'petites';
}

function bascule(e: Ecran, racine: HTMLElement): HTMLButtonElement {
  const b = racine.querySelector<HTMLButtonElement>('.viewtog');
  expect(b, `bascule d’affichage absente de ${e.nom}`).not.toBeNull();
  return b!;
}

async function basculer(e: Ecran, racine: HTMLElement) {
  bascule(e, racine).click();
  await tourner(2);
}

/** Chaque carte garde son image : pochette (`img`) ou mosaïque. */
function images(e: Ecran, racine: HTMLElement): number {
  return [...racine.querySelectorAll<HTMLElement>(`${e.grille} ${e.carte}`)]
    .filter((c) => c.querySelector(`${e.vignette} img, ${e.vignette} .mos`))
    .length;
}

for (const e of ECRANS) {
  describe(`FabienM, fil 2057 — la bascule d’affichage dans ${e.nom}`, () => {
    it('par défaut, les petites vignettes, et rien n’est écrit au montage (#1650)', async () => {
      const racine = await e.monter();
      expect(forme(e, racine)).toBe('petites');
      expect(bascule(e, racine).getAttribute('data-vue')).toBe('grid');
      // Trois crans, donc trois pastilles.
      expect(bascule(e, racine).querySelectorAll('.vpts i')).toHaveLength(3);
      expect(localStorage.getItem(e.cle), 'le défaut est retenu comme un choix (#1650)').toBeNull();
    });

    // Rotation commune avec Collections et « Écouter plus tard »
    // (`LISTE_ET_DEUX_GRILLES`) : liste → petites → grandes → liste.
    it('🔴 trois crans : grandes vignettes, liste, retour — chaque clic est retenu sous la clé de l’écran', async () => {
      const racine = await e.monter();
      await basculer(e, racine);
      expect(forme(e, racine)).toBe('grandes');
      expect(localStorage.getItem(e.cle)).toBe('gridLarge');
      await basculer(e, racine);
      expect(forme(e, racine)).toBe('liste');
      expect(localStorage.getItem(e.cle)).toBe('list');
      await basculer(e, racine);
      expect(forme(e, racine)).toBe('petites');
      expect(localStorage.getItem(e.cle)).toBe('grid');
      // L'autre écran n'a rien reçu.
      expect(localStorage.getItem(e.autreCle)).toBeNull();
    });

    it('🔴 un choix retenu est relu à l’ouverture ; un choix illisible retombe sur les petites vignettes', async () => {
      localStorage.setItem(e.cle, 'list');
      let racine = await e.monter();
      expect(forme(e, racine)).toBe('liste');
      unmount(monte!);
      monte = null;
      hote?.remove();

      localStorage.setItem(e.cle, 'carousel');
      racine = await e.monter();
      expect(forme(e, racine)).toBe('petites');
    });

    it('le choix de l’autre écran ne déteint pas sur celui-ci', async () => {
      localStorage.setItem(e.autreCle, 'list');
      const racine = await e.monter();
      expect(forme(e, racine)).toBe('petites');
    });

    it('🔴 chaque forme garde la pochette ou la mosaïque des cartes (#1841)', async () => {
      const racine = await e.monter();
      const avant = images(e, racine);
      expect(avant, `aucune image dans les cartes de ${e.nom} — témoin sans objet`).toBeGreaterThan(0);
      for (const attendue of ['grandes', 'liste'] as const) {
        await basculer(e, racine);
        expect(forme(e, racine)).toBe(attendue);
        expect(images(e, racine)).toBe(avant);
      }
    });
  });
}
