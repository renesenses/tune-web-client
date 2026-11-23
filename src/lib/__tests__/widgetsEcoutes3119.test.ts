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
import { CLE_REGLAGE, oublierSas, sasEcouterPlusTard } from '../ecouterPlusTard';
import { get } from 'svelte/store';
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
  // Fil forum 3009 (point 14) — le widget lit les TITRES : un titre local
  // dont le serveur donne l'album, un titre Qobuz qui n'a que sa paire.
  top_tracks: [
    { track_id: 301, title: 'Le Courage des oiseaux', artist_name: 'Dominique A', cover_path: 'c1', plays: 25, listening_ms: 1, album_id: 12 },
    { track_id: null, title: 'An Ending (Ascent)', artist_name: 'Brian Eno', cover_path: 'c2', plays: 7, listening_ms: 1, source: 'qobuz', source_id: 'q88' },
  ],
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

// 🔄 Fil forum 3009 (FabienM, point 14 ; go du 23/11/2026) — le widget montre
// les TITRES les plus écoutés et s'appelle « Titres les plus écoutés ».
// Contre-épreuve : `accueilWidgets.ts` remis à `origin/main`, les épreuves
// « titres » et « sans étiquette » rougissent (il rendait les deux albums).
describe('web#3119 / fil 3009 — « Titres les plus écoutés »', () => {
  it('existe, et ne s’impose pas sur l’accueil de tout le monde', () => {
    const w = widgetParId('ecoutes-frequentes');
    expect(w?.forme).toBe('bande');
    expect(w?.cleTitre).toBe('v2.home.wFrequent');
    expect(DISPOSITION_DEFAUT).not.toContain('ecoutes-frequentes');
  });

  it('🔴 fil 3009 — lit les TITRES les plus écoutés sur TRENTE jours, pas les albums', async () => {
    sasPeuple();
    const els = await widgetParId('ecoutes-frequentes')!.charger(ctx);
    const appel = requetes.find((r) => r.url.includes('/history/dashboard'));
    expect(appel?.url).toContain('period=30d');
    expect(els.map((e) => e.titre)).toEqual(['Le Courage des oiseaux', 'An Ending (Ascent)']);
    expect(els.map((e) => e.sous)).toEqual(['Dominique A', 'Brian Eno']);
    // Aucun album du classement ne s'y glisse.
    expect(els.map((e) => e.titre)).not.toContain('La Fossette');
    // Chacun se joue : le titre LOCAL par son identifiant, et il ouvre son
    // album quand le serveur le donne ; le titre Qobuz par sa paire.
    expect(typeof els[0].jouer).toBe('function');
    expect(typeof els[1].jouer).toBe('function');
    expect(els[0].ouvrir).toBe('album');
    expect(els[0].fiche?.id).toBe(12);
    expect(els[1].ouvrir).toBeUndefined();
  });

  it('🔴 fil 3009 — un titre ne porte pas d’étiquette ALBUM (« pour les titres laissez tel quel »)', async () => {
    sasPeuple();
    const page = await poser('ecoutes-frequentes');
    expect(page.querySelectorAll('.carte')).toHaveLength(2);
    expect(page.querySelectorAll('.carte .cn')).toHaveLength(0);
  });

  it('🔴 fil 3009 — s’appelle « Titres les plus écoutés », et chaque langue a changé son libellé', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const dossier = resolve(__dirname, '../locales');
    const fr = readFileSync(resolve(dossier, 'fr.ts'), 'utf8');
    expect(fr).toContain('"v2.home.wFrequent": "Titres les plus écoutés"');
    // Les anciens libellés « albums » / « écoutes » ne survivent nulle part.
    const ANCIENS = ['Écoutes fréquentes', 'Frequently played', 'Häufig gehört', 'Escuchas frecuentes',
      'Ascolti frequenti', 'よく聴くアルバム', '자주 듣는 앨범', '常听专辑', '經常播放'];
    const langues = readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues.length).toBeGreaterThanOrEqual(20);
    for (const f of langues) {
      const m = /"v2\.home\.wFrequent": "([^"]+)"/.exec(readFileSync(resolve(dossier, f), 'utf8'));
      expect(m, f).not.toBeNull();
      expect(ANCIENS, `${f} garde l’ancien libellé`).not.toContain(m![1]);
    }
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

  it('🔴 le widget passe le SIGNAL de sa page aux trois lectures du sas', async () => {
    sasPeuple();
    const ctl = new AbortController();
    await widgetParId('ecouter-plus-tard')!.charger({ ...ctx, signal: ctl.signal });
    const appels = vi.mocked(fetch).mock.calls.filter(([u]) => /\/tags\/7\/(albums|tracks|playlists)/.test(String(u)));
    // `chargerSas()` lit aussi les membres (sans signal : il sert tout
    // l'écran) ; les trois lectures DU WIDGET portent le signal de la page.
    const avecSignal = appels.filter(([, init]) => (init as RequestInit | undefined)?.signal === ctl.signal);
    expect(avecSignal.map(([u]) => String(u).split('/').pop())).toEqual(['albums', 'tracks', 'playlists']);
  });

  it('🔴 un dépôt dans le sas RECHARGE la bande', async () => {
    sasPeuple();
    await poser('ecouter-plus-tard');
    const avant = requetes.filter((r) => r.url.includes('/tags/7/albums')).length;
    const etat = get(sasEcouterPlusTard);
    sasEcouterPlusTard.set({ ...etat, membres: new Set([...etat.membres, 'l:album:99']) });
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    expect(requetes.filter((r) => r.url.includes('/tags/7/albums')).length).toBeGreaterThan(avant);
  });
});
