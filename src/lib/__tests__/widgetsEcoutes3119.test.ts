// @vitest-environment jsdom
//
// web#3119 (FabienM, fil 2864, points 7 et 12 ; go de Bertrand du 16/11/2026)
// — deux widgets d'accueil, « Écoutes fréquentes » et « Écouter plus tard »,
// et l'étiquette ALBUM (ou PLAYLIST) sur leurs vignettes.
//
// Ce que ces témoins gardent :
//  - « Écoutes fréquentes » lit les ALBUMS les plus écoutés sur trente jours,
//    dans la réponse partagée du tableau de bord (aucune route neuve) ;
//  - « Écouter plus tard » MONTRE le sas de web#1653 — même étiquette, mêmes
//    lectures — et, sans sas, ne crée RIEN ;
//  - l'étiquette est PEINTE sur la vignette d'un album et d'une playlist, et
//    absente sur un titre (« pour les titres laissez tel quel ») ;
//  - les deux widgets ne s'imposent pas : hors de la disposition par défaut.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { DISPOSITION_DEFAUT, widgetParId, type Element } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { CLE_REGLAGE, oublierSas } from '../ecouterPlusTard';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const TABLEAU = {
  period: '30d',
  range: { from: null, to: '' },
  totals: { plays: 10, listening_ms: 1, unique_tracks: 3, unique_artists: 2 },
  top_artists: [],
  top_albums: [
    { album_title: 'La Fossette', artist_name: 'Dominique A', cover_path: 'c1', plays: 40, album_id: 12 },
    { album_title: 'Ambient 1', artist_name: 'Brian Eno', cover_path: 'c2', plays: 9, album_id: null, source: 'qobuz', source_id: '777' },
  ],
  top_tracks: [],
  trend: [],
  hourly: [],
  by_zone: [],
  by_source: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
};

interface Requete { method: string; url: string }
let requetes: Requete[] = [];
/** Réponse par motif, le premier qui appareille gagne. */
let reponses: [string, unknown][] = [];

function sasPeuple(tagId = 7) {
  reponses = [
    ['/history/dashboard', TABLEAU],
    ['/profiles/1/settings', { [CLE_REGLAGE]: tagId }],
    [`/tags/${tagId}/albums`, { albums: [
      { id: 11, title: 'Rock Bottom', artist_name: 'Robert Wyatt', cover_path: 'rb', tagged_at: '2026-11-10 10:00:00' },
    ], count: 1 }],
    [`/tags/${tagId}/tracks`, { tracks: [
      { id: 501, title: 'Sea Song', artist_name: 'Robert Wyatt', album_id: 11, tagged_at: '2026-11-12 10:00:00' },
    ], count: 1 }],
    [`/tags/${tagId}/playlists`, { playlists: [
      { id: null, name: 'Jazz du dimanche', source: 'qobuz', source_id: '9090', cover_path: 'pl', tagged_at: '2026-11-14 10:00:00' },
    ], count: 1 }],
    ['/tags', [{ id: tagId, name: 'Écouter plus tard', color: '#808080' }]],
  ];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poser(id: string): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [widgetParId(id)!], dispositionDefaut: [id], cle: `essai_3119_${Math.random()}` },
  });
  for (let i = 0; i < 30; i++) await respirer();
  flushSync();
  return hote;
}

const ctx = { profileId: 1, albums: [], zones: [], langue: 'fr' };

beforeEach(() => {
  requetes = [];
  reponses = [];
  locale.set('fr');
  oublierSas();
  currentProfileId.set(1);
  currentZoneId.set(1);
  activeView.set('home' as never);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    requetes.push({ method, url });
    const trouve = reponses.find(([motif]) => url.includes(motif));
    const charge = trouve ? trouve[1] : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  oublierSas();
  currentProfileId.set(null);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('web#3119 — « Écoutes fréquentes »', () => {
  it('existe, et ne s’impose pas sur l’accueil de tout le monde', () => {
    const w = widgetParId('ecoutes-frequentes');
    expect(w?.forme).toBe('bande');
    expect(w?.cleTitre).toBe('v2.home.wFrequent');
    expect(DISPOSITION_DEFAUT).not.toContain('ecoutes-frequentes');
  });

  it('🔴 lit les albums les plus écoutés sur TRENTE jours, étiquetés ALBUM', async () => {
    sasPeuple();
    const els = await widgetParId('ecoutes-frequentes')!.charger(ctx);
    const appel = requetes.find((r) => r.url.includes('/history/dashboard'));
    expect(appel?.url).toContain('period=30d');
    expect(els.map((e) => e.titre)).toEqual(['La Fossette', 'Ambient 1']);
    expect(els.every((e) => e.nature === 'album')).toBe(true);
    // L'album de la bibliothèque s'OUVRE ; celui du service se joue.
    expect(els[0].ouvrir).toBe('album');
    expect(els[0].fiche?.id).toBe(12);
    expect(typeof els[1].jouer).toBe('function');
  });

  it('🔴 l’étiquette ALBUM est peinte sur la vignette', async () => {
    sasPeuple();
    const page = await poser('ecoutes-frequentes');
    const etiquettes = [...page.querySelectorAll('.carte .cn')];
    expect(etiquettes).toHaveLength(2);
    expect(etiquettes[0].getAttribute('data-nature')).toBe('album');
    expect(etiquettes[0].textContent?.trim()).toBe('Album');
  });
});

describe('web#3119 — « Écouter plus tard »', () => {
  it('existe, sous le nom de l’écran du sas, hors du défaut', () => {
    const w = widgetParId('ecouter-plus-tard');
    expect(w?.forme).toBe('bande');
    expect(w?.cleTitre).toBe('v2.home.wLater');
    expect(DISPOSITION_DEFAUT).not.toContain('ecouter-plus-tard');
  });

  it('🔴 montre le sas, dépôt le plus récent d’abord, ALBUM / PLAYLIST / rien sur le titre', async () => {
    sasPeuple();
    const els: Element[] = await widgetParId('ecouter-plus-tard')!.charger(ctx);
    expect(els.map((e) => e.titre)).toEqual(['Jazz du dimanche', 'Sea Song', 'Rock Bottom']);
    expect(els.map((e) => e.nature ?? null)).toEqual(['playlist', null, 'album']);
    // La playlist de service s'ouvre dans sa fiche, l'album local dans la sienne.
    expect(els[0].ouvrir).toBe('playlist');
    expect(els[0].playlist?.source_id).toBe('9090');
    expect(els[2].fiche?.id).toBe(11);
  });

  it('contre-épreuve : sans sas, rien — et AUCUNE étiquette n’est créée', async () => {
    reponses = [['/profiles/1/settings', {}], ['/tags', []]];
    const els = await widgetParId('ecouter-plus-tard')!.charger(ctx);
    expect(els).toEqual([]);
    expect(requetes.some((r) => r.method === 'POST')).toBe(false);
  });

  it('🔴 les étiquettes sont peintes : PLAYLIST, rien, ALBUM', async () => {
    sasPeuple();
    const page = await poser('ecouter-plus-tard');
    const cartes = [...page.querySelectorAll('.carte')];
    expect(cartes).toHaveLength(3);
    expect(cartes.map((c) => c.querySelector('.cn')?.getAttribute('data-nature') ?? null))
      .toEqual(['playlist', null, 'album']);
    expect(cartes[0].querySelector('.cn')?.textContent?.trim()).toBe('Playlist');
  });
});
