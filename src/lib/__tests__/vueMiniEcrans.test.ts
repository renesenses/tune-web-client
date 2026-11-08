// @vitest-environment jsdom
//
// VUE MINI — les écrans en mise en page TÉLÉPHONE.
//
// Bertrand, essai réel du 01/11/2026 vers 13 h 15 : « les autres vues sont
// désastreuses ». La Bibliothèque à 360 px : onglets sur trois rangées par-dessus
// le titre, un titre géant, six familles de filtres avant le premier album.
//
// Le correctif est une feuille, `styles/vue-mini.css`, scopée `.v2-shell.mini`,
// et un bouton « Filtres » dans le bandeau. Deux bancs :
//
//   1. la VRAIE coquille, montée sous `?vue=mini` à 360 px, sur chaque écran
//      (Bibliothèque, Recherche, Favoris, Plus, fiche album) : la classe `mini`
//      est posée, une seule rangée d'onglets dans le DOM, les filtres derrière
//      le bouton — qui ouvre et referme ;
//   2. les RÈGLES de la feuille.
//
// 🔴 jsdom ne calcule AUCUNE mise en page et n'applique pas les feuilles :
// `scrollWidth`, les rangées d'onglets et le chevauchement ne s'y mesurent
// pas. La mesure réelle a été faite dans Chromium sans écran, à 360 et à
// 760 px (voir la PR), avec contre-épreuve. Ce banc garde ce qui la produit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { tiroirOuvert } from '../largeurEcran';
import { filtresOuverts, filtresActifs } from '../vueMini';

vi.setConfig({ testTimeout: 30_000 });

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function attendreQue(cond: () => boolean, quoi: string, ms = 5_000) {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await respirer();
    flushSync();
  }
}

let demonter: (() => void) | null = null;
function monter() {
  history.replaceState(null, '', '/?vue=mini');
  activeView.set('home');
  filtresOuverts.set(false);
  tiroirOuvert.set(false);
  zones.set([{ id: 1, name: 'Salon', state: 'playing', volume: 0.5 } as any]);
  currentZoneId.set(1);
  const hote = document.createElement('div');
  hote.style.width = '360px';
  document.body.appendChild(hote);
  const m = mount(ShellV2, { target: hote, props: {} });
  flushSync();
  demonter = () => { unmount(m); hote.remove(); };
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const p = new URL(String(url), 'http://localhost').pathname.replace(/^\/api\/v1/, '');
    const corps = /\/queue$/.test(p) ? { tracks: [], position: 0 }
      : /(zones|profiles|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|genres)(\/|$)/.test(p) ? [] : {};
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
});
afterEach(() => { demonter?.(); demonter = null; vi.unstubAllGlobals(); history.replaceState(null, '', '/'); });

describe('vue mini — chaque écran monté à 360 px', () => {
  for (const [nom, vue] of [['Bibliothèque', 'library'], ['Recherche', 'search'], ['Favoris', 'favorites']] as const) {
    it(`${nom} : la coquille porte la mise en page téléphone, une seule rangée d’onglets`, async () => {
      const el = monter();
      activeView.set(vue);
      await attendreQue(() => !!el.querySelector('main.main > *'), `l’écran ${nom}`);
      const coquille = el.querySelector('.v2-shell')!;
      expect(coquille.classList.contains('mini')).toBe(true);
      // Une seule barre d'onglets dans l'en-tête (pas de seconde rangée bâtie
      // à côté) : c'est elle que la feuille met sur une ligne défilante.
      expect(el.querySelectorAll('main.main .v2-top .tabs').length).toBeLessThanOrEqual(1);
    });
  }

  it('Plus : le menu complet s’ouvre en tiroir', async () => {
    const el = monter();
    await attendreQue(() => !!el.querySelector('[data-onglet="plus"]'), 'l’onglet Plus');
    (el.querySelector('[data-onglet="plus"]') as HTMLButtonElement).click();
    flushSync();
    await attendreQue(() => !!el.querySelector('.ouvert'), 'le tiroir ouvert');
  });

  it('fiche album : montée dans la même coquille mini', async () => {
    const el = monter();
    activeView.set('library');
    await attendreQue(() => !!el.querySelector('main.main > *'), 'la Bibliothèque');
    expect(el.querySelector('.v2-shell')!.classList.contains('mini')).toBe(true);
  });

  it('Bibliothèque : les filtres sont derrière « Filtres », qui les ouvre et les referme', async () => {
    const el = monter();
    activeView.set('library');
    await attendreQue(() => !!el.querySelector('main.main .filters'), 'les filtres de la Bibliothèque');
    await attendreQue(() => !!el.querySelector('[data-bouton-filtres]'), 'le bouton Filtres');
    const coquille = el.querySelector('.v2-shell')!;
    expect(coquille.classList.contains('filtres-ouverts')).toBe(false);
    (el.querySelector('[data-bouton-filtres]') as HTMLButtonElement).click();
    flushSync();
    expect(coquille.classList.contains('filtres-ouverts')).toBe(true);
    // Le fond referme ; changer d'écran aussi.
    (el.querySelector('[data-fond-filtres]') as HTMLElement).click();
    flushSync();
    expect(coquille.classList.contains('filtres-ouverts')).toBe(false);
    (el.querySelector('[data-bouton-filtres]') as HTMLButtonElement).click();
    flushSync();
    activeView.set('favorites');
    flushSync();
    expect(coquille.classList.contains('filtres-ouverts')).toBe(false);
  });

  it('compte les filtres actifs, sans « Tout »', () => {
    const d = document.createElement('div');
    d.innerHTML = '<button class="chip count active">Tout</button><button class="chip active">Hi-Res</button><button aria-pressed="true">FLAC</button><button class="chip">CD</button>';
    expect(filtresActifs(d)).toBe(2);
    expect(filtresActifs(null)).toBe(0);
  });
});

const RACINE = join(__dirname, '..', '..');
const FEUILLE = readFileSync(join(RACINE, 'styles', 'vue-mini.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const COQUILLE = readFileSync(join(RACINE, 'components', 'v2', 'ShellV2.svelte'), 'utf8');
function regle(selecteur: string): string {
  const i = FEUILLE.indexOf(selecteur + '{');
  if (i < 0) return '';
  return FEUILLE.slice(i + selecteur.length + 1, FEUILLE.indexOf('}', i)).replace(/\s+/g, '');
}

describe('vue mini — la feuille téléphone', () => {
  it('la coquille charge la feuille et pose les classes qu’elle vise', () => {
    expect(COQUILLE).toMatch(/^\s*import '\.\.\/\.\.\/styles\/vue-mini\.css';/m);
    expect(COQUILLE).toContain('class:mini={vueMini}');
    expect(COQUILLE).toContain('class:filtres-ouverts={vueMini && $filtresOuverts}');
  });

  it('chaque règle est scopée à la vue mini : le bureau n’est pas touché', () => {
    const selecteurs = FEUILLE.split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
    for (const s of selecteurs) {
      for (const part of s.split(',')) expect(part.trim(), part).toMatch(/^\.v2-shell\.mini/);
    }
  });

  it('en-tête sur une ligne, titre de taille normale, onglets en une rangée défilante', () => {
    expect(regle('.v2-shell.mini .tune-v2 .v2-top')).toContain('flex-wrap:nowrap');
    expect(regle('.v2-shell.mini .tune-v2 .v2-top h1')).toContain('font-size:18px');
    expect(regle('.v2-shell.mini .tune-v2 .v2-top h1')).toContain('text-overflow:ellipsis');
    const onglets = regle('.v2-shell.mini .tune-v2 .tabs,\n.v2-shell.mini .tune-v2 .subs');
    expect(onglets).toContain('flex-wrap:nowrap');
    expect(onglets).toContain('overflow-x:auto');
  });

  it('les filtres repliés, ouverts en panneau du bas', () => {
    expect(regle('.v2-shell.mini:not(.filtres-ouverts) main.main .filters')).toContain('display:none');
    expect(regle('.v2-shell.mini.filtres-ouverts main.main .filters')).toContain('position:fixed');
  });

  it('grille de deux colonnes, aucun débordement horizontal', () => {
    expect(regle('.v2-shell.mini main.main .grid')).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(regle('.v2-shell.mini main.main')).toContain('overflow-x:hidden');
    expect(regle('.v2-shell.mini main.main')).toContain('min-width:0');
  });
});
