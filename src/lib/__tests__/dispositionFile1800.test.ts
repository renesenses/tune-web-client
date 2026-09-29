// @vitest-environment jsdom
//
// web#1800 — FabienM (fil 2037, point 8), go de Bertrand du 29/09/2026 :
// « Pourquoi ne pas simplement conserver l'affichage de la file d'attente dans
// sa zone par défaut (en dessous de la barre d'avancement). Cela permettra
// d'élargir la colonne à côté de la pochette. »
//
// Réglages ▸ Affichage ▸ « File d'attente : sous la barre d'avancement / à
// droite ». Défaut : à droite, l'affichage d'avant.
//
// Le témoin MONTE l'écran en disposition large (clientWidth 1200 px), ouvre la
// file avec son bouton et lit le DOM : où est la feuille, quelle classe elle
// porte, quelle réserve la page lui laisse à droite.
//
// CONTRE-ÉPREUVE : sans le rendu en ligne de `NowPlaying.svelte` (le bloc
// `{#if fileSousLaBarre …}{@render feuilleFile()}` sous le bouton), le témoin
// « sous la barre » rougit : aucune feuille dans la colonne titres.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

const PISTE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'Video Games', artist_name: 'Lana Del Rey', album_title: 'Born To Die',
  source: 'local', duration_ms: 281000,
};
const FILE = [
  { id: 77, title: 'Video Games', artist_name: 'Lana Del Rey', source: 'local', duration_ms: 281000 },
  { id: 78, title: 'Blue Jeans', artist_name: 'Lana Del Rey', source: 'local', duration_ms: 210000 },
  { id: 79, title: 'Radio', artist_name: 'Lana Del Rey', source: 'local', duration_ms: 214000 },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let largeurAvant: PropertyDescriptor | undefined;

function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: FILE, position: 0, length: FILE.length };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function poser(): Promise<HTMLElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 }] as any);
  currentZoneId.set(1);
  queueTracks.set(FILE as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  await respirer();
  queueTracks.set(FILE as any);
  flushSync();
  const racine = hote.querySelector<HTMLElement>('.now-playing');
  expect(racine, 'racine de l’écran introuvable — témoin sans objet').not.toBeNull();
  expect(racine!.classList.contains('wide'), 'disposition large non atteinte — témoin sans objet').toBe(true);
  return racine!;
}

/** La réserve laissée à droite (`--np-reserve-file`), lue dans l'attribut. */
function reserve(racine: HTMLElement): number {
  const m = /--np-reserve-file:\s*(\d+)px/.exec(racine.getAttribute('style') ?? '');
  expect(m, 'réserve de la file introuvable — témoin sans objet').not.toBeNull();
  return Number(m![1]);
}

async function ouvrirLaFile(racine: HTMLElement): Promise<void> {
  const bouton = racine.querySelector<HTMLButtonElement>('.queue-sheet-toggle');
  expect(bouton, 'bouton de la file introuvable').not.toBeNull();
  bouton!.click();
  flushSync();
  await respirer();
  flushSync();
}

beforeAll(() => {
  // jsdom n'a pas de mise en page : `bind:clientWidth` lit cette valeur.
  largeurAvant = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
});

afterAll(() => {
  if (largeurAvant) Object.defineProperty(HTMLElement.prototype, 'clientWidth', largeurAvant);
});

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) =>
    reponse(String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree))));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  activeView.set('nowplaying');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  queueTracks.set([]);
  preferences.update((p) => ({ ...p, dispositionFile: 'droite' }));
  vi.unstubAllGlobals();
});

describe('web#1800 — la file d’attente sous la barre d’avancement ou à droite', () => {
  it('le réglage vaut « à droite » par défaut, et une valeur inconnue y retombe', async () => {
    try { localStorage.clear(); } catch { /* ignore */ }
    vi.resetModules();
    const neuf = await import('../stores/preferences');
    expect(get(neuf.preferences).dispositionFile).toBe('droite');

    localStorage.setItem('tune-preferences', JSON.stringify({ dispositionFile: 'en-haut' }));
    vi.resetModules();
    const abime = await import('../stores/preferences');
    expect(get(abime.preferences).dispositionFile).toBe('droite');

    localStorage.setItem('tune-preferences', JSON.stringify({ dispositionFile: 'sousLaBarre' }));
    vi.resetModules();
    const choisi = await import('../stores/preferences');
    expect(get(choisi.preferences).dispositionFile).toBe('sousLaBarre');
    localStorage.clear();
  });

  it('« à droite » (défaut) : la file s’ouvre en colonne de droite, comme avant', async () => {
    preferences.update((p) => ({ ...p, dispositionFile: 'droite' }));
    const racine = await poser();
    await ouvrirLaFile(racine);

    const feuille = racine.querySelector<HTMLElement>('.queue-sheet');
    expect(feuille, 'la file ne s’est pas ouverte').not.toBeNull();
    expect(feuille!.classList.contains('wide-layout')).toBe(true);
    expect(feuille!.classList.contains('en-ligne')).toBe(false);
    expect(feuille!.closest('.info-column')).toBeNull();
    // La page laisse sa place à la colonne de droite.
    expect(reserve(racine)).toBeGreaterThan(0);
    expect(racine.querySelector('.content-layout')!.classList.contains('file-sous-barre')).toBe(false);
  });

  it('🔴 « sous la barre » : la file se déplie sur place, sous la barre, sans colonne de droite', async () => {
    preferences.update((p) => ({ ...p, dispositionFile: 'sousLaBarre' }));
    const racine = await poser();

    // Fermée, aucune feuille n'attend hors champ : rien ne peut glisser.
    expect(racine.querySelector('.queue-sheet')).toBeNull();

    await ouvrirLaFile(racine);

    const colonne = racine.querySelector<HTMLElement>('.info-column');
    const feuille = colonne?.querySelector<HTMLElement>('.queue-sheet') ?? null;
    expect(feuille, 'aucune file dépliée dans la colonne titres').not.toBeNull();
    expect(feuille!.classList.contains('en-ligne')).toBe(true);
    expect(feuille!.classList.contains('wide-layout')).toBe(false);
    // Sous la barre : après le bouton de la file, dans la même colonne.
    const bouton = colonne!.querySelector('.queue-sheet-toggle')!;
    expect(bouton.compareDocumentPosition(feuille!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Une seule feuille, toute la file, et ni voile ni réserve à droite.
    expect(racine.querySelectorAll('.queue-sheet')).toHaveLength(1);
    expect(feuille!.querySelectorAll('.qs-item')).toHaveLength(FILE.length);
    expect(racine.querySelector('.qs-backdrop')).toBeNull();
    expect(reserve(racine)).toBe(0);
    // La colonne titres s'élargit.
    expect(racine.querySelector('.content-layout')!.classList.contains('file-sous-barre')).toBe(true);
  });
});
