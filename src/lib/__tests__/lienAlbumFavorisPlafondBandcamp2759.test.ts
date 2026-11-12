// @vitest-environment jsdom
//
// renesenses/tune-web-client#2759 (suite de #2749, reprise en rc12) — trois
// manques relevés à la relecture de la PR #2754 :
//   1. Favoris : au-delà de 40 titres de service, seuls les 40 premiers de la
//      FUSION recevaient un lien d'album, pas ceux affichés après tri ;
//   2. Bandcamp : un favori Bandcamp restait sans lien ;
//   3. preuve : le branchement n'était vérifié que par des expressions
//      régulières. Ici l'écran est MONTÉ et le lien constaté dans la colonne.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import FavoritesV2 from '../../components/v2/FavoritesV2.svelte';
import { albumsConnusDePistes, completerAlbumsDePistes, oublierAlbumsDesEcoutes } from '../albumDesEcoutes';
import { versPiste } from '../favorisFusionnes';
import { ouvertureAlbumDePiste } from '../lienAlbumDePiste';
import { currentProfileId, favoriteStreamingKeys, streamingFavKey } from '../stores/profile';
import { activeView, gestesNavigationService } from '../stores/navigation';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';

vi.setConfig({ testTimeout: 60_000 });

const gestes = () => ({ ouvrirAlbum: vi.fn(), ouvrirArtiste: vi.fn() }) as any;
const piste = (i: number) => ({ source: 'qobuz', source_id: String(i), album_title: `Album ${i}`, title: `T${i}` });

beforeEach(() => oublierAlbumsDesEcoutes());

describe('web#2759 point 1 — l’ordre de l’écran passe avant celui de la fusion', () => {
  it('🔴 avec un plafond, ce sont les pistes MONTRÉES qui sont demandées', async () => {
    const pistes = Array.from({ length: 50 }, (_, i) => piste(i));
    const affichees = [...pistes].reverse();
    const lire = vi.fn(async (_s: string, id: string) => ({ album_id: `A${id}` }));
    await completerAlbumsDePistes(pistes, lire, { plafond: 3, ordre: affichees });
    expect(lire.mock.calls.map((c) => c[1])).toEqual(['49', '48', '47']);
  });

  it('contre-épreuve : sans `ordre`, l’ordre de la fusion (comportement d’avant)', async () => {
    const pistes = Array.from({ length: 50 }, (_, i) => piste(i));
    const lire = vi.fn(async (_s: string, id: string) => ({ album_id: `A${id}` }));
    await completerAlbumsDePistes(pistes, lire, { plafond: 3 });
    expect(lire.mock.calls.map((c) => c[1])).toEqual(['0', '1', '2']);
  });

  it('`ordre` compare par service et identifiant (des copies conviennent), sans doublon', async () => {
    const pistes = [piste(1), piste(2)];
    const lire = vi.fn(async (_s: string, id: string) => ({ album_id: `A${id}` }));
    const maj = await completerAlbumsDePistes(pistes, lire, { ordre: [{ ...piste(2) }, { ...piste(2) }] });
    expect(lire.mock.calls.map((c) => c[1])).toEqual(['2', '1']);
    expect((maj![0] as any).album_id_service).toBe('A1');
  });
});

describe('web#2759 relecture du 12/11 — par paquets, et seulement ce qui se voit', () => {
  const avecAlbum = (pistes: any[]) => (albumsConnusDePistes(pistes) ?? pistes).filter((p: any) => p.album_id_service).length;

  it('🔴 les liens arrivent toutes les 40 réponses, sans attendre la dernière', async () => {
    const pistes = Array.from({ length: 100 }, (_, i) => piste(i));
    const vus: number[] = [];
    const lire = vi.fn(async (_s: string, id: string) => ({ album_id: `A${id}` }));
    await completerAlbumsDePistes(pistes, lire, { plafond: 100, paquet: 40, surPaquet: () => vus.push(avecAlbum(pistes)) });
    expect(vus).toEqual([40, 80]);
    expect(avecAlbum(pistes)).toBe(100);
  });

  it('🔴 `ordreSeul` : seules les pistes de l’écran sont demandées, pas le reste de la fusion', async () => {
    const pistes = Array.from({ length: 50 }, (_, i) => piste(i));
    const lire = vi.fn(async (_s: string, id: string) => ({ album_id: `A${id}` }));
    await completerAlbumsDePistes(pistes, lire, { plafond: 50, ordre: [piste(7), piste(3)], ordreSeul: true });
    expect(lire.mock.calls.map((c) => c[1])).toEqual(['7', '3']);
  });

  it('deux passages qui se chevauchent ne redemandent pas une piste en vol', async () => {
    const pistes = Array.from({ length: 6 }, (_, i) => piste(i));
    let lacher!: () => void;
    const porte = new Promise<void>((r) => { lacher = r; });
    const lire = vi.fn(async (_s: string, id: string) => { await porte; return { album_id: `A${id}` }; });
    const a = completerAlbumsDePistes(pistes, lire, { plafond: 4 });
    const b = completerAlbumsDePistes(pistes, lire, { plafond: 6 });
    lacher();
    await Promise.all([a, b]);
    expect(lire.mock.calls.map((c) => c[1]).sort()).toEqual(['0', '1', '2', '3', '4', '5']);
  });
});

describe('web#2759 point 2 — Bandcamp', () => {
  const fav = (extra: Record<string, unknown>) => versPiste({
    id: 1, profile_id: 1, item_type: 'track', service: 'bandcamp',
    service_id: 'https://artiste.bandcamp.com/track/t', title: 'T', artist: 'A', album: 'Disque', ...extra,
  } as any);

  it('🔴 l’album servi avec le favori devient le lien', () => {
    const g = gestes();
    const lien = ouvertureAlbumDePiste(fav({ album_id_service: 'https://artiste.bandcamp.com/album/disque' }), g);
    expect(lien, 'favori Bandcamp sans lien').not.toBeNull();
    lien!();
    expect(g.ouvrirAlbum).toHaveBeenCalledWith(expect.objectContaining({ service: 'bandcamp' }));
  });

  it('contre-épreuve : un serveur qui ne sert pas l’album laisse du texte', () => {
    expect(ouvertureAlbumDePiste(fav({}), gestes())).toBeNull();
  });
});

describe('web#2759 point 3 — l’écran Favoris monté', () => {
  let N = 45;
  const demandes: string[] = [];
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, unknown> | null = null;
  const respirer = (ms = 0) => new Promise((r) => setTimeout(r, ms));

  function corps(url: string): unknown {
    if (url.includes('/favorites/streaming')) {
      return Array.from({ length: N }, (_, i) => ({
        id: i + 1, profile_id: 1, item_type: 'track', service: 'qobuz', service_id: String(1000 + i),
        title: `Titre ${i}`, artist: 'Chicago', album: `Album ${i}`,
        first_seen_at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
      }));
    }
    const m = url.match(/\/streaming\/qobuz\/tracks\/(\d+)$/);
    if (m) { demandes.push(m[1]); return { album_id: `ALB${m[1]}`, artist_id: '7' }; }
    if (url.includes('/streaming/services')) return {};
    return [];
  }

  beforeEach(() => {
    N = 45;
    demandes.length = 0;
    locale.set('fr');
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (entree: RequestInfo | URL) => {
      const b = corps(String(entree));
      return {
        ok: true, status: 200, statusText: 'OK', headers: new Map([['content-type', 'application/json']]),
        json: async () => b, text: async () => JSON.stringify(b),
      } as unknown as Response;
    }));
    vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
    vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
    vi.stubGlobal('IntersectionObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => setTimeout(() => f(0), 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  beforeEach(() => {
    currentProfileId.set(1);
    favoriteStreamingKeys.set(new Set(Array.from({ length: N }, (_, i) => streamingFavKey('track', 'qobuz', String(1000 + i)))));
    gestesNavigationService.set(gestes());
    activeView.set('favorites' as any);
    preferences.update((p) => ({
      ...p,
      settingsLevel: 'expert' as never,
      v2Colonnes: { ...p.v2Colonnes, expert: ['title', 'artist', 'album'] as never },
    }));
  });

  afterEach(() => {
    if (monte) unmount(monte);
    hote?.remove();
    monte = null; hote = null;
    gestesNavigationService.set(null);
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('🔴 les 45 titres Qobuz reçoivent leur album, et la colonne Album est un lien', async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(FavoritesV2, { target: hote, props: {} as any });
    for (let i = 0; i < 30; i++) { await respirer(5); flushSync(); }
    const onglet = Array.from(hote.querySelectorAll<HTMLButtonElement>('.tabs button'))
      .find((b) => /titre|piste/i.test(b.textContent ?? ''));
    expect(onglet, 'onglet Titres introuvable — témoin sans objet').toBeTruthy();
    onglet!.click();
    for (let i = 0; i < 30; i++) { await respirer(5); flushSync(); }

    expect(new Set(demandes).size, 'plafond de 40 encore en place').toBe(N);
    // Tri « récent » : le dernier ajouté (1044) est montré en tête, il est demandé dans le premier lot.
    expect(demandes.slice(0, 3)).toContain('1044');
    const liens = hote.querySelectorAll('button.lien-album');
    expect(liens.length, 'aucun lien d’album dans la colonne Album').toBe(N);
    const g = gestes();
    gestesNavigationService.set(g);
    flushSync();
    (hote.querySelector('.trow button.lien-album') as HTMLButtonElement).click();
    expect(g.ouvrirAlbum).toHaveBeenCalledWith(expect.objectContaining({ service: 'qobuz', albumId: 'ALB1044' }));
  });

  it('🔴 120 titres : le premier chargement s’arrête à 80 (écran + tranche suivante), le défilement demande le reste', async () => {
    N = 120;
    favoriteStreamingKeys.set(new Set(Array.from({ length: N }, (_, i) => streamingFavKey('track', 'qobuz', String(1000 + i)))));
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(FavoritesV2, { target: hote, props: {} as any });
    for (let i = 0; i < 30; i++) { await respirer(5); flushSync(); }
    const onglet = Array.from(hote.querySelectorAll<HTMLButtonElement>('.tabs button'))
      .find((b) => /titre|piste/i.test(b.textContent ?? ''));
    onglet!.click();
    for (let i = 0; i < 30; i++) { await respirer(5); flushSync(); }
    expect(new Set(demandes).size, 'toutes les pistes demandées dès le chargement').toBe(80);
    expect(hote.querySelectorAll('button.lien-album').length).toBe(80);

    // La liste défile : ses dernières lignes entrent dans l'écran.
    const liste = hote.querySelector<HTMLDivElement>('.list')!;
    liste.getBoundingClientRect = () => ({ top: -2400, height: 3000, bottom: 600, left: 0, right: 0, width: 0, x: 0, y: -2400, toJSON() {} }) as DOMRect;
    window.dispatchEvent(new Event('scroll'));
    for (let i = 0; i < 30; i++) { await respirer(5); flushSync(); }
    expect(new Set(demandes).size).toBe(N);
    expect(hote.querySelectorAll('button.lien-album').length).toBe(N);
  });
});
