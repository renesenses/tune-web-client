// @vitest-environment jsdom
//
// web#1836 — FabienM (fil 2057, point 1), 0.9.169 Windows : « Lecture en
// cours : la file d'attente est incomplète (seulement 5 titres), alors que la
// vraie liste d'attente en comporte 8 ». Le bandeau annonçait « 9 à suivre »
// au-dessus d'une liste « À suivre » de 5 titres, sans rien dessous.
//
// Règle retenue (go de Bertrand, 30/09/2026) : l'aperçu garde 5 titres, et une
// ligne « + N autres titres » posée dessous déplie la file, comme le bandeau.
// La ligne est absente quand l'aperçu montre déjà tout.
//
// Le témoin MONTE l'écran (disposition large), lit le DOM et clique la ligne.
//
// CONTRE-ÉPREUVE (jouée sur Shrek) : sans le bloc `{#if $upNextHiddenCount > 0}`
// de `NowPlaying.svelte`, 5 témoins sur 7 rougissent (les trois libellés et les
// deux dépliages) ; sans la soustraction de `UP_NEXT_APERCU` dans
// `upNextHiddenCount` (`queue.ts`), 5 sur 7 aussi (le magasin, les libellés,
// et « pile 5 à suivre » qui affiche alors une ligne de trop).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import {
  queueTracks,
  queuePosition,
  upNextTracks,
  upNextCount,
  upNextHiddenCount,
  UP_NEXT_APERCU,
} from '../stores/queue';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';

/** La file des captures : It's No Good, puis 9 titres à suivre. */
function file(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: 900 + i,
    title: `Titre ${i + 1}`,
    artist_name: 'Depeche Mode',
    source: 'qobuz',
    duration_ms: 240_000,
  }));
}

const PISTE = {
  track_id: 900, album_id: 5, artist_id: 3,
  title: 'Titre 1', artist_name: 'Depeche Mode', album_title: 'Memento Mori',
  source: 'qobuz', duration_ms: 240_000,
};

let FILE = file(10);
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

async function poser(n: number): Promise<HTMLElement> {
  FILE = file(n);
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 1000 }] as any);
  currentZoneId.set(1);
  queueTracks.set(FILE as any);
  queuePosition.set(0);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  await respirer();
  queueTracks.set(FILE as any);
  queuePosition.set(0);
  flushSync();
  const racine = hote.querySelector<HTMLElement>('.now-playing');
  expect(racine, 'racine de l’écran introuvable — témoin sans objet').not.toBeNull();
  expect(racine!.querySelector('.up-next'), 'aperçu « À suivre » absent — témoin sans objet').not.toBeNull();
  return racine!;
}

const ligneSuite = (racine: HTMLElement) => racine.querySelector<HTMLButtonElement>('.up-next .up-next-more');

beforeAll(() => {
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
  queuePosition.set(0);
  preferences.update((p) => ({ ...p, dispositionFile: 'droite' }));
  vi.unstubAllGlobals();
});

describe('web#1836 — le magasin compte ce que l’aperçu ne montre pas', () => {
  it('9 à suivre : 5 dans l’aperçu, 4 cachés ; 5 ou moins : aucun caché', () => {
    expect(UP_NEXT_APERCU).toBe(5);

    queueTracks.set(file(10) as any);
    queuePosition.set(0);
    expect(get(upNextCount)).toBe(9);
    expect(get(upNextTracks)).toHaveLength(5);
    expect(get(upNextHiddenCount)).toBe(4);

    // Plus loin dans la file : 3 à suivre, rien de caché.
    queuePosition.set(6);
    expect(get(upNextTracks)).toHaveLength(3);
    expect(get(upNextHiddenCount)).toBe(0);

    // Pile 5 à suivre : l'aperçu montre tout.
    queueTracks.set(file(6) as any);
    queuePosition.set(0);
    expect(get(upNextTracks)).toHaveLength(5);
    expect(get(upNextHiddenCount)).toBe(0);

    // Dernier titre : rien à suivre, et jamais un compte négatif.
    queuePosition.set(5);
    expect(get(upNextHiddenCount)).toBe(0);
    queueTracks.set([]);
  });
});

describe('web#1836 — la ligne « + N autres titres » sous l’aperçu', () => {
  it('🔴 le cas de FabienM : « 9 à suivre », 5 titres, puis « + 4 autres titres »', async () => {
    const racine = await poser(10);
    expect(racine.querySelectorAll('.up-next-item')).toHaveLength(5);
    const ligne = ligneSuite(racine);
    expect(ligne, 'rien sous le cinquième titre : l’aperçu ne dit pas qu’il en reste').not.toBeNull();
    expect(ligne!.textContent!.trim()).toBe('+ 4 autres titres');
    // Posée APRÈS les 5 titres.
    const dernier = racine.querySelectorAll('.up-next-item')[4];
    expect(dernier.compareDocumentPosition(ligne!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('un seul titre de plus : le singulier', async () => {
    const racine = await poser(7);
    expect(ligneSuite(racine)?.textContent?.trim()).toBe('+ 1 autre titre');
  });

  it('pile 5 à suivre, ou moins : pas de ligne', async () => {
    let racine = await poser(6);
    expect(racine.querySelectorAll('.up-next-item')).toHaveLength(5);
    expect(ligneSuite(racine)).toBeNull();
    unmount(monte!);
    monte = null;
    hote?.remove();

    racine = await poser(3);
    expect(racine.querySelectorAll('.up-next-item')).toHaveLength(2);
    expect(ligneSuite(racine)).toBeNull();
  });

  it('suit la langue : en anglais, « + 4 more tracks »', async () => {
    locale.set('en');
    await respirer();
    const racine = await poser(10);
    expect(ligneSuite(racine)?.textContent?.trim()).toBe('+ 4 more tracks');
  });

  for (const disposition of ['droite', 'sousLaBarre'] as const) {
    it(`🔴 un clic déplie la file entière, comme le bandeau (« ${disposition} »)`, async () => {
      preferences.update((p) => ({ ...p, dispositionFile: disposition }));
      const racine = await poser(10);
      expect(racine.querySelector('.queue-sheet-chevron')!.classList.contains('rotated')).toBe(false);

      ligneSuite(racine)!.click();
      flushSync();
      await respirer();
      flushSync();

      // Le bandeau porte le même état : chevron retourné, aperçu remplacé.
      expect(racine.querySelector('.queue-sheet-chevron')!.classList.contains('rotated')).toBe(true);
      expect(racine.querySelector('.up-next')).toBeNull();
      const feuille = racine.querySelector<HTMLElement>('.queue-sheet');
      expect(feuille, 'la file ne s’est pas dépliée').not.toBeNull();
      expect(feuille!.querySelectorAll('.qs-item')).toHaveLength(10);
    });
  }
});
