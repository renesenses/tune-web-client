// @vitest-environment jsdom
//
// `v2/PlaylistsV2.svelte` — l'écran Playlists qu'on atteint depuis les Favoris.
//
// 1. LE PIÈGE DE #1650 : son choix de bascule était écrit par un `$effect`,
//    donc dès l'OUVERTURE de l'écran. Le défaut se figeait en faux choix dans
//    `localStorage`, et plus aucun changement de défaut n'atteignait personne.
//    Le choix n'est désormais écrit qu'au CLIC.
// 2. LES TROIS CRANS, comme Collections (web#1801), « Écouter plus tard »
//    (web#1802) et le gestionnaire de playlists (#1848) : petites vignettes,
//    grandes vignettes, liste.
//
// Le témoin MONTE l'écran, lit `localStorage` et les classes des grilles.
//
// CONTRE-ÉPREUVE (jouée sur Shrek) : avec la ligne
// `$effect(() => ecrireChoix('pl.display', affichage));` remise, 2 rouges sur
// 4 (l'ouverture, et le choix illisible réécrit au montage) ; sans
// `class:grandes` sur les grilles, 2 rouges sur 4 (les trois crans, la
// relecture).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import { currentProfileId } from '../stores/profile';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';

const CLE = 'tune_v2_ecran_pl.display';
const PLAYLIST = { id: 7, name: 'Route 66', track_count: 3 };

function corps(url: string): unknown {
  if (/\/playlists\/7\/tracks/.test(url)) {
    return [{ id: 1, title: 'Get Your Kicks', cover_path: '/c/a.jpg' }];
  }
  if (url.includes('/playlists/all')) return [];
  if (url.includes('/smart-playlists')) return [];
  if (url.includes('/playlists')) return [PLAYLIST];
  if (url.includes('/streaming/services')) return {};
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const respirer = (ms = 160) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
    const b = corps(String(entree));
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => b, text: async () => JSON.stringify(b),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  currentProfileId.set(1);
  activeView.set('playlists' as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistsV2, { target: hote, props: {} as any });
  flushSync();
  await respirer(200);
  flushSync();
  return hote;
}

function forme(h: HTMLElement): 'petites' | 'grandes' | 'liste' {
  const grilles = Array.from(h.querySelectorAll('.grid'));
  expect(grilles.length, 'aucune grille rendue — témoin sans objet').toBeGreaterThan(0);
  expect(h.querySelector('.grid .card'), 'aucune carte — témoin sans objet').not.toBeNull();
  if (grilles.every((g) => g.classList.contains('liste'))) return 'liste';
  if (grilles.every((g) => g.classList.contains('grandes'))) return 'grandes';
  expect(grilles.some((g) => g.classList.contains('liste') || g.classList.contains('grandes'))).toBe(false);
  return 'petites';
}

async function basculer(h: HTMLElement) {
  const b = h.querySelector<HTMLButtonElement>('button.viewtog[data-vue]');
  expect(b, 'bascule d’affichage absente').not.toBeNull();
  b!.click();
  flushSync();
  await respirer(20);
  flushSync();
}

describe('PlaylistsV2 — la bascule écrite au clic, à trois crans', () => {
  it('🔴 à l’ouverture, les petites vignettes, et RIEN n’est écrit (#1650)', async () => {
    const h = await poser();
    expect(forme(h)).toBe('petites');
    expect(h.querySelectorAll('button.viewtog .vpts i')).toHaveLength(3);
    expect(localStorage.getItem(CLE), 'le défaut est retenu comme un choix dès l’ouverture (#1650)').toBeNull();
  });

  it('🔴 trois crans : grandes vignettes, liste, retour — chaque clic est retenu', async () => {
    const h = await poser();
    await basculer(h);
    expect(forme(h)).toBe('grandes');
    expect(localStorage.getItem(CLE)).toBe('gridLarge');
    await basculer(h);
    expect(forme(h)).toBe('liste');
    expect(localStorage.getItem(CLE)).toBe('list');
    await basculer(h);
    expect(forme(h)).toBe('petites');
    expect(localStorage.getItem(CLE)).toBe('grid');
  });

  it('🔴 un choix retenu est relu, et l’ouverture ne le réécrit pas', async () => {
    localStorage.setItem(CLE, 'gridLarge');
    const h = await poser();
    expect(forme(h)).toBe('grandes');
    expect(localStorage.getItem(CLE)).toBe('gridLarge');
  });

  it('un ancien choix « list » reste valide ; un choix illisible retombe sur les petites vignettes', async () => {
    localStorage.setItem(CLE, 'list');
    let h = await poser();
    expect(forme(h)).toBe('liste');
    unmount(monte!);
    monte = null;
    hote?.remove();

    localStorage.setItem(CLE, 'carousel');
    h = await poser();
    expect(forme(h)).toBe('petites');
    // Relu, pas corrigé en silence au montage.
    expect(localStorage.getItem(CLE)).toBe('carousel');
  });
});
