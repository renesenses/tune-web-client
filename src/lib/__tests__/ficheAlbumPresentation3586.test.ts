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

/** Le bouton « Notes / Bio », par son libellé — celui de l'interface actuelle. */
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

describe('la fiche album porte enfin une présentation', () => {
  it('offre l’entrée « Notes / Bio » sur un album local', () => {
    const el = poser();
    expect(bouton(el), 'aucun bouton Notes / Bio dans la fiche').not.toBeNull();
  });

  it('affiche la notice après le clic', async () => {
    getAlbumBio.mockResolvedValue({ bio: 'Enregistré en 1959 chez Columbia.', source: null });
    const el = poser();
    bouton(el)!.click();
    await attendre();
    expect(getAlbumBio).toHaveBeenCalledWith(12);
    expect(el.textContent).toContain('Enregistré en 1959 chez Columbia.');
  });

  it('reprend l’état vide de l’interface actuelle quand il n’y a pas de notice', async () => {
    getAlbumBio.mockResolvedValue({ bio: null, source: null });
    const el = poser();
    bouton(el)!.click();
    await attendre();
    expect(el.textContent).toContain(fr['library.noAlbumNote']);
  });

  it('dit que la récupération a échoué, au lieu de rendre un vide qui ment', async () => {
    getAlbumBio.mockRejectedValue(new Error('500'));
    const el = poser();
    bouton(el)!.click();
    await attendre();
    expect(el.textContent).toContain(fr['library.bioLoadError']);
    expect(el.textContent).not.toContain(fr['library.noAlbumNote']);
  });

  /**
   * 🔴 La route n'est PAS une lecture locale : `albums::album_bio` sort sur
   * `https://mozaiklabs.fr/api/v1/albums/bio` dès que la notice stockée est
   * vide, et ne met en cache que les réponses non vides. Charger d'office
   * ferait partir une requête sortante à chaque album ouvert. Ce témoin tient
   * ce choix : sans clic, aucun appel.
   */
  it('ne demande RIEN tant que personne n’a cliqué', async () => {
    poser();
    await attendre();
    expect(getAlbumBio).not.toHaveBeenCalled();
  });

  it('ne redemande pas la même notice au second clic', async () => {
    getAlbumBio.mockResolvedValue({ bio: 'Une notice.', source: null });
    const el = poser();
    bouton(el)!.click();
    await attendre();
    // Replié…
    [...el.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').includes(fr['library.hideNotes']))!
      .click();
    await attendre();
    // …puis rouvert.
    bouton(el)!.click();
    await attendre();
    expect(getAlbumBio).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Une notice.');
  });

  it('replie la notice et la cache au second clic', async () => {
    getAlbumBio.mockResolvedValue({ bio: 'Une notice.', source: null });
    const el = poser();
    bouton(el)!.click();
    await attendre();
    expect(el.textContent).toContain('Une notice.');
    [...el.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').includes(fr['library.hideNotes']))!
      .click();
    await attendre();
    expect(el.textContent).not.toContain('Une notice.');
  });

  /**
   * Un album de service (Qobuz, Tidal), Bandcamp ou distant n'a pas d'`id`
   * local : `GET /library/albums/{id}/bio` ne le désigne pas. Un bouton qui
   * ne peut rien rendre ne doit pas exister.
   */
  it('n’offre pas l’entrée sur un album sans identifiant local', () => {
    const distant = { id: null, title: 'Ailleurs', artist_name: 'X' } as unknown as Album;
    const el = poser(distant);
    expect(bouton(el)).toBeNull();
  });
});
