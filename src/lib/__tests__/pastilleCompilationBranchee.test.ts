// @vitest-environment jsdom
//
// « Écrit mais pas branché » — la moitié qui manque le plus souvent.
//
// `pastilleCompilation.test.ts` monte la pastille SEULE : il prouve qu'elle
// sait s'afficher, pas qu'un écran l'affiche. C'est exactement la forme du
// défaut d'origine (#1957) : le serveur rendait `is_compilation` depuis la
// v0.9.95 et AUCUN écran ne le lisait. Une garde qui ne monte que la brique
// laisserait ce défaut se reproduire à l'identique.
//
// Ce fichier monte donc la FICHE D'ALBUM réelle, celle qu'ouvre un clic sur une
// pochette, et vérifie que la pastille y apparaît — et seulement quand elle
// doit.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import lFr from '../locales/fr';
import type { Album } from '../types';

// La fiche charge ses pistes dès le montage. On ne teste pas le réseau ici :
// une liste vide suffit, et la fiche la gère (elle affiche son en-tête, puis
// une liste sans ligne).
vi.mock('../api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAlbumTracks: vi.fn(async () => []),
  getStreamingAlbumTracks: vi.fn(async () => []),
  bandcampAlbum: vi.fn(async () => ({ tracks: [] })),
}));

const LIBELLE = (lFr as Record<string, string>)['v2.album.compilation'];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function ouvrir(album: Partial<Album>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, {
    target: hote,
    props: {
      album: { id: 1, title: 'Now That’s What I Call Music', ...album } as Album,
      onClose: () => {},
    },
  });
  return hote;
}
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
});

describe('la fiche d’album porte la pastille « compilation » (#1957)', () => {
  it('la montre sur un album marqué compilation', () => {
    const el = ouvrir({ is_compilation: true });
    expect(el.textContent).toContain(LIBELLE);
  });

  // Contre-épreuve : le MÊME montage, le même écran, sans le drapeau. Si la
  // pastille était rendue inconditionnellement, ou si l'assertion ci-dessus
  // trouvait le mot ailleurs dans la fiche, ce cas le dirait.
  it('ne la montre pas sur un album ordinaire', () => {
    expect(ouvrir({ is_compilation: false }).textContent).not.toContain(LIBELLE);
  });

  it('ne la montre pas quand le serveur n’envoie pas le champ', () => {
    expect(ouvrir({}).textContent).not.toContain(LIBELLE);
  });
});
