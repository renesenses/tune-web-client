// @vitest-environment jsdom
//
// Phase 5 (web#1257) — « aucune perte d'accès ». Domaine « Autres » de
// l'inventaire `docs/capacites-sans-chemin-phase5.md`, et les orphelines de
// nom dont le CHAMP n'était pas atteint :
//
//  - bandcampAllCollection     → StreamingV2, « Ma collection » complète
//  - forceRefetchArtistImages  → SettingsV2, Bibliothèque › Enrichissement
//  - rescanArtwork             → SettingsV2, Bibliothèque › Enrichissement
//  - importLinnPlaylist        → PlaylistsV2, import d'un `.dpl`
//  - getAlbumDynamicRanges et getAllAlbumsSeeded → LibraryV2, tranche de DR
//    et tri aléatoire
//  - changeZoneOutput, deleteAllZones → ZonesV2 (vue liste)
//
// 🔴 Chaque témoin MONTE l'écran v2 et fait le GESTE. Aucun ne lit le source :
// un test qui chercherait le nom de la fonction dans un fichier resterait vert
// sur un appel débranché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.setConfig({ testTimeout: 30_000 });

const espions = {
  bandcampAllCollection: vi.fn(),
  forceRefetchArtistImages: vi.fn(),
  rescanArtwork: vi.fn(),
  importLinnPlaylist: vi.fn(),
  importPlaylistFile: vi.fn(),
  getAlbumDynamicRanges: vi.fn(),
  getAllAlbumsSeeded: vi.fn(),
  changeZoneOutput: vi.fn(),
  deleteAllZones: vi.fn(),
};

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return {
    ...reel,
    bandcampAllCollection: (...a: any[]) => espions.bandcampAllCollection(...a),
    forceRefetchArtistImages: (...a: any[]) => espions.forceRefetchArtistImages(...a),
    rescanArtwork: (...a: any[]) => espions.rescanArtwork(...a),
    importLinnPlaylist: (...a: any[]) => espions.importLinnPlaylist(...a),
    importPlaylistFile: (...a: any[]) => espions.importPlaylistFile(...a),
    getAlbumDynamicRanges: (...a: any[]) => espions.getAlbumDynamicRanges(...a),
    getAllAlbumsSeeded: (...a: any[]) => espions.getAllAlbumsSeeded(...a),
    changeZoneOutput: (...a: any[]) => espions.changeZoneOutput(...a),
    deleteAllZones: (...a: any[]) => espions.deleteAllZones(...a),
  };
});

import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { zones, currentZoneId } from '../stores/zones';
import { albums as albumsStore } from '../stores/library';
import { locale } from '../i18n';
import lFr from '../locales/fr';
const fr = lFr as unknown as Record<string, string>;

class Inerte { observe() {} unobserve() {} disconnect() {} }

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let routes: (u: string, m: string) => unknown = () => ({});
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  for (const f of Object.values(espions)) f.mockReset();
  locale.set('fr');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('ResizeObserver', Inerte as any);
  vi.stubGlobal('IntersectionObserver', Inerte as any);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => reponse(routes(String(url), (init?.method ?? 'GET').toUpperCase()))));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* hors sujet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  zones.set([]);
  currentZoneId.set(null);
  albumsStore.set([]);
  vi.unstubAllGlobals();
});

async function respirer(n = 20) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
const boutonTexte = (texte: string) =>
  [...hote!.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent ?? '').trim() === texte);

// ---------------------------------------------------------------------------
describe('Bandcamp — « Ma collection » lit TOUTES les pages', () => {
  it('une première page qui annonce une suite appelle bandcampAllCollection et affiche le tout', async () => {
    routes = (u) => {
      if (/\/ext\/bandcamp\/tags/.test(u)) return { tags: ['rock'], genres: [] };
      if (/\/streaming\/services/.test(u)) return { bandcamp: { enabled: true, authenticated: true, username: 'b' } };
      if (/\/ext\/bandcamp\/collection/.test(u)) {
        return { items: [{ titre: 'Première page', url: 'https://x.bandcamp.com/album/p1', type: 'album' }], more_available: true, last_token: 'jeton' };
      }
      if (/\/ext\/bandcamp\/discover/.test(u)) return { items: [] };
      return [];
    };
    espions.bandcampAllCollection.mockResolvedValue([
      { titre: 'Première page', url: 'https://x.bandcamp.com/album/p1', type: 'album' },
      { titre: 'Deuxième page', url: 'https://x.bandcamp.com/album/p2', type: 'album' },
    ]);
    const { default: StreamingV2 } = await import('../../components/v2/StreamingV2.svelte');
    monte = mount(StreamingV2 as any, { target: hote! });
    await respirer(40);
    const onglet = boutonTexte(fr['v2.str.myCollection']);
    expect(onglet, 'onglet « Ma collection » absent — témoin sans objet').toBeTruthy();
    onglet!.click();
    await respirer(30);
    expect(espions.bandcampAllCollection).toHaveBeenCalledTimes(1);
    expect(hote!.textContent).toContain('Deuxième page');
  });
});

// ---------------------------------------------------------------------------
describe('Réglages › Enrichissement — portraits forcés et pochettes manquantes', () => {
  async function poserReglages() {
    routes = (u) => {
      if (u.includes('/zones') || u.includes('/devices')) return [];
      if (u.includes('/system/update/status')) return { phase: null };
      return {};
    };
    espions.forceRefetchArtistImages.mockResolvedValue({ status: 'started', artists: 12 });
    espions.rescanArtwork.mockResolvedValue({ status: 'started' });
    v2SettingsTarget.set({ tab: 'library', section: 'enrichment' });
    const { default: SettingsV2 } = await import('../../components/v2/SettingsV2.svelte');
    monte = mount(SettingsV2 as any, { target: hote!, props: {} });
    await respirer(20);
  }
  /** Le bouton « Lancer » de la ligne dont le libellé est `libelle`. */
  function lancerDe(libelle: string): HTMLButtonElement | null {
    const ligne = [...hote!.querySelectorAll('.row')].find((r) => r.querySelector('.lbl > span')?.textContent?.trim() === libelle);
    return ligne?.querySelector<HTMLButtonElement>('button') ?? null;
  }

  it('« Forcer la récupération » appelle forceRefetchArtistImages', async () => {
    await poserReglages();
    const b = lancerDe(fr['settings.forceRefetchArtistImages']);
    expect(b, 'ligne « Forcer la récupération » absente').not.toBeNull();
    b!.click();
    await respirer(6);
    expect(espions.forceRefetchArtistImages).toHaveBeenCalledTimes(1);
    expect(hote!.textContent).toContain(fr['settings.enrichArtistImagesStarted']);
  });

  it('« Rechercher les covers manquantes » appelle rescanArtwork', async () => {
    await poserReglages();
    const b = lancerDe(fr['settings.searchMissingCovers']);
    expect(b, 'ligne « Rechercher les covers manquantes » absente').not.toBeNull();
    b!.click();
    await respirer(6);
    expect(espions.rescanArtwork).toHaveBeenCalledTimes(1);
    expect(hote!.textContent).toContain(fr['settings.searchingCovers']);
  });
});

// ---------------------------------------------------------------------------
describe('Playlists — une playlist Linn (.dpl) part sur sa route', () => {
  async function importer(nom: string) {
    routes = (u) => (/\/playlists/.test(u) ? [] : {});
    const { default: PlaylistsV2 } = await import('../../components/v2/PlaylistsV2.svelte');
    monte = mount(PlaylistsV2 as any, { target: hote! });
    await respirer(10);
    const champ = hote!.querySelector<HTMLInputElement>('input[type="file"][accept*=".dpl"]');
    expect(champ, 'le sélecteur de fichier n’accepte pas .dpl').not.toBeNull();
    const fichier = new File(['<dpl/>'], nom, { type: 'application/xml' });
    Object.defineProperty(champ!, 'files', { value: [fichier], configurable: true });
    champ!.dispatchEvent(new Event('change', { bubbles: true }));
    await respirer(6);
    return fichier;
  }

  it('un .dpl appelle importLinnPlaylist, pas l’import M3U', async () => {
    espions.importLinnPlaylist.mockResolvedValue({ id: 3, name: 'Salon', total_entries: 10, matched: 9, not_found: 1, track_count: 9 });
    const f = await importer('Salon.dpl');
    expect(espions.importLinnPlaylist).toHaveBeenCalledWith(f);
    expect(espions.importPlaylistFile).not.toHaveBeenCalled();
  });

  it('TÉMOIN — un .m3u garde son chemin', async () => {
    espions.importPlaylistFile.mockResolvedValue({ matched: 1, missing: 0 });
    await importer('liste.m3u');
    expect(espions.importPlaylistFile).toHaveBeenCalledTimes(1);
    expect(espions.importLinnPlaylist).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('Bibliothèque — tranche de DR et tri aléatoire', () => {
  const A = (id: number, title: string) => ({ id, title, artist_name: 'X', source: 'local' });

  async function poserBibliotheque() {
    routes = (u) => (/\/library\//.test(u) ? [] : {});
    albumsStore.set([A(1, 'Alpha'), A(2, 'Bravo'), A(3, 'Charlie')] as any);
    const { default: LibraryV2 } = await import('../../components/v2/LibraryV2.svelte');
    monte = mount(LibraryV2 as any, { target: hote!, props: {} as any });
    await respirer(20);
  }
  const titres = () => [...hote!.querySelectorAll('.grid .card')].map((c) => (c.textContent ?? '').match(/Alpha|Bravo|Charlie/)?.[0]);

  it('choisir un DR minimum interroge le serveur et ne garde que les albums de la tranche', async () => {
    espions.getAlbumDynamicRanges.mockResolvedValue([14, 12, 8]);
    espions.getAllAlbumsSeeded.mockResolvedValue({ albums: [A(2, 'Bravo')] });
    await poserBibliotheque();
    const min = hote!.querySelector<HTMLSelectElement>(`select[aria-label="${fr['library.drMin']}"]`);
    expect(min, 'la tranche de DR n’est pas dessinée').not.toBeNull();
    min!.value = '12';
    min!.dispatchEvent(new Event('change', { bubbles: true }));
    await respirer(10);
    expect(espions.getAllAlbumsSeeded).toHaveBeenCalledWith(2000, null, null, undefined, undefined, { min: 12, max: null });
    expect(titres()).toEqual(['Bravo']);
  });

  it('sans DR dans la bibliothèque, aucune commande — elle ne filtrerait rien', async () => {
    espions.getAlbumDynamicRanges.mockResolvedValue([]);
    await poserBibliotheque();
    expect(hote!.querySelector(`select[aria-label="${fr['library.drMin']}"]`)).toBeNull();
  });

  it('le tri « Aléatoire » suit le tirage du serveur', async () => {
    espions.getAlbumDynamicRanges.mockResolvedValue([]);
    espions.getAllAlbumsSeeded.mockResolvedValue({ albums: [A(3, 'Charlie'), A(1, 'Alpha'), A(2, 'Bravo')], seed: 42 });
    await poserBibliotheque();
    // Le menu de TRI, pas le bouton de lecture aléatoire qui porte le même mot.
    const entree = [...hote!.querySelectorAll<HTMLButtonElement>('.drop .menu button')]
      .find((b) => (b.textContent ?? '').trim() === fr['library.sortRandom']);
    expect(entree, 'tri « Aléatoire » absent du menu').toBeTruthy();
    entree!.click();
    await respirer(10);
    expect(espions.getAllAlbumsSeeded).toHaveBeenCalledWith(2000, 'random', null);
    expect(titres()).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });
});

// ---------------------------------------------------------------------------
describe('Zones — changer la sortie, tout supprimer', () => {
  async function poserZones() {
    routes = (u) => {
      if (/\/zones\/stereo-pairs/.test(u)) return [];
      if (/\/zones(\?|$)/.test(u)) return [{ id: 1, name: 'Salon', state: 'stopped', volume: 0.4, output_type: 'local' }];
      if (/\/audio\/devices|\/devices\/audio|audio-devices/.test(u)) return [];
      if (/\/devices/.test(u)) return [{ id: 'uuid-bluos', name: 'Node', type: 'bluos', available: true }];
      if (u.includes('tune-tested.json')) return { version: 1, count: 0, devices: [] };
      if (u.endsWith('/system/diagnostics')) return { zones_doublons: [] };
      return [];
    };
    zones.set([{ id: 1, name: 'Salon', state: 'stopped', volume: 0.4, output_type: 'local' }] as any);
    currentZoneId.set(1);
    localStorage.setItem('tune_v2_zones_vue', 'liste');
    const { CLE_VUE_ZONES } = await import('../vueZones');
    localStorage.setItem(CLE_VUE_ZONES, 'liste');
    const { default: ZonesV2 } = await import('../../components/v2/ZonesV2.svelte');
    monte = mount(ZonesV2 as any, { target: hote! });
    await respirer(10);
  }

  it('« Changer la sortie » envoie output_type + output_device_id par changeZoneOutput', async () => {
    espions.changeZoneOutput.mockResolvedValue({ id: 1, name: 'Salon', output_type: 'bluos', output_device_id: 'uuid-bluos' });
    await poserZones();
    const b = hote!.querySelector<HTMLButtonElement>(`.list button[aria-label="${fr['zone.changeOutput']}"]`);
    expect(b, 'pas de geste « Changer la sortie » en vue liste').not.toBeNull();
    b!.click();
    await respirer(10);
    const sel = hote!.querySelector<HTMLSelectElement>('.sortie select');
    expect(sel).not.toBeNull();
    const opt = [...sel!.options].find((o) => o.value.startsWith('bluos|'));
    expect(opt, 'l’appareil BluOS n’est pas proposé').toBeTruthy();
    sel!.value = opt!.value;
    sel!.dispatchEvent(new Event('change', { bubbles: true }));
    await respirer(4);
    [...hote!.querySelectorAll<HTMLButtonElement>('.sortie button')][0].click();
    await respirer(6);
    expect(espions.changeZoneOutput).toHaveBeenCalledWith(1, 'bluos', 'uuid-bluos');
  });

  it('« Tout supprimer » demande une confirmation, puis appelle deleteAllZones', async () => {
    espions.deleteAllZones.mockResolvedValue(undefined);
    await poserZones();
    const b = boutonTexte(fr['zone.deleteAll']);
    expect(b, 'pas de geste « Tout supprimer »').toBeTruthy();
    b!.click();
    await respirer(4);
    expect(espions.deleteAllZones, 'supprimé sans confirmation').not.toHaveBeenCalled();
    expect(hote!.textContent).toContain(fr['zone.deleteAllConfirm']);
    [...hote!.querySelectorAll<HTMLButtonElement>('.tout button')][0].click();
    await respirer(6);
    expect(espions.deleteAllZones).toHaveBeenCalledTimes(1);
  });
});
