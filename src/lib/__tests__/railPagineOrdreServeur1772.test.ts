/**
 * #1772 — le saut par lettre EN PAGES suit l'ordre de l'API paginée depuis
 * tune-server-rust#5423 (tri en Rust par `comparer_alphabetique`, #5401).
 *
 * Le serveur factice rend ses pages dans l'ordre de #5423 :
 * - tri par titre : clé alphabétique du titre, puis id ;
 * - tri par artiste : clé du nom d'artiste (`ar.name`), année, titre, id.
 * On l'obtient ici avec `comparerAlphabetique`, la transcription web de la
 * règle serveur (ordreAlphabetique1772.test.ts la tient contre la liste
 * piège du serveur).
 *
 * `offsetDeLettre` cherche la première place d'une lettre par dichotomie :
 * il suppose que l'initiale CROÎT le long de la liste. « (Inédit) » est rangé
 * à I par le serveur ; si le web l'annonce sous « # », la dichotomie saute
 * par-dessus et tombe une case trop loin, sur « Island ».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  getAlbumsPagines: vi.fn(),
  getAllAlbums: vi.fn(),
}));

import * as api from '../api';
import type { Album } from '../types';
import { albums, libraryLoading } from '../stores/library';
import { _remiseAZeroPourTests, offsetDeLettre, type ClefDeListe } from '../stores/albumsPagines';
import { comparerAlphabetique, initialeAlbum } from '../ordreAlphabetique';

const TITRES = [
  '2 Tone', 'Abbey Road', 'Blue Train', "'Chelsea Girl", 'Dookie', 'Électro',
  'Gold', 'Help!', '(Inédit)', 'Island', 'Jazz', 'Kind of Blue', 'Moon Safari',
  '« Nocturnes »', 'OK Computer', 'Rock', 'Tapestry', 'Zoo',
];
const ARTISTES = [
  '10cc', 'Aphex Twin', 'Björk', 'Coldplay', 'Édith Piaf', '(hed) p.e.', 'Ibrahim Maalouf',
  'Nina Simone', "'Til Tuesday", 'Zazie', 'ZZ Top',
];

/** Les albums dans le désordre d'arrivée : c'est le serveur qui range. */
const PAR_TITRE: Album[] = [...TITRES].reverse().map((title, i) => ({ id: i + 1, title, artist_name: 'X' }) as Album);
const PAR_ARTISTE: Album[] = [...ARTISTES].reverse().map((artist_name, i) =>
  ({ id: 100 + i, title: `Album ${i}`, artist_name, year: 2000 }) as Album);

/** L'ordre de #5423. */
function ordreServeur(sort: string, liste: Album[]): Album[] {
  return [...liste].sort((a, b) =>
    sort === 'artist'
      ? comparerAlphabetique(a.artist_name, b.artist_name) || (a.year ?? 0) - (b.year ?? 0)
        || comparerAlphabetique(a.title, b.title) || (a.id as number) - (b.id as number)
      : comparerAlphabetique(a.title, b.title) || (a.id as number) - (b.id as number));
}

const TITRE: ClefDeListe = { sort: 'title', order: 'asc' };
const ARTISTE: ClefDeListe = { sort: 'artist', order: 'asc' };
const parTitre = (a: Album) => initialeAlbum(a, false);
const parArtiste = (a: Album) => initialeAlbum(a, true);

beforeEach(() => {
  _remiseAZeroPourTests();
  albums.set([]);
  libraryLoading.set(false);
  vi.mocked(api.getAlbumsPagines).mockReset().mockImplementation(async ({ limit, offset = 0, sort }) => {
    const rang = ordreServeur(String(sort), sort === 'artist' ? PAR_ARTISTE : PAR_TITRE);
    return { items: rang.slice(offset, offset + limit), total: rang.length };
  });
});

describe('rail A–Z en pages, ordre de tune-server-rust#5423 (#1772)', () => {
  const rangTitres = () => ordreServeur('title', PAR_TITRE).map((a) => a.title);

  it("le serveur factice range bien « (Inédit) » à I, avant « Island »", () => {
    const t = rangTitres();
    expect(t.indexOf('(Inédit)')).toBe(t.indexOf('Help!') + 1);
    expect(t.indexOf('Island')).toBe(t.indexOf('(Inédit)') + 1);
  });

  it("l'initiale croît le long de la liste du serveur", () => {
    const i = ordreServeur('title', PAR_TITRE).map(parTitre);
    expect(i).toEqual([...i].sort());
    const j = ordreServeur('artist', PAR_ARTISTE).map(parArtiste);
    expect(j).toEqual([...j].sort());
  });

  it('le saut à I tombe sur « (Inédit) », pas une case plus loin', async () => {
    const t = rangTitres();
    expect(await offsetDeLettre(TITRE, 'I', parTitre)).toBe(t.indexOf('(Inédit)'));
  });

  it('chaque lettre présente est trouvée à sa première place', async () => {
    const rang = ordreServeur('title', PAR_TITRE);
    for (const L of ['A', 'B', 'C', 'E', 'H', 'I', 'N', 'T', 'Z']) {
      expect(await offsetDeLettre(TITRE, L, parTitre), L).toBe(rang.findIndex((a) => parTitre(a) === L));
    }
  });

  it("tri Artiste : « (hed) p.e. » sous H, « 'Til Tuesday » sous T", async () => {
    const rang = ordreServeur('artist', PAR_ARTISTE).map((a) => a.artist_name);
    expect(await offsetDeLettre(ARTISTE, 'H', parArtiste)).toBe(rang.indexOf('(hed) p.e.'));
    expect(await offsetDeLettre(ARTISTE, 'T', parArtiste)).toBe(rang.indexOf("'Til Tuesday"));
    expect(await offsetDeLettre(ARTISTE, 'E', parArtiste)).toBe(rang.indexOf('Édith Piaf'));
  });
});
