// @vitest-environment jsdom
//
// web#2805 (suite de tune-server-rust#7465, FabienM fil 2271) — le filtre
// « Tous / Par vous / Par Qobuz » existait dans Streaming › Qobuz ›
// Playlists (#2231), pas dans le menu Playlists, pastille d'un service.
//
// Le témoin MONTE `v2/PlaylistsV2.svelte` avec deux services : Qobuz, dont
// les playlists portent `editable` (2 à vous, 1 suivie, 1 sans drapeau), et
// Tidal, sans drapeau du tout.
//
// CONTRE-ÉPREUVE (jouée sur Shrek) : `{@const liste = serviceSaisi}` au lieu
// de `serviceVu` (puces affichées mais non branchées) → 3 rouges sur 4 ;
// sans la remise à « Tous » au changement de pastille ni le repli
// `auteurOffert ? filtreAuteur : 'tous'` → le test Tidal rouge (1 sur 4).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PlaylistsV2 from '../../components/v2/PlaylistsV2.svelte';
import { currentProfileId } from '../stores/profile';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';

const pl = (id: string, name: string, editable?: boolean | null) => ({
  source_id: id, name, track_count: 3, duration_ms: 0, source: 'qobuz', ...(editable === undefined ? {} : { editable }),
});
const QOBUZ = [
  pl('q1', 'Mes favoris rock', true),
  pl('q2', 'Soirée jazz perso', true),
  pl('q3', 'Qobuz Essentiels', false),
  pl('q4', 'Inconnue', null),
];
const TIDAL = [pl('t1', 'Tidal Mix'), pl('t2', 'Tidal Rising')];

function corps(url: string): unknown {
  if (url.includes('/streaming/services')) return { qobuz: { authenticated: true }, tidal: { authenticated: true } };
  if (url.includes('/streaming/qobuz/playlists')) return QOBUZ;
  if (url.includes('/streaming/tidal/playlists')) return TIDAL;
  if (url.includes('/smart-playlists')) return [];
  if (url.includes('/playlists')) return [{ id: 7, name: 'Locale', track_count: 1 }];
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

async function cliquer(b: HTMLElement | null | undefined) {
  expect(b, 'bouton absent').toBeTruthy();
  b!.click();
  flushSync();
  await respirer(20);
  flushSync();
}

const pastille = (h: HTMLElement, nom: string) =>
  Array.from(h.querySelectorAll<HTMLButtonElement>('nav.srcs button')).find((b) => b.textContent?.trim().startsWith(nom));
const puce = (h: HTMLElement, id: string) => h.querySelector<HTMLButtonElement>(`.auteur button[data-auteur="${id}"]`);
const titres = (h: HTMLElement) => Array.from(h.querySelectorAll('.grid .card .ct')).map((e) => e.textContent?.trim());

describe('PlaylistsV2 — « Tous / Par vous / Par Qobuz » sur la pastille d’un service (#2805)', () => {
  it('🔴 Qobuz : trois puces avec leurs compteurs, « Par vous » et « Par Qobuz » filtrent', async () => {
    const h = await poser();
    await cliquer(pastille(h, 'qobuz'));
    expect(puce(h, 'tous')?.textContent).toMatch(/Tous\s*4/);
    expect(puce(h, 'moi')?.textContent).toMatch(/Par vous\s*2/);
    expect(puce(h, 'service')?.textContent).toMatch(/Par Qobuz\s*1/);
    expect(titres(h)).toHaveLength(4);

    await cliquer(puce(h, 'moi'));
    expect(titres(h)).toEqual(['Mes favoris rock', 'Soirée jazz perso']);
    expect(puce(h, 'moi')?.getAttribute('aria-pressed')).toBe('true');

    await cliquer(puce(h, 'service'));
    expect(titres(h)).toEqual(['Qobuz Essentiels']);

    await cliquer(puce(h, 'tous'));
    expect(titres(h)).toHaveLength(4);
  });

  it('🔴 le filtre s’applique APRÈS la recherche, compteurs compris', async () => {
    const h = await poser();
    await cliquer(pastille(h, 'qobuz'));
    const champ = h.querySelector<HTMLInputElement>('label.chercher input');
    expect(champ).not.toBeNull();
    // « s » écarte « Inconnue » (sans drapeau) et garde les trois autres.
    champ!.value = 's';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    await respirer(20);
    flushSync();
    expect(puce(h, 'tous')?.textContent).toMatch(/Tous\s*3/);
    expect(puce(h, 'moi')?.textContent).toMatch(/Par vous\s*2/);
    expect(puce(h, 'service')?.textContent).toMatch(/Par Qobuz\s*1/);
    await cliquer(puce(h, 'service'));
    expect(titres(h)).toEqual(['Qobuz Essentiels']);
  });

  it('un service sans drapeau `editable` (Tidal) n’offre pas le filtre, et un choix posé sur Qobuz ne le vide pas', async () => {
    const h = await poser();
    await cliquer(pastille(h, 'qobuz'));
    await cliquer(puce(h, 'service'));
    expect(titres(h)).toEqual(['Qobuz Essentiels']);
    await cliquer(pastille(h, 'tidal'));
    expect(h.querySelector('.auteur')).toBeNull();
    expect(titres(h)).toEqual(['Tidal Mix', 'Tidal Rising']);
    // Retour sur Qobuz : « Tous », pas le choix d'avant.
    await cliquer(pastille(h, 'qobuz'));
    expect(puce(h, 'tous')?.getAttribute('aria-pressed')).toBe('true');
    expect(titres(h)).toHaveLength(4);
  });

  it('les playlists locales ne sont jamais filtrées : pas de puces sur « Cet appareil »', async () => {
    const h = await poser();
    expect(h.querySelector('.auteur')).toBeNull();
    expect(titres(h)).toContain('Locale');
  });
});
