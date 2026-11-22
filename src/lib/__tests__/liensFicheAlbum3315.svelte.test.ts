// @vitest-environment jsdom
//
// web#3315 — sur le .18 (rc12), la fiche de l'album Qobuz « Oxygène (50th
// Anniversary Remastered Edition) » : l'année, le genre et le label n'étaient
// cliquables ni dans l'en-tête, ni dans « Album details », ni dans les
// colonnes Année / Genre des pistes. Même constat pour un album de la
// bibliothèque (inventaire #2770 : « Fiche album : année ❌ »).
//
// Les témoins MONTENT les composants et CLIQUENT : la colonne de la fiche,
// le tableau des pistes, la fiche entière d'un album Qobuz, et l'écran
// Streaming qui reçoit le genre demandé.
//
// Contre-épreuve : sur `origin/main` (ce269d7), `lib/liensFicheAlbum` n'existe
// pas, `ColonneAlbumV2` n'a pas `lienDetail` (les `dd` sont du texte),
// `ListePistesV2` n'a pas `lienCellule` et `StreamingV2` ignore
// `genreDeServiceDemande` : chaque témoin de rendu rougit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  getStreamingAlbumContext: vi.fn(),
  getStreamingAlbumTracks: vi.fn(),
  getStreamingAlbum: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import { entiteAnnee, entiteGenre, entiteLabel, menePart, ouvrirGenreDeService, type ContexteLiensFiche } from '../liensFicheAlbum';
import { partiesDEntite } from '../lienEntite';
import { activeView, pendingLibraryYear } from '../stores/navigation';
import { activeStreamingService, ficheLabelService, genreDeServiceDemande } from '../stores/streaming';
import { preferences } from '../stores/preferences';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { oublierMemoireStreaming } from '../memoireStreaming';
import { t } from '../i18n';
import ColonneAlbumV2 from '../../components/v2/ColonneAlbumV2.svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import StreamingV2 from '../../components/v2/StreamingV2.svelte';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const QOBUZ: ContexteLiensFiche = {
  local: false,
  service: 'qobuz',
  genreService: { id: '64', nom: 'Électronique' },
  labelService: { id: '1150', nom: 'BMG Rights Management France SARL' },
  genresAffiches: ['électronique'],
};
const TIDAL: ContexteLiensFiche = { local: false, service: 'tidal', genreService: null, labelService: null };
const LOCAL: ContexteLiensFiche = { local: true, service: null, genreService: null, labelService: null };

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const urls: string[] = [];
function corpsPour(u: string): unknown {
  if (/\/streaming\/services/.test(u)) return { qobuz: { enabled: true, authenticated: true, username: 'Bertrand' } };
  if (/\/streaming\/qobuz\/genres\/64\/albums/.test(u)) {
    return [{ source: 'qobuz', source_id: 'g1', title: 'Équinoxe', artist_name: 'Jean-Michel Jarre', cover_path: null }];
  }
  if (/\/streaming\/qobuz\/genres(\?|$)/.test(u)) return [{ id: '64', name: 'Électronique' }, { id: '80', name: 'Jazz' }];
  if (/\/config/.test(u)) return {};
  return [];
}

async function laisserFaire(n = 40, jusqua?: () => boolean) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    if (jusqua?.()) return;
  }
}

let hote: HTMLDivElement;
let monte: Record<string, any> | null = null;
let prefsAvant = get(preferences);

beforeEach(() => {
  prefsAvant = get(preferences);
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  urls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    urls.push(u);
    if (/\/ext\/bandcamp\/tags/.test(u)) throw new Error('extension absente');
    return reponse(corpsPour(u));
  }));
  (Element.prototype as any).scrollIntoView = () => {};
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('streamingalbum');
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* hors sujet */ } }
  monte = null;
  hote.remove();
  document.body.innerHTML = '';
  for (const m of Object.values(mocks)) m.mockReset();
  preferences.set(prefsAvant);
  genreDeServiceDemande.set(null);
  ficheLabelService.set(null);
  pendingLibraryYear.set(null);
  activeStreamingService.set(null as any);
  activeView.set('home');
  detailOuvert.set(null);
  ongletCourant.set(null);
  oublierMemoireStreaming();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (Element.prototype as any).scrollIntoView;
});

const liens = (racine: ParentNode) => Array.from(racine.querySelectorAll<HTMLElement>('[role="link"]'));
const lienDeTexte = (racine: ParentNode, texte: string) => liens(racine).find((l) => (l.textContent ?? '').trim() === texte) ?? null;

describe('où mènent l’année, le genre et le label d’une fiche', () => {
  it('album Qobuz : genre → page du genre, label → page du label, année → texte', () => {
    expect(menePart(entiteGenre(QOBUZ, 'Électronique'))).toBe(true);
    expect(menePart(entiteLabel(QOBUZ, 'BMG Rights Management France SARL'))).toBe(true);
    expect(menePart(entiteAnnee(QOBUZ, 2026, '2026')), 'pas de « Bibliothèque › 2026 » pour un album Qobuz').toBe(false);
    // Le seul genre affiché est celui du service, même si Qobuz le nomme autrement.
    expect(menePart(entiteGenre({ ...QOBUZ, genreService: { id: '64', nom: 'Electronic' } }, 'Électronique'))).toBe(true);
  });

  it('contre-épreuve : un autre genre que celui du service, ou un service sans contexte, reste du texte', () => {
    expect(menePart(entiteGenre({ ...QOBUZ, genresAffiches: ['électronique', 'ambient'] }, 'Ambient'))).toBe(false);
    expect(menePart(entiteGenre(TIDAL, 'Pop'))).toBe(false);
    expect(menePart(entiteLabel(TIDAL, 'Columbia'))).toBe(false);
    expect(entiteGenre(QOBUZ, '  ')).toBeNull();
    expect(partiesDEntite(entiteGenre(TIDAL, 'Pop'))).toEqual([{ texte: 'Pop', ouvrir: null }]);
  });

  it('album de la bibliothèque : année, genre et label mènent à la Bibliothèque', () => {
    expect(menePart(entiteAnnee(LOCAL, 1976, '1976'))).toBe(true);
    expect(menePart(entiteGenre(LOCAL, 'Electronic'))).toBe(true);
    expect(menePart(entiteLabel(LOCAL, 'Dreyfus'))).toBe(true);
    expect(menePart(entiteAnnee(LOCAL, null, '?'))).toBe(false);
    activeView.set('library');
    partiesDEntite(entiteAnnee(LOCAL, 1976, '1976'))[0].ouvrir!();
    expect(get(pendingLibraryYear)).toBe(1976);
  });

  it('ouvrir le genre d’un service : la demande, le service et l’écran Streaming', () => {
    ouvrirGenreDeService({ service: 'qobuz', id: '64', nom: 'Électronique' });
    expect(get(genreDeServiceDemande)).toEqual({ service: 'qobuz', id: '64', nom: 'Électronique' });
    expect(get(activeStreamingService)).toBe('qobuz');
    expect(get(activeView)).toBe('streaming');
    genreDeServiceDemande.set(null);
    activeView.set('streamingalbum');
    ouvrirGenreDeService({ service: 'qobuz', id: ' ', nom: 'X' });
    expect(get(genreDeServiceDemande)).toBeNull();
    expect(get(activeView)).toBe('streamingalbum');
  });
});

describe('« Album details » : Genre et Label cliquables', () => {
  const props = (lienDetail: any) => ({
    album: { id: null, title: 'Oxygène', source: 'qobuz', genre: 'Électronique', label: 'BMG Rights Management France SARL' } as any,
    artistId: null, nomArtiste: 'Jean-Michel Jarre', annee: '2026', pistes: [], avecCredits: false, onAlbum: () => {},
    lienDetail,
  });

  it('album Qobuz : le label ouvre la page Label, le genre la page du genre, Release reste du texte', async () => {
    const lienDetail = (cle: string, v: string) =>
      cle.endsWith('.genre') ? entiteGenre(QOBUZ, v) : cle.endsWith('.label') ? entiteLabel(QOBUZ, v) : entiteAnnee(QOBUZ, 2026, v);
    monte = mount(ColonneAlbumV2, { target: hote, props: props(lienDetail) });
    await laisserFaire(6);
    const details = hote.querySelector('[data-bloc-details]')!;
    expect(details, 'le bloc « Album details » manque').not.toBeNull();
    expect(details.querySelector('[data-detail="v2.album.fiche.release"] [role="link"]')).toBeNull();
    const label = lienDeTexte(details, 'BMG Rights Management France SARL');
    expect(label, 'le label n’est pas un lien').not.toBeNull();
    expect(label!.tabIndex).toBe(0);
    label!.click();
    expect(get(activeView)).toBe('streaminglabel');
    expect(get(ficheLabelService)).toMatchObject({ service: 'qobuz', id: '1150' });
    activeView.set('streamingalbum');
    const genre = lienDeTexte(details, 'Électronique');
    expect(genre, 'le genre n’est pas un lien').not.toBeNull();
    genre!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(get(activeView)).toBe('streaming');
    expect(get(genreDeServiceDemande)).toMatchObject({ service: 'qobuz', id: '64' });
  });

  it('contre-épreuve : sans destination fournie, les détails restent du texte', async () => {
    monte = mount(ColonneAlbumV2, { target: hote, props: props(null) });
    await laisserFaire(6);
    const details = hote.querySelector('[data-bloc-details]')!;
    expect(details.textContent).toContain('BMG Rights Management France SARL');
    expect(liens(details)).toHaveLength(0);
  });
});

describe('colonnes Année et Genre des pistes', () => {
  const PISTE = { id: null, source: 'qobuz', source_id: 't1', title: 'Oxygène, Pt. 1', artist_name: 'Jean-Michel Jarre', year: 2026, genre: 'Électronique', duration_ms: 1000 } as any;
  beforeEach(() => {
    preferences.update((p: any) => ({ ...p, settingsLevel: 'expert', v2Colonnes: { ...(p.v2Colonnes ?? {}), expert: ['num', 'title', 'year', 'genre'] } }));
  });

  it('le genre mène à la page du genre ; l’année d’une piste Qobuz reste du texte', () => {
    const lienCellule = (p: any, _i: number, cle: string, v: string) => {
      const e = cle === 'genre' ? entiteGenre(QOBUZ, v) : cle === 'year' ? entiteAnnee(QOBUZ, p.year, v) : null;
      return menePart(e) ? e : null;
    };
    monte = mount(ListePistesV2, { target: hote, props: { pistes: [PISTE], onLire: () => {}, lienCellule } as any });
    flushSync();
    const cellule = hote.querySelector('[data-lien-cellule="genre"]');
    expect(cellule, 'la colonne Genre n’est pas un lien').not.toBeNull();
    expect(hote.querySelector('[data-lien-cellule="year"]')).toBeNull();
    (cellule!.querySelector('[role="link"]') as HTMLElement).click();
    expect(get(activeView)).toBe('streaming');
    expect(get(genreDeServiceDemande)).toMatchObject({ service: 'qobuz', id: '64' });
  });

  it('contre-épreuve : sans `lienCellule`, les cellules restent du texte', () => {
    monte = mount(ListePistesV2, { target: hote, props: { pistes: [PISTE], onLire: () => {} } as any });
    flushSync();
    expect(hote.textContent).toContain('Électronique');
    expect(hote.querySelector('[data-lien-cellule]')).toBeNull();
  });
});

describe('la fiche d’un album Qobuz, montée', () => {
  it('en-tête, détails et pistes : le genre lu sur le contexte Qobuz devient un lien', async () => {
    preferences.update((p: any) => ({ ...p, settingsLevel: 'expert', v2Colonnes: { ...(p.v2Colonnes ?? {}), expert: ['num', 'title', 'year', 'genre'] } }));
    mocks.getStreamingAlbumContext.mockResolvedValue({ genre_id: '64', genre_name: 'Électronique', label_id: '1150', label_name: 'BMG Rights Management France SARL' });
    mocks.getStreamingAlbumTracks.mockResolvedValue([
      { id: null, source: 'qobuz', source_id: 't1', title: 'Oxygène, Pt. 1', artist_name: 'Jean-Michel Jarre', year: 2026, genre: 'Électronique', duration_ms: 1000, track_number: 1 },
    ]);
    mocks.getStreamingAlbum.mockResolvedValue({});
    const album = {
      id: null, title: 'Oxygène (50th Anniversary Remastered Edition)', source: 'qobuz', source_id: 'oxy50',
      artist_name: 'Jean-Michel Jarre', cover_path: '/c.jpg', year: 2026, genre: 'Électronique',
    } as any;
    monte = mount(AlbumDetailV2, { target: hote, props: { album, service: 'qobuz', onClose: () => {} } });
    await laisserFaire(60, () => !!hote.querySelector('[data-lien-cellule="genre"]'));
    expect(mocks.getStreamingAlbumContext).toHaveBeenCalledWith('qobuz', 'oxy50');
    const enTete = hote.querySelector('[data-genre-album]');
    expect(enTete?.querySelector('[role="link"]'), 'le genre de l’en-tête n’est pas un lien').not.toBeNull();
    expect(hote.querySelector('[data-annee-album] [role="link"]'), 'l’année d’un album Qobuz ne mène nulle part').toBeNull();
    expect(hote.querySelector('[data-detail="v2.album.fiche.genre"] [role="link"]')).not.toBeNull();
    expect(hote.querySelector('[data-lien-label-qobuz]'), 'le lien « Label » de #2379 reste').not.toBeNull();
    (hote.querySelector('[data-lien-cellule="genre"] [role="link"]') as HTMLElement).click();
    expect(get(genreDeServiceDemande)).toMatchObject({ service: 'qobuz', id: '64' });
    expect(get(activeView)).toBe('streaming');
  });
});

describe('l’écran Streaming ouvre le genre demandé', () => {
  it('Qobuz › Genres › Électronique : ses albums, demande consommée', async () => {
    ouvrirGenreDeService({ service: 'qobuz', id: '64', nom: 'Électronique' });
    monte = mount(StreamingV2 as any, { target: hote });
    await laisserFaire(150, () => (hote.querySelector('.crumb .cur')?.textContent ?? '') === 'Électronique'
      && urls.some((u) => /\/streaming\/qobuz\/genres\/64\/albums/.test(u)));
    expect(hote.querySelector('.crumb .cur')?.textContent).toBe('Électronique');
    expect(urls.some((u) => /\/streaming\/qobuz\/genres\/64\/albums/.test(u))).toBe(true);
    expect(get(genreDeServiceDemande)).toBeNull();
    const genres = get(t)('common.genres' as any);
    const onglet = Array.from(hote.querySelectorAll('nav.subs > button')).find((b) => (b.textContent ?? '').trim() === genres);
    expect(onglet?.className ?? '').toMatch(/active|on/);
  });

  it('contre-épreuve : sans demande, l’écran s’ouvre sur l’éditorial, aucun genre', async () => {
    activeStreamingService.set('qobuz');
    activeView.set('streaming');
    monte = mount(StreamingV2 as any, { target: hote });
    await laisserFaire(60);
    expect(hote.querySelector('.crumb .cur')).toBeNull();
    expect(urls.some((u) => /\/genres\/64\/albums/.test(u))).toBe(false);
  });
});
