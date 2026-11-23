// @vitest-environment jsdom
//
// Fiche album du nouveau client — renesenses/tune-server-rust#3586, FabienM,
// fil forum 1697 (07/09/2026) :
//
//   « Les artistes ont leur biographie, il serait également intéressant
//     d'afficher les infos de l'album sur la page album »
//
// La donnée EXISTE (`Album.bio`, `album_repo::update_bio`), l'interface
// actuelle l'affiche (`LibraryView.svelte`, `.album-bio-section`), et
// `AlbumDetailV2.svelte` n'en portait AUCUNE trace.
//
// 🔴 Le témoin MONTE la fiche et CLIQUE. Il n'inspecte pas le source : un test
// qui cherche « getAlbumBio » dans un fichier resterait vert si le bouton
// disparaissait du balisage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

// `ClampedText` observe la taille du bloc pour décider d'afficher « voir
// plus » ; jsdom n'a pas `ResizeObserver`. On lui en donne un inerte : la
// mesure ne nous intéresse pas ici, le TEXTE si.
class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverInerte);

const getAlbumBio = vi.fn<(id: number) => Promise<{ bio: string | null; source: string | null }>>();
const getAlbumTracks = vi.fn<(id: number) => Promise<any[]>>();

// Mock PARTIEL : la fiche tire aussi `artworkUrl` (via `AlbumArt`) et
// d'autres entrées du module. Ne remplacer que les deux appels qui nous
// intéressent garde le reste du chemin réel.
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getAlbumBio: (id: number) => getAlbumBio(id),
  getAlbumTracks: (id: number) => getAlbumTracks(id),
}));

import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import type { Album } from '../types';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const ALBUM = { id: 12, title: 'Kind of Blue', artist_name: 'Miles Davis' } as Album;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(album: Album = ALBUM): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { album, onClose: () => {} } });
  flushSync();
  return hote;
}

/** L'onglet « Notes / Bio » (web#2736), par son libellé — celui de l'interface actuelle. */
function bouton(el: HTMLElement): HTMLButtonElement | null {
  return (
    [...el.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes(fr['library.notesBio']),
    ) ?? null
  );
}

async function attendre() {
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
}

beforeEach(() => {
  getAlbumBio.mockReset();
  getAlbumTracks.mockReset();
  getAlbumTracks.mockResolvedValue([] as any);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
});

// 🔄 Fil forum 3009 (FabienM, point 9 ; go de Bertrand du 23/11/2026) — plus
// d'onglet « Notes / Bio » : la notice s'affiche à côté de la vignette, lue à
// l'ouverture (décision du 15/11), et « Lire la suite » la déplie sur place.
// Le libellé `library.notesBio` ne doit plus apparaître dans la fiche.
describe('la fiche album porte enfin une présentation', () => {
  it('🔴 fil 3009 — plus d’onglet « Notes / Bio » sur un album local', async () => {
    getAlbumBio.mockResolvedValue({ bio: 'Enregistré en 1959 chez Columbia.', source: null });
    const el = poser();
    await attendre();
    expect(bouton(el), 'l’onglet Notes / Bio est encore là').toBeNull();
    expect(el.querySelector('[role="tab"][data-onglet-album="bio"]')).toBeNull();
    expect(el.querySelector('[data-panneau-bio]')).toBeNull();
  });

  it('affiche la notice dans l’en-tête, sans clic', async () => {
    getAlbumBio.mockResolvedValue({ bio: 'Enregistré en 1959 chez Columbia.', source: null });
    const el = poser();
    await attendre();
    expect(getAlbumBio).toHaveBeenCalledWith(12);
    expect(el.querySelector('[data-description-album]')?.textContent).toContain('Enregistré en 1959 chez Columbia.');
  });

  /**
   * La route n'est PAS une lecture locale : `albums::album_bio` sort sur
   * `https://mozaiklabs.fr/api/v1/albums/bio` dès que la notice stockée est
   * vide. Bertrand a tranché le 15/11 (maquette de Levente) : la présentation
   * s'affiche sous le titre dès l'ouverture. UN appel, pas davantage.
   */
  it('lit la présentation UNE fois à l’ouverture et la montre sous le titre (15/11)', async () => {
    getAlbumBio.mockResolvedValue({ bio: 'Enregistré en 1959.', source: null });
    const el = poser();
    await attendre();
    expect(getAlbumBio).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-description-album]')?.textContent).toContain('Enregistré en 1959.');
    // Changer d'onglet ne la relit pas.
    el.querySelector<HTMLButtonElement>('[role="tab"][data-onglet-album="notes"]')?.click();
    await attendre();
    el.querySelector<HTMLButtonElement>('[role="tab"][data-onglet-album="pistes"]')?.click();
    await attendre();
    expect(getAlbumBio).toHaveBeenCalledTimes(1);
  });

  it('vide ou en erreur : pas de description en tête', async () => {
    getAlbumBio.mockResolvedValue({ bio: '  ', source: null });
    const el = poser();
    await attendre();
    expect(el.querySelector('[data-description-album]')).toBeNull();
    unmount(monte!); monte = null; hote!.remove();
    getAlbumBio.mockRejectedValue(new Error('500'));
    const el2 = poser();
    await attendre();
    expect(el2.querySelector('[data-description-album]')).toBeNull();
  });

  it('🔴 fil 3009 — « Lire la suite » déplie la notice SUR PLACE, puis « Réduire » la replie', async () => {
    getAlbumBio.mockResolvedValue({ bio: 'Une très longue notice. '.repeat(40), source: null });
    const el = poser();
    await attendre();
    const tete = el.querySelector<HTMLElement>('[data-description-album]')!;
    const texte = tete.querySelector<HTMLElement>('p')!;
    const suite = tete.querySelector<HTMLButtonElement>('[data-lire-suite]');
    expect(suite, 'pas de « Lire la suite »').not.toBeNull();
    expect(suite!.textContent?.trim()).toBe(fr['v2.album.fiche.readMore']);
    expect(texte.classList.contains('depliee')).toBe(false);
    suite!.click();
    flushSync();
    expect(texte.classList.contains('depliee'), 'le texte n’est pas déplié').toBe(true);
    expect(suite!.getAttribute('aria-expanded')).toBe('true');
    expect(suite!.textContent?.trim()).toBe(fr['v2.art.bioReadLess']);
    // Aucun onglet n'a pris la place des pistes.
    expect(el.querySelector('[data-panneau-bio]')).toBeNull();
    suite!.click();
    flushSync();
    expect(texte.classList.contains('depliee')).toBe(false);
  });

  /**
   * Un album de service (Qobuz, Tidal), Bandcamp ou distant n'a pas d'`id`
   * local : `GET /library/albums/{id}/bio` ne le désigne pas.
   */
  it('ne lit pas de notice de bibliothèque pour un album sans identifiant local', () => {
    const distant = { id: null, title: 'Ailleurs', artist_name: 'X' } as unknown as Album;
    const el = poser(distant);
    expect(bouton(el)).toBeNull();
    expect(getAlbumBio).not.toHaveBeenCalled();
  });
});
