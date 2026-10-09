// @vitest-environment jsdom
/**
 * Fil 2167 — enquête sur la mémoire vive de l'onglet.
 *
 *  1. Les archives du Convertisseur et du Dé-ploc étaient servies par une URL
 *     d'objet (`blob:`) jamais libérée : chaque archive préparée restait
 *     épinglée en mémoire tant que l'onglet vivait.
 *  2. Les pochettes de la grille partaient sans `?size=` : l'original (1 200
 *     px) pour une tuile de 150 à 300 px, et le cache d'images gonflait.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ConverterV2 from '../../components/v2/ConverterV2.svelte';
import DeclickV2 from '../../components/v2/DeclickV2.svelte';
import AlbumArt from '../../components/partages/AlbumArt.svelte';
import * as api from '../api';
import { albums } from '../stores/library';
import { activeView } from '../stores/navigation';
import { licenseState } from '../stores/license';
import { tachesConversion, sansTelechargement, urlDeTelechargement } from '../convertisseurTaches';
import { DELAI_LIBERATION_MS, libererUrlObjet } from '../urlObjet';

vi.mock('../api', async (original) => ({
  ...await original<typeof import('../api')>(),
  getAllAlbums: vi.fn(), getAlbumTracks: vi.fn(async () => []), getConverterCapabilities: vi.fn(),
  getConverterPresets: vi.fn(), downloadConversion: vi.fn(), startConversion: vi.fn(),
  getConversionStatus: vi.fn(), listConversions: vi.fn(), cancelConversion: vi.fn(async () => ({ status: 'cancelled' })),
  startDeclick: vi.fn(), getDeclickStatus: vi.fn(), downloadDeclick: vi.fn(),
  cancelDeclick: vi.fn(async () => ({ status: 'cancelled' })),
  getAlbumCoverPath: vi.fn(async () => null),
}));
vi.setConfig({ testTimeout: 10000 });

const revoque = vi.fn();
beforeEach(() => {
  revoque.mockReset();
  (URL as any).revokeObjectURL = revoque;
});
afterEach(() => {
  delete (URL as any).revokeObjectURL;
  vi.useRealTimers();
});

describe('fil 2167 — libérer une URL d’objet', () => {
  it('libère une URL blob:, ignore le reste', () => {
    libererUrlObjet('blob:http://x/1');
    libererUrlObjet(null);
    libererUrlObjet('https://exemple.org/a.zip');
    expect(revoque.mock.calls).toEqual([['blob:http://x/1']]);
  });
  it('sans revokeObjectURL (environnement minimal), ne lève pas', () => {
    delete (URL as any).revokeObjectURL;
    expect(() => libererUrlObjet('blob:x')).not.toThrow();
  });
  it('les règles pures du Convertisseur : lire et retirer le lien d’une tâche', () => {
    const ts = [
      { jobId: 'a', job: null, downloadUrl: 'blob:a', libelle: null },
      { jobId: 'b', job: null, downloadUrl: 'blob:b', libelle: null },
    ];
    expect(urlDeTelechargement(ts, 'b')).toBe('blob:b');
    expect(urlDeTelechargement(ts, 'z')).toBeNull();
    const apres = sansTelechargement(ts, 'a');
    expect(apres.map((t) => t.downloadUrl)).toEqual([null, 'blob:b']);
    expect(apres[1]).toBe(ts[1]);
  });
});

let target: HTMLDivElement;
let instance: ReturnType<typeof mount> | undefined;
const wait = async (assertion: () => void) => vi.waitFor(() => { flushSync(); assertion(); }, { timeout: 3000 });
async function retirer() { if (instance) await unmount(instance); instance = undefined; target.replaceChildren(); }
function click(el: Element | null) {
  expect(el).not.toBeNull();
  (el as HTMLElement).click(); flushSync();
}
/** Le clic sur le lien `download` sans que jsdom ne tente de naviguer. */
function enregistrer(lien: Element | null) {
  expect(lien, 'pas de lien « Enregistrer »').not.toBeNull();
  lien!.addEventListener('click', (e) => e.preventDefault());
  click(lien);
}
const album = { id: 12, title: 'Miles Smiles', artist_name: 'Miles Davis', source: 'local', format: 'flac', sample_rate: 44_100 };

beforeEach(() => {
  vi.clearAllMocks();
  activeView.set('converter');
  albums.set([album as any]);
  licenseState.update((s) => ({ ...s, tier: 'premium' }));
  target = document.createElement('div'); document.body.appendChild(target);
});
afterEach(async () => { await retirer(); target.remove(); });

describe('fil 2167 — Convertisseur : l’archive préparée est libérée', () => {
  const FAITE = { state: 'done', progress: 100, converted: 1, total: 1, current_file: '', download_size: '12 MB' };
  beforeEach(() => {
    tachesConversion.set([]);
    vi.mocked(api.getConverterCapabilities).mockResolvedValue({ formats: { flac: true }, tools: {} } as any);
    vi.mocked(api.getConverterPresets).mockResolvedValue([
      { id: 'flac-cd', label: 'CD', format: 'flac', quality: '5', sample_rate: 44100, bit_depth: 16 },
    ] as any);
    vi.mocked(api.listConversions).mockResolvedValue([{ job_id: 'j1', ...FAITE } as any]);
    vi.mocked(api.getConversionStatus).mockResolvedValue(FAITE as any);
    vi.mocked(api.downloadConversion).mockResolvedValue('blob:j1');
  });

  async function prepare() {
    instance = mount(ConverterV2, { target }); flushSync();
    await wait(() => expect(target.querySelector('.job .done button')).not.toBeNull());
    click(target.querySelector('.job .done button'));
    await wait(() => expect(target.querySelector('a[download]')?.getAttribute('href')).toBe('blob:j1'));
  }

  it('une fois le téléchargement parti', async () => {
    await prepare();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    enregistrer(target.querySelector('a[download]'));
    expect(revoque, 'libérée avant que le navigateur ait lu le blob').not.toHaveBeenCalled();
    vi.advanceTimersByTime(DELAI_LIBERATION_MS);
    flushSync();
    expect(revoque).toHaveBeenCalledWith('blob:j1');
    // Le lien mort a disparu : l'écran repropose de préparer l'archive.
    expect(target.querySelector('a[download]')).toBeNull();
    expect(target.querySelector('.job .done button')).not.toBeNull();
  });

  it('quand la tâche est retirée', async () => {
    await prepare();
    click(target.querySelector('.job .danger'));
    await wait(() => expect(target.querySelector('.job')).toBeNull());
    expect(revoque).toHaveBeenCalledWith('blob:j1');
  });
});

describe('fil 2167 — Dé-ploc : l’archive préparée est libérée', () => {
  beforeEach(() => {
    vi.mocked(api.startDeclick).mockResolvedValue({ job_id: 'd1', total_tracks: 1 });
    vi.mocked(api.getDeclickStatus).mockResolvedValue({ status: 'completed', completed: 1, total: 1, current_file: '' });
    vi.mocked(api.downloadDeclick).mockResolvedValue('blob:d1');
  });

  async function prepare() {
    instance = mount(DeclickV2, { target }); flushSync();
    await wait(() => expect(target.querySelector('.card')).not.toBeNull());
    click(target.querySelector('.card'));
    click(target.querySelector('.go'));
    await wait(() => expect(target.querySelector('.done button')).not.toBeNull());
    click(target.querySelector('.done button'));
    await wait(() => expect(target.querySelector('a[download]')?.getAttribute('href')).toBe('blob:d1'));
  }

  it('une fois le téléchargement parti', async () => {
    await prepare();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    enregistrer(target.querySelector('a[download]'));
    expect(revoque).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DELAI_LIBERATION_MS);
    flushSync();
    expect(revoque).toHaveBeenCalledWith('blob:d1');
    expect(target.querySelector('a[download]')).toBeNull();
  });

  it('quand l’écran est démonté', async () => {
    await prepare();
    await retirer();
    expect(revoque).toHaveBeenCalledWith('blob:d1');
  });

  it('quand la tâche est annulée', async () => {
    await prepare();
    click(target.querySelector('.danger'));
    await wait(() => expect(revoque).toHaveBeenCalledWith('blob:d1'));
  });
});

describe('fil 2167 — la taille demandée pour une vignette', () => {
  it.each([
    [148, 1, 200], [148, 2, 400], [200, 2, 400], [250, 2, 400],
    [44, 2, 128], [36, 1, 80], [64, 3, 200],
  ])('%i px CSS, densité %i → case %i', (css, dpr, attendu) => {
    expect(api.tailleDeVignette(css, dpr)).toBe(attendu);
  });
  it('trop grand pour une vignette, ou largeur inconnue : pas de taille (l’original)', () => {
    expect(api.tailleDeVignette(300, 2)).toBeUndefined();
    expect(api.tailleDeVignette(0, 2)).toBeUndefined();
    expect(api.tailleDeVignette(Number.NaN, 2)).toBeUndefined();
  });
  it('artworkUrl ajoute ?size= aux adresses de pochette déjà faites, pas au relais', () => {
    expect(api.artworkUrl('/api/v1/library/artwork/abc123', 200)).toBe('/api/v1/library/artwork/abc123?size=200');
    expect(api.artworkUrl('/api/v1/library/artwork/abc123')).toBe('/api/v1/library/artwork/abc123');
    expect(api.artworkUrl('/api/v1/library/artwork/proxy?url=x', 200)).toBe('/api/v1/library/artwork/proxy?url=x');
    expect(api.artworkUrl('abc123', 400)).toMatch(/\/library\/artwork\/abc123\?size=400$/);
  });
});

describe('fil 2167 — AlbumArt en grille demande une vignette', () => {
  let dpr: PropertyDescriptor | undefined;
  beforeEach(() => {
    dpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  });
  afterEach(() => {
    if (dpr) Object.defineProperty(window, 'devicePixelRatio', dpr);
    vi.restoreAllMocks();
  });
  const largeur = (l: number) => vi.spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width: l, height: l, top: 0, left: 0, right: l, bottom: l, x: 0, y: 0, toJSON() {} } as DOMRect);
  const srcDe = async (props: Record<string, unknown>) => {
    instance = mount(AlbumArt, { target, props: { coverPath: '/api/v1/library/artwork/abc123', size: 0, ...props } });
    await wait(() => expect(target.querySelector('img')).not.toBeNull());
    return target.querySelector('img')!.getAttribute('src');
  };

  it('tuile de 180 px CSS sur écran ×2 → ?size=400', async () => {
    largeur(180);
    expect(await srcDe({ vignette: true })).toBe('/api/v1/library/artwork/abc123?size=400');
  });
  it('sans `vignette` (détail, Lecture en cours), la grande image comme avant', async () => {
    largeur(180);
    expect(await srcDe({})).toBe('/api/v1/library/artwork/abc123');
  });
  it('largeur inconnue (rien de mis en page) : l’original, comme avant', async () => {
    largeur(0);
    expect(await srcDe({ vignette: true })).toBe('/api/v1/library/artwork/abc123');
  });
});
