// @vitest-environment jsdom
// #2855 / serveur #8039 : le vrai onglet doit montrer toutes les pistes,
// pas seulement les noms d'artistes que leur chemin permet de proposer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MetadataV2 from '../../components/v2/MetadataV2.svelte';
import * as api from '../api';
import { locale } from '../i18n';
import type { PisteDouteuse } from '../artisteDepuisChemin';
import { fr } from './onzeDictionnaires';

vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  listMetadataProposals: vi.fn(),
  getDoubtfulTracks: vi.fn(),
  setTracksArtist: vi.fn(),
}));

const piste = (id: number, title: string, reasons: string[], file_path: string | null): PisteDouteuse => ({
  id, title, reasons, file_path, artist_name: null, album_title: 'Album', duration_ms: 180_000,
});

let donnees: PisteDouteuse[];
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  locale.set('fr');
  vi.clearAllMocks();
  donnees = [
    piste(1, 'Première piste du groupe', ['missing_artist'], '/music/Prince/Album/01.flac'),
    piste(2, 'Seconde piste du groupe', ['missing_artist'], '/music/Prince/Album/02.flac'),
    piste(3, 'Album absent', ['missing_album'], 'E:\\Musique\\03.flac'),
    piste(4, 'Extrait bref', ['very_short'], '/music/04.flac'),
    piste(5, 'Sans indice', ['missing_artist'], '/05.flac'),
    piste(6, 'Plusieurs raisons', ['missing_artist', 'missing_album', 'very_short'], null),
  ];
  vi.mocked(api.listMetadataProposals).mockResolvedValue({ proposals: [], pending: 0, auto_apply: false });
  vi.mocked(api.getDoubtfulTracks).mockImplementation(async (limit = 50, offset = 0) => ({
    items: donnees.slice(offset, offset + limit), total: donnees.length,
  }));
  vi.mocked(api.setTracksArtist).mockImplementation(async (ids, artistName) => ({ updated: ids.length, errors: 0, artist_id: 7, artist_name: artistName, created: false }));
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
  expect(onglet).toBeDefined();
  onglet!.click();
  await vi.waitFor(() => {
    flushSync();
    expect(hote.querySelector('.scroll > .note')?.textContent)
      .toBe(fr['v2.meta.dArtistIntro'].replace('{count}', String(donnees.length)));
  });
}

describe('pistes annoncées dans Albums douteux (#8039)', () => {
  it('liste chaque piste, son chemin et toutes ses raisons, même hors des groupes', async () => {
    await ouvrir();
    const lignes = hote.querySelectorAll('.pistes-douteuses li');
    expect(lignes.length, 'les pistes annoncées doivent toutes être consultables').toBe(donnees.length);
    for (const p of donnees) {
      const ligne = hote.querySelector('[data-piste-id="' + p.id + '"]');
      expect(ligne?.textContent, 'piste omise : ' + p.title).toContain(p.title);
      expect(ligne?.textContent).toContain(p.file_path || fr['v2.meta.dNoPath']);
    }
    expect(hote.querySelector('[data-piste-id="3"]')?.textContent).toContain(fr['v2.meta.dReasonAlbum']);
    expect(hote.querySelector('[data-piste-id="4"]')?.textContent).toContain(fr['v2.meta.dReasonShort']);
    const plusieurs = hote.querySelector('[data-piste-id="6"]')?.textContent;
    for (const cle of ['dReasonArtist', 'dReasonAlbum', 'dReasonShort'] as const) {
      expect(plusieurs).toContain(fr['v2.meta.' + cle as keyof typeof fr]);
    }
    expect(hote.querySelector('.v2-eyebrow')?.textContent).toBe('Bibliothèque');
    expect(hote.querySelector('.note')?.textContent).toContain('nom identifié avant de le valider');
    expect(api.setTracksArtist).not.toHaveBeenCalled();
  });

  it('rend les 55 pistes accessibles avec Voir plus, sans rendre une longue bibliothèque d’un coup', async () => {
    donnees = Array.from({ length: 55 }, (_, n) => piste(n + 1, 'Piste ' + (n + 1), ['missing_album'], '/music/' + n + '.flac'));
    await ouvrir();
    expect(hote.querySelectorAll('.pistes-douteuses li').length).toBe(50);
    const suite = hote.querySelector<HTMLButtonElement>('.pistes-douteuses button');
    expect(suite?.textContent).toContain(fr['common.showMore']);
    suite!.click();
    flushSync();
    expect(hote.querySelectorAll('.pistes-douteuses li').length).toBe(55);
    expect(hote.querySelector('[data-piste-id="55"]')?.textContent).toContain('Piste 55');
    expect(hote.querySelector('.pistes-douteuses button')).toBeNull();
    expect(api.setTracksArtist).not.toHaveBeenCalled();
  });

  it('ne pose un artiste que sur les pistes du groupe explicitement coché', async () => {
    await ouvrir();
    const valider = hote.querySelector<HTMLButtonElement>('.cpacts .go')!;
    expect(valider.disabled).toBe(true);
    hote.querySelector<HTMLInputElement>('.cprow input[type="checkbox"]')!.click();
    flushSync();
    expect(valider.disabled).toBe(false);
    valider.click();
    await vi.waitFor(() => {
      expect(api.setTracksArtist).toHaveBeenCalledTimes(1);
      expect(api.setTracksArtist).toHaveBeenCalledWith([1, 2], 'Prince');
    });
  });

  it('garde visible une piste dont la raison est nouvelle et dont le chemin manque', async () => {
    donnees = [piste(99, 'Autre vérification', ['future_reason'], null)];
    await ouvrir();
    const ligne = hote.querySelector('[data-piste-id="99"]');
    expect(ligne?.textContent).toContain('Autre vérification');
    expect(ligne?.textContent).toContain(fr['v2.meta.dReasonOther']);
    expect(ligne?.textContent).toContain(fr['v2.meta.dNoPath']);
    expect(ligne?.textContent).not.toContain('future_reason');
  });
});
