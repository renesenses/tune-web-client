// @vitest-environment jsdom
// renesenses/tune-server-rust#8679 — Albums douteux : l'artiste que donne le
// dossier quand la balise manque, montré dans la raison puis écrit, par ligne
// ou pour toute la liste après un aperçu chiffré.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MetadataV2 from '../../components/v2/MetadataV2.svelte';
import * as api from '../api';
import { locale } from '../i18n';
import { grouperParArtisteDevine, type PisteDouteuse } from '../artisteDepuisChemin';
import { fr } from './onzeDictionnaires';

vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  listMetadataProposals: vi.fn(),
  getDoubtfulTracks: vi.fn(),
  setTracksArtist: vi.fn(),
  apercuArtisteDuDossier: vi.fn(),
  ecrireArtisteDuDossier: vi.fn(),
}));

const piste = (id: number, file_path: string, folder_artist: string | null, reasons = ['missing_artist']): PisteDouteuse => ({
  id, title: 'Piste ' + id, reasons, file_path, folder_artist, artist_name: null, album_title: 'Animals', duration_ms: 180_000,
});

const dict = fr as Record<string, string>;
let donnees: PisteDouteuse[];
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  locale.set('fr');
  vi.clearAllMocks();
  donnees = [
    piste(1, '/m/Pink Floyd/Animals/01.flac', 'Pink Floyd'),
    piste(2, '/m/Pink Floyd/Animals/CD2/02.flac', 'Pink Floyd'),
    piste(3, '/Musique/Divers/03.flac', null),
  ];
  vi.mocked(api.listMetadataProposals).mockResolvedValue({ proposals: [], pending: 0, auto_apply: false });
  vi.mocked(api.getDoubtfulTracks).mockImplementation(async () => ({ items: donnees, total: donnees.length }));
  vi.mocked(api.apercuArtisteDuDossier).mockResolvedValue({
    tracks: 2, artists: [{ name: 'Pink Floyd', tracks: 2 }], file_writes_enabled: false,
  });
  vi.mocked(api.ecrireArtisteDuDossier).mockImplementation(async (ids) => {
    const n = ids ? ids.length : 2;
    donnees = donnees.filter((p) => (ids ? !ids.includes(p.id) : !p.folder_artist));
    return { updated: n, errors: 0, artists_created: 0, artists_linked: 1, albums_updated: 1, file_writes_enabled: false, files_scheduled: 0 };
  });
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined;
  hote.remove();
  vi.restoreAllMocks();
});

async function ouvrir() {
  composant = mount(MetadataV2, { target: hote });
  flushSync();
  const onglet = [...hote.querySelectorAll<HTMLButtonElement>('.tabs button')]
    .find((b) => b.textContent?.includes(fr['v2.meta.tabDoubtful']));
  onglet!.click();
  await vi.waitFor(() => {
    flushSync();
    expect(hote.querySelectorAll('.pistes-douteuses li[data-piste-id]').length).toBe(donnees.length);
  });
}

const ligne = (id: number) => hote.querySelector('[data-piste-id="' + id + '"]');

describe('Albums douteux : artiste du dossier (#8679)', () => {
  it('la raison nomme le dossier, et seule une piste dont le dossier parle a son bouton', async () => {
    await ouvrir();
    expect(ligne(1)?.textContent).toContain(dict['v2.meta.dReasonArtistFolder'].replace('{name}', 'Pink Floyd'));
    expect(ligne(1)?.textContent).toContain('Artiste absent des balises (dossier : Pink Floyd)');
    expect(ligne(1)?.querySelector('button.ligne')?.textContent).toContain(dict['v2.meta.dFolderWrite']);
    expect(ligne(3)?.textContent).toContain(dict['v2.meta.dReasonArtist']);
    expect(ligne(3)?.querySelector('button.ligne')).toBeNull();
  });

  it('le bouton d’une ligne n’écrit que cette piste, puis la liste est relue', async () => {
    await ouvrir();
    ligne(1)!.querySelector<HTMLButtonElement>('button.ligne')!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(api.ecrireArtisteDuDossier).toHaveBeenCalledWith([1]);
      expect(ligne(1)).toBeNull();
    });
    expect(api.getDoubtfulTracks).toHaveBeenCalledTimes(2);
    expect(hote.querySelector('[data-bilan-dossier]')?.textContent).toContain(dict['fileWrites.savedInTuneOnly']);
  });

  it('toute la liste : l’aperçu compte d’abord, rien n’est écrit avant la confirmation', async () => {
    await ouvrir();
    const tout = hote.querySelector<HTMLButtonElement>('.pistes-douteuses button.tout')!;
    expect(tout.textContent).toContain(dict['v2.meta.dFolderAll'].replace('{count}', '2'));
    tout.click();
    await vi.waitFor(() => {
      flushSync();
      expect(hote.querySelector('.pistes-douteuses .apercu')?.textContent)
        .toContain(dict['v2.meta.dFolderPreview'].replace('{tracks}', '2').replace('{names}', '1'));
    });
    expect(hote.querySelector('.pistes-douteuses .apercu')?.textContent).toContain(dict['v2.meta.dFolderFilesOff']);
    expect(api.ecrireArtisteDuDossier).not.toHaveBeenCalled();
    hote.querySelector<HTMLButtonElement>('.pistes-douteuses .gestes .go')!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(api.ecrireArtisteDuDossier).toHaveBeenCalledWith(undefined);
      expect(hote.querySelectorAll('.pistes-douteuses li[data-piste-id]').length).toBe(1);
    });
    expect(hote.querySelector('.pistes-douteuses button.tout')).toBeNull();
  });

  it('le bilan reste affiché quand plus aucune piste n’est concernée, ou plus aucune piste du tout', async () => {
    // Toutes les pistes ont un dossier : après « toute la liste », la liste
    // relue est VIDE et l'onglet n'affiche plus que « aucun album douteux ».
    donnees = [donnees[0], donnees[1]];
    await ouvrir();
    hote.querySelector<HTMLButtonElement>('.pistes-douteuses button.tout')!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(hote.querySelector('.pistes-douteuses .gestes .go')).not.toBeNull();
    });
    hote.querySelector<HTMLButtonElement>('.pistes-douteuses .gestes .go')!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(hote.querySelector('.pistes-douteuses')).toBeNull();
      expect(hote.textContent).toContain(dict['v2.meta.noDoubtful']);
    });
    const bilan = hote.querySelector('[data-bilan-dossier]')?.textContent ?? '';
    expect(bilan, 'le bilan a disparu avec la liste').toContain(
      dict['v2.meta.dFolderDone'].replace('{tracks}', '2').replace('{albums}', '1'),
    );
    expect(bilan).toContain(dict['fileWrites.savedInTuneOnly']);
  });

  it('les groupes prennent le nom du serveur plutôt que la devinette locale', () => {
    // Devinette locale : le grand-parent « Animals » est le titre de l'album,
    // écarté ; le serveur, qui saute le dossier de disque, dit Pink Floyd.
    const g = grouperParArtisteDevine([piste(2, '/m/Pink Floyd/Animals/CD2/02.flac', 'Pink Floyd')]);
    expect(g.map((x) => x.nom)).toEqual(['Pink Floyd']);
  });
});
