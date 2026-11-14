// @vitest-environment jsdom
//
// Recette rc12 du 13/11/2026 sur le .18 : dans Oxygen, la colonne des
// facettes était figée à 220 px et coupait les artistes, labels, genres et
// chemins de dossiers. Elle se règle désormais en tirant son bord droit.
//
// Le témoin tient quatre promesses, chacune avec sa contre-épreuve :
//   1. les BORNES (180–480 px, et 360 px au moins pour la liste centrale) ;
//   2. la MÉMOIRE par navigateur, avec repli sur la largeur par défaut quand
//      le stockage est illisible ou indisponible ;
//   3. le PAS du clavier (16 px) et le double-clic qui rétablit ;
//   4. la poignée MONTÉE pose `--rail-w` sur la grille — une garde qui lirait
//      la source resterait verte si la poignée cessait d'agir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import OxygenView from '../../components/v2-heritage/OxygenView.svelte';
import { activeView, gestesNavigationService, pendingLibraryAlbum } from '../stores/navigation';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import {
  bornerLargeurRail, ecrireLargeurRail, largeurRailAuClavier, lireLargeurRail, plafondRail,
  retablirLargeurRail, LISTE_MIN_PX, RAIL_DEFAUT_PX, RAIL_MAX_PX, RAIL_MIN_PX, RAIL_PAS_CLAVIER_PX,
} from '../largeurRailOxygen';

vi.setConfig({ testTimeout: 60_000 });

const CLE = 'tune_v2_ecran_oxygen_largeur_facettes';

describe('bornes de la colonne des facettes', () => {
  it('180 à 480 px, 260 par défaut', () => {
    expect([RAIL_MIN_PX, RAIL_MAX_PX, RAIL_DEFAUT_PX, LISTE_MIN_PX, RAIL_PAS_CLAVIER_PX]).toEqual([180, 480, 260, 360, 16]);
    expect(bornerLargeurRail(100)).toBe(180);
    expect(bornerLargeurRail(9999)).toBe(480);
    expect(bornerLargeurRail(301.6)).toBe(302);
    // Contre-épreuve : une valeur dans les bornes passe telle quelle.
    expect(bornerLargeurRail(300)).toBe(300);
  });

  it('une valeur illisible rend la largeur par défaut', () => {
    expect(bornerLargeurRail(Number.NaN)).toBe(260);
    expect(bornerLargeurRail(Number.POSITIVE_INFINITY)).toBe(260);
  });

  it('la liste centrale garde 360 px au moins', () => {
    // 1000 px à partager : le rail plafonne à 640 → 480 ; 700 px : 340.
    expect(plafondRail(1000)).toBe(480);
    expect(plafondRail(700)).toBe(340);
    expect(bornerLargeurRail(480, 700)).toBe(340);
    // Une place trop étroite ne fait pas descendre le rail sous son plancher.
    expect(plafondRail(400)).toBe(180);
    expect(bornerLargeurRail(300, 400)).toBe(180);
    // Place inconnue (pas encore mesurée) : seul le plafond fixe compte.
    expect(plafondRail(null)).toBe(480);
    expect(plafondRail(0)).toBe(480);
  });
});

describe('clavier', () => {
  it('flèches : ±16 px, bornées', () => {
    expect(largeurRailAuClavier('ArrowRight', 260)).toBe(276);
    expect(largeurRailAuClavier('ArrowLeft', 260)).toBe(244);
    expect(largeurRailAuClavier('ArrowLeft', 190)).toBe(180);
    expect(largeurRailAuClavier('ArrowRight', 470)).toBe(480);
    expect(largeurRailAuClavier('ArrowRight', 330, 700)).toBe(340);
  });
  it('Origine et Fin vont aux bornes ; les autres touches passent', () => {
    expect(largeurRailAuClavier('Home', 300)).toBe(180);
    expect(largeurRailAuClavier('End', 300)).toBe(480);
    expect(largeurRailAuClavier('End', 300, 700)).toBe(340);
    expect(largeurRailAuClavier('ArrowUp', 300)).toBeNull();
    expect(largeurRailAuClavier('Enter', 300)).toBeNull();
  });
});

describe('mémoire par navigateur', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('écrit, relit, rétablit', () => {
    expect(lireLargeurRail()).toBe(260);
    expect(ecrireLargeurRail(333)).toBe(333);
    expect(localStorage.getItem(CLE)).toBe('333');
    expect(lireLargeurRail()).toBe(333);
    expect(retablirLargeurRail()).toBe(260);
    expect(localStorage.getItem(CLE)).toBeNull();
    expect(lireLargeurRail()).toBe(260);
  });

  it('une valeur retenue hors bornes ou illisible est corrigée à la lecture', () => {
    localStorage.setItem(CLE, '9000');
    expect(lireLargeurRail()).toBe(480);
    localStorage.setItem(CLE, '12');
    expect(lireLargeurRail()).toBe(180);
    localStorage.setItem(CLE, 'large');
    expect(lireLargeurRail()).toBe(260);
    localStorage.setItem(CLE, '');
    expect(lireLargeurRail()).toBe(260);
  });

  it('stockage indisponible (mode privé, quota) : largeur par défaut, aucune exception', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(lireLargeurRail()).toBe(260);
    expect(() => ecrireLargeurRail(300)).not.toThrow();
    expect(ecrireLargeurRail(300)).toBe(300);
    expect(() => retablirLargeurRail()).not.toThrow();
  });
});

describe('les 15 langues', () => {
  it('la poignée a son libellé dans chaque dictionnaire', () => {
    const dossier = resolve(__dirname, '../locales');
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const src = readFileSync(resolve(dossier, `${l}.ts`), 'utf8');
      expect(src, l).toMatch(/['"]oxygen\.railWidth['"]:\s*['"][^'"]{10,}/);
    }
  });
});

// ── La poignée montée dans Oxygen ─────────────────────────────────────────
class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = async () => {
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};
function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

describe('la poignée dans Oxygen', () => {
  let telephone = false;
  beforeEach(() => {
    localStorage.clear();
    telephone = false;
    locale.set('fr');
    activeView.set('oxygen');
    pendingLibraryAlbum.set(null);
    gestesNavigationService.set({ ouvrirAlbum: () => {}, ouvrirArtiste: () => {} });
    preferences.update((p) => ({ ...p, oxygenView: 'grid' }));
    vi.stubGlobal('ResizeObserver', Inerte);
    vi.stubGlobal('IntersectionObserver', Inerte);
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: telephone, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    }));
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
    vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
      const url = String(typeof entree === 'string' ? entree : (entree as any)?.url ?? '');
      if (/\/library\/tracks\?/.test(url)) return reponse({ items: [], total: 0 });
      if (/\/library\/stats/.test(url)) return reponse({ tracks: 0, albums: 0, artists: 0 });
      if (/\/(zones|queue)/.test(url)) return reponse([]);
      return reponse({});
    }));
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  async function monter() {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(OxygenView, { target: hote });
    flushSync();
    await respirer();
    const corps = hote.querySelector('.body') as HTMLElement;
    expect(corps, 'grille non rendue').not.toBeNull();
    return { corps, poignee: hote.querySelector('[data-poignee-rail]') as HTMLElement | null };
  }
  const largeur = (corps: HTMLElement) => corps.style.getPropertyValue('--rail-w');

  it('séparateur vertical, 260 px par défaut, flèches de 16 px retenues', async () => {
    const { corps, poignee } = await monter();
    expect(poignee).not.toBeNull();
    expect(poignee!.getAttribute('role')).toBe('separator');
    expect(poignee!.getAttribute('aria-orientation')).toBe('vertical');
    expect(poignee!.getAttribute('aria-label')).toMatch(/facettes/);
    expect(poignee!.getAttribute('aria-valuemin')).toBe('180');
    expect(largeur(corps)).toBe('260px');

    poignee!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    flushSync();
    expect(largeur(corps)).toBe('276px');
    expect(poignee!.getAttribute('aria-valuenow')).toBe('276');
    expect(localStorage.getItem(CLE)).toBe('276');

    poignee!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    flushSync();
    expect(largeur(corps)).toBe('180px');

    // Double-clic : largeur par défaut, réglage oublié.
    poignee!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    flushSync();
    expect(largeur(corps)).toBe('260px');
    expect(localStorage.getItem(CLE)).toBeNull();
  });

  it('la largeur retenue revient au montage suivant', async () => {
    localStorage.setItem(CLE, '400');
    const { corps } = await monter();
    expect(largeur(corps)).toBe('400px');
  });

  it('sous 780 px, le rail reste un tiroir : pas de poignée', async () => {
    telephone = true;
    const { poignee } = await monter();
    expect(poignee).toBeNull();
  });
});
