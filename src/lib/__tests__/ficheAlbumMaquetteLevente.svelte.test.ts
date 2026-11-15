// @vitest-environment jsdom
//
// Fiche album d'après la maquette de Levente (Figma 611:5805-5807, rc12).
// Règle du chantier : AUCUNE donnée inventée — un bloc sans donnée du
// serveur est masqué, jamais rempli d'un zéro ou d'un texte factice. Les
// versions de l'œuvre (#7617) passent du sélecteur d'en-tête à un onglet,
// sans perdre aucun geste (ouvrir une version, la préférer).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

const getArtist = vi.fn();
const getArtistAlbums = vi.fn();
const getAlbumCredits = vi.fn();
const searchLibrary = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getArtist: (...a: unknown[]) => getArtist(...a),
    getArtistAlbums: (...a: unknown[]) => getArtistAlbums(...a),
    getAlbumCredits: (...a: unknown[]) => getAlbumCredits(...a),
    searchLibrary: (...a: unknown[]) => searchLibrary(...a),
  };
});

import {
  autresAlbumsDeLArtiste, detailsAlbum, genresDesPistes, interpretesAlbum, listeDeGenres, numeroCatalogue, pastillesVersion, portraitsInterpretes, titreVersion,
} from '../ficheAlbumMaquette';
import type { OeuvreAlbum, VersionAlbum } from '../oeuvres';
import ColonneAlbumV2 from '../../components/v2/ColonneAlbumV2.svelte';
import VersionsAlbumV2 from '../../components/v2/VersionsAlbumV2.svelte';

const V = (o: Partial<VersionAlbum>): VersionAlbum => ({
  id: 1, title: 'Kind of Blue', version_name: null, year: null, label: null, format: null,
  sample_rate: null, bit_depth: null, source: 'local', ...o,
});

describe('ficheAlbumMaquette — mise en forme sans invention', () => {
  it('détails : seulement les lignes connues, dans l’ordre de la maquette', () => {
    expect(detailsAlbum({ genre: 'Jazz', label: 'Columbia', format: 'flac', sample_rate: 192000, bit_depth: 24 }, '1959'))
      .toEqual([
        { cle: 'v2.album.fiche.release', valeur: '1959' },
        { cle: 'v2.album.fiche.genre', valeur: 'Jazz' },
        { cle: 'v2.album.fiche.label', valeur: 'Columbia' },
        { cle: 'v2.album.fiche.format', valeur: 'FLAC · 24/192' },
      ]);
    expect(detailsAlbum({}, null)).toEqual([]);
    expect(detailsAlbum({ genre: '  ', label: null }, '')).toEqual([]);
    // La liste multiple prime sur le genre seul (#1821).
    expect(detailsAlbum({ genre: 'Jazz', genres: 'Jazz, Modal Jazz' }, null)[0].valeur).toBe('Jazz, Modal Jazz');
  });

  it('genres : la chaîne JSON du serveur (\'["Rock"]\') se lit « Rock » — vu sur le .18 le 15/11', () => {
    expect(detailsAlbum({ genres: '["Rock"]' }, null)).toEqual([{ cle: 'v2.album.fiche.genre', valeur: 'Rock' }]);
    expect(detailsAlbum({ genres: '["Jazz","Modal Jazz"]', genre: 'Jazz' }, null)[0].valeur).toBe('Jazz, Modal Jazz');
    expect(detailsAlbum({ genres: '[]', genre: 'Jazz' }, null)[0].valeur).toBe('Jazz');
    expect(listeDeGenres(['Rock', ' Pop ', 'rock'])).toEqual(['Rock', 'Pop']);
    expect(listeDeGenres('Jazz; Bebop')).toEqual(['Jazz', 'Bebop']);
    expect(listeDeGenres('["Rock"')).toEqual(['Rock']);
    expect(listeDeGenres(null)).toEqual([]);
  });

  it('album de service (« Animals 50 », recette du .18) : les détails viennent de ce que la fiche affiche', () => {
    const l = detailsAlbum({ label: null }, '2027', {
      genres: genresDesPistes([{ genre: 'Rock' }, { genre: '["Rock"]' }]), label: 'Columbia/Legacy',
      format: 'flac', sample_rate: 192000, bit_depth: 24, disques: 2, titres: 28, duree: '4h 20min',
    });
    expect(l.map((x) => [x.cle.replace('v2.album.fiche.', ''), x.valeur])).toEqual([
      ['release', '2027'], ['genre', 'Rock'], ['label', 'Columbia/Legacy'], ['format', 'FLAC · 24/192'],
      ['discs', '2'], ['tracks', '28'], ['duration', '4h 20min'],
    ]);
    // L'album prime sur le complément ; un seul disque ne fait pas de ligne.
    expect(detailsAlbum({ label: 'Columbia' }, null, { label: 'Autre', disques: 1 })).toEqual([{ cle: 'v2.album.fiche.label', valeur: 'Columbia' }]);
    expect(detailsAlbum({}, null, {})).toEqual([]);
  });

  it('interprètes : une fois chacun, avec ses instruments ; la production n’y est pas', () => {
    const c = [
      { track_id: 1, role: 'performer', instrument: 'trumpet', artist_id: 7, artist_name: 'Miles Davis' },
      { track_id: 2, role: 'performer', instrument: 'trumpet', artist_id: 7, artist_name: 'Miles Davis' },
      { track_id: 1, role: 'performer', instrument: 'piano', artist_id: 8, artist_name: 'Bill Evans' },
      { track_id: 1, role: 'producer', instrument: null, artist_id: 9, artist_name: 'Irving Townsend' },
    ] as any;
    const l = interpretesAlbum(c, (k) => k);
    expect(l.map((p) => p.nom)).toEqual(expect.arrayContaining(['Miles Davis', 'Bill Evans']));
    expect(l).toHaveLength(2);
    expect(l.find((p) => p.nom === 'Miles Davis')!.roles).toEqual(['Trumpet']);
    expect(interpretesAlbum([], (k) => k)).toEqual([]);
  });

  it('versions : pastilles connues seulement, titre d’édition sinon titre', () => {
    expect(pastillesVersion(V({ year: 2017, max_channels: 2, format: 'flac', sample_rate: 192000, bit_depth: 24 })))
      .toEqual(['2017', '2.0', 'FLAC', '24/192']);
    expect(pastillesVersion(V({}))).toEqual([]);
    expect(titreVersion(V({ version_name: 'Legacy Edition' }))).toBe('Legacy Edition');
    expect(titreVersion(V({ version_name: ' ' }))).toBe('Kind of Blue');
  });

  it('numéro de catalogue : les deux graphies, rien quand il manque (serveur du .18)', () => {
    expect(numeroCatalogue(V({ catalog_number: ' CL 1355 ' } as any))).toBe('CL 1355');
    expect(numeroCatalogue(V({ catalogNumber: 'CS 8163' } as any))).toBe('CS 8163');
    expect(numeroCatalogue(V({}))).toBeNull();
    expect(numeroCatalogue(V({ catalog_number: '' } as any))).toBeNull();
    expect(pastillesVersion(V({ year: 1959, catalog_number: 'CL 1355' } as any))).toEqual(['1959', 'CL 1355']);
  });

  it('portraits des interprètes : nom EXACT de la bibliothèque, sinon rien (initiales)', async () => {
    const chercher = vi.fn(async (n: string) => ({
      'Bill Evans': { artists: [{ id: 3, name: 'Bill Evans Trio', image_path: '/x.jpg' }, { id: 4, name: 'bill evans', image_path: '/be.jpg' }] },
      'Jimmy Cobb': { artists: [{ id: 5, name: 'Jimmy Cobb', image_path: null }] },
      'Paul Chambers': { artists: [{ id: 6, name: 'Paul Chambers Quintet', image_path: '/pc.jpg' }] },
    } as Record<string, any>)[n] ?? null);
    const p = await portraitsInterpretes(['Bill Evans', 'Jimmy Cobb', 'Paul Chambers', 'Bill Evans'], chercher);
    expect(p).toEqual({ 'Bill Evans': { id: 4, image: '/be.jpg' }, 'Jimmy Cobb': { id: 5, image: null } });
    expect(chercher).toHaveBeenCalledTimes(3);
    const echec = await portraitsInterpretes(['A'], async () => { throw new Error('500'); });
    expect(echec).toEqual({});
  });

  it('« Plus de » : sans l’album affiché ni ses autres versions, trois au plus', () => {
    const l = [1, 2, 3, 4, 5, 6].map((id) => ({ id }));
    expect(autresAlbumsDeLArtiste(l, [1, 3]).map((a) => a.id)).toEqual([2, 4, 5]);
    expect(autresAlbumsDeLArtiste(null, [])).toEqual([]);
    expect(autresAlbumsDeLArtiste([{ id: 1 }], [1])).toEqual([]);
  });
});

async function attendre() { for (let i = 0; i < 6; i++) { await tick(); await Promise.resolve(); } flushSync(); }

describe('ColonneAlbumV2 — un bloc sans donnée disparaît', () => {
  let cible: HTMLElement;
  beforeEach(() => {
    cible = document.createElement('div'); document.body.appendChild(cible);
    getArtist.mockReset(); getArtistAlbums.mockReset(); getAlbumCredits.mockReset(); searchLibrary.mockReset();
    searchLibrary.mockResolvedValue({ artists: [] });
  });
  afterEach(() => { cible.remove(); });

  it('rien du serveur : aucun bloc, aucun zéro', async () => {
    getArtist.mockRejectedValue(new Error('500'));
    getArtistAlbums.mockResolvedValue([]);
    getAlbumCredits.mockResolvedValue([]);
    const c = mount(ColonneAlbumV2, { target: cible, props: {
      album: { id: 1, title: 'X', source: 'local' } as any, artistId: 7, nomArtiste: 'Miles Davis', annee: null,
      pistes: [], avecCredits: true, onAlbum: () => {},
    } });
    await attendre();
    expect(cible.querySelector('[data-bloc-artiste]')).toBeNull();
    expect(cible.querySelector('[data-bloc-interpretes]')).toBeNull();
    expect(cible.querySelector('[data-bloc-details]')).toBeNull();
    expect(cible.querySelector('[data-bloc-plus-de]')).toBeNull();
    expect(cible.textContent ?? '').not.toMatch(/\b0\b/);
    unmount(c);
  });

  it('données servies : artiste, interprètes, détails, autres albums (sans les versions)', async () => {
    getArtist.mockResolvedValue({ id: 7, name: 'Miles Davis', bio: 'Trompettiste américain.', image_path: '/a.jpg' });
    getArtistAlbums.mockResolvedValue([{ id: 1, title: 'Kind of Blue' }, { id: 2, title: 'KoB Legacy' }, { id: 3, title: 'Sketches of Spain' }]);
    getAlbumCredits.mockResolvedValue([{ track_id: 1, role: 'performer', instrument: 'piano', artist_id: 8, artist_name: 'Bill Evans' }]);
    const ouverts: number[] = [];
    const c = mount(ColonneAlbumV2, { target: cible, props: {
      album: { id: 1, title: 'Kind of Blue', source: 'local', genre: 'Jazz', label: 'Columbia' } as any,
      artistId: 7, nomArtiste: 'Miles Davis', annee: '1959', pistes: [], exclus: [2], avecCredits: true,
      onAlbum: (id: number) => ouverts.push(id), onArtiste: () => {},
    } });
    await attendre();
    expect(cible.querySelector('[data-bloc-artiste]')?.textContent).toContain('Trompettiste américain.');
    expect(cible.querySelector('[data-bloc-interpretes]')?.textContent).toContain('Bill Evans');
    // Pas de portrait trouvé : les initiales, jamais une image approchante.
    expect(cible.querySelector('[data-interprete="Bill Evans"] .initiales')?.textContent).toBe('BE');
    expect(cible.querySelector('[data-bloc-details]')?.textContent).toContain('Columbia');
    const plus = cible.querySelector('[data-bloc-plus-de]')!;
    expect(plus.textContent).toContain('Sketches of Spain');
    expect(plus.textContent).not.toContain('KoB Legacy');
    (plus.querySelector('.vtitre') as HTMLButtonElement).click();
    expect(ouverts).toEqual([3]);
    unmount(c);
  });

  it('interprète présent dans la bibliothèque : son portrait', async () => {
    getArtist.mockRejectedValue(new Error('404'));
    getArtistAlbums.mockResolvedValue([]);
    getAlbumCredits.mockResolvedValue([{ track_id: 1, role: 'performer', instrument: 'piano', artist_id: null, artist_name: 'Bill Evans' }]);
    searchLibrary.mockResolvedValue({ artists: [{ id: 4, name: 'Bill Evans', image_path: '/be.jpg' }] });
    const c = mount(ColonneAlbumV2, { target: cible, props: {
      album: { id: 1, title: 'Kind of Blue', source: 'local' } as any, artistId: 7, nomArtiste: 'Miles Davis', annee: null,
      pistes: [], avecCredits: true, onAlbum: () => {},
    } });
    await attendre(); await attendre();
    expect(searchLibrary).toHaveBeenCalledTimes(1);
    expect(cible.querySelector('[data-interprete="Bill Evans"] [data-portrait]')).not.toBeNull();
    unmount(c);
  });

  it('album de service : l’artiste de la bibliothèque au nom EXACT donne « À propos » et « Plus de »', async () => {
    searchLibrary.mockResolvedValue({ artists: [{ id: 3, name: 'Pink Floyd Tribute' }, { id: 9, name: 'Pink Floyd' }] });
    getArtist.mockResolvedValue({ id: 9, name: 'Pink Floyd', bio: 'Groupe britannique.', image_path: null });
    getArtistAlbums.mockResolvedValue([{ id: 40, title: 'Meddle' }]);
    const blocs: number[] = [];
    const c = mount(ColonneAlbumV2, { target: cible, props: {
      album: { id: null, title: 'Animals 50', source: 'qobuz' } as any, artistId: null, nomArtiste: 'Pink Floyd', annee: '2027',
      pistes: [], avecCredits: false, onAlbum: () => {}, complement: { titres: 28 }, onBlocs: (n: number) => blocs.push(n),
    } });
    await attendre(); await attendre();
    expect(getArtist).toHaveBeenCalledWith(9);
    expect(cible.querySelector('[data-bloc-artiste]')?.textContent).toContain('Groupe britannique.');
    expect(cible.querySelector('[data-bloc-plus-de]')?.textContent).toContain('Meddle');
    expect(cible.querySelector('[data-bloc-details]')?.textContent).toContain('28');
    expect(blocs.at(-1)).toBe(3);
    unmount(c);
  });

  it('album de service sans artiste exact dans la bibliothèque : blocs artiste masqués', async () => {
    searchLibrary.mockResolvedValue({ artists: [{ id: 3, name: 'Pink Floyd Tribute' }] });
    const blocs: number[] = [];
    const c = mount(ColonneAlbumV2, { target: cible, props: {
      album: { id: null, title: 'Animals 50', source: 'qobuz' } as any, artistId: null, nomArtiste: 'Pink Floyd', annee: '2027',
      pistes: [], avecCredits: false, onAlbum: () => {}, onBlocs: (n: number) => blocs.push(n),
    } });
    await attendre(); await attendre();
    expect(getArtist).not.toHaveBeenCalled();
    expect(cible.querySelector('[data-bloc-artiste]')).toBeNull();
    expect(blocs.at(-1)).toBe(1);
    unmount(c);
  });

  it('portraits et noms cliquables : la fiche de bibliothèque par id, sinon le nom (Bertrand, 15/11)', async () => {
    getArtist.mockResolvedValue({ id: 7, name: 'Miles Davis', bio: 'Trompettiste.', image_path: '/md.jpg' });
    getArtistAlbums.mockResolvedValue([]);
    getAlbumCredits.mockResolvedValue([
      { track_id: 1, role: 'performer', instrument: 'piano', artist_id: null, artist_name: 'Bill Evans' },
      { track_id: 1, role: 'performer', instrument: 'drums', artist_id: null, artist_name: 'Jimmy Cobb' },
    ]);
    searchLibrary.mockImplementation(async (n: string) => (n === 'Bill Evans' ? { artists: [{ id: 4, name: 'Bill Evans', image_path: '/be.jpg' }] } : { artists: [] }));
    const ouverts: Array<{ id: number | null; nom: string }> = [];
    const c = mount(ColonneAlbumV2, { target: cible, props: {
      album: { id: 1, title: 'Kind of Blue', source: 'local' } as any, artistId: 7, nomArtiste: 'Miles Davis', annee: null,
      pistes: [], avecCredits: true, onAlbum: () => {}, onOuvrirArtiste: (a: { id: number | null; nom: string }) => ouverts.push(a),
    } });
    await attendre(); await attendre();
    const bill = cible.querySelector<HTMLButtonElement>('[data-interprete="Bill Evans"] [data-ouvrir-interprete]')!;
    expect(bill.getAttribute('aria-label')).toContain('Bill Evans');
    bill.click();
    cible.querySelector<HTMLButtonElement>('[data-interprete="Jimmy Cobb"] [data-ouvrir-interprete]')!.click();
    cible.querySelector<HTMLButtonElement>('[data-ouvrir-artiste]')!.click();
    expect(ouverts).toEqual([{ id: 4, nom: 'Bill Evans' }, { id: null, nom: 'Jimmy Cobb' }, { id: 7, nom: 'Miles Davis' }]);
    unmount(c);
  });

  it('album hors bibliothèque : pas de crédits demandés', async () => {
    getArtistAlbums.mockResolvedValue([]);
    const c = mount(ColonneAlbumV2, { target: cible, props: {
      album: { id: null, title: 'X', source: 'qobuz' } as any, artistId: null, nomArtiste: '', annee: null,
      pistes: [], avecCredits: false, onAlbum: () => {},
    } });
    await attendre();
    expect(getAlbumCredits).not.toHaveBeenCalled();
    expect(getArtist).not.toHaveBeenCalled();
    unmount(c);
  });
});

describe('VersionsAlbumV2 — l’onglet Versions (#7617)', () => {
  const oeuvre: OeuvreAlbum = {
    enabled: true, album_id: 1, work_id: 'w', method: 'musicbrainz', count: 2, preferred_id: 1,
    versions: [V({ id: 1, version_name: 'Original Stereo', year: 1959, label: 'Columbia' }), V({ id: 2, version_name: 'Hi-Res Remaster', year: 2017 })],
  };
  it('une ligne par version ; choisir ouvre la version ; préférer reste possible', () => {
    const cible = document.createElement('div'); document.body.appendChild(cible);
    const choisis: number[] = []; let prefere = 0;
    const c = mount(VersionsAlbumV2, { target: cible, props: { oeuvre, courante: 2, onChoisir: (id: number) => choisis.push(id), onPreferer: () => { prefere++; } } });
    flushSync();
    const lignes = cible.querySelectorAll('[data-version]');
    expect(lignes).toHaveLength(2);
    expect(lignes[0].textContent).toContain('Columbia');
    expect(lignes[1].querySelector('[aria-current="true"]')).not.toBeNull();
    (lignes[0].querySelector('.ouvrir') as HTMLButtonElement).click();
    expect(choisis).toEqual([1]);
    (cible.querySelector('[data-preferer-version]') as HTMLButtonElement).click();
    expect(prefere).toBe(1);
    unmount(c); cible.remove();
  });
});

describe('AlbumDetailV2 — câblage de la maquette', () => {
  const src = readFileSync(resolve(__dirname, '../../components/v2/AlbumDetailV2.svelte'), 'utf8');
  it('les versions sont un onglet, plus un sélecteur d’en-tête', () => {
    expect(src).toMatch(/\.\.\.\(oeuvre \? \['versions' as const\] : \[\]\)/);
    expect(src).toContain('<VersionsAlbumV2');
    expect(src).not.toContain('<div class="versions"');
  });
  it('aléatoire : le geste d’aujourd’hui, pas de bouton « Shuffle » séparé (Bertrand, 15/11)', () => {
    // La maquette montre un bouton Shuffle à part : décision de Bertrand, la
    // lecture aléatoire reste sous la flèche du bouton Lecture (rc12, 12/11).
    expect(src).toMatch(/<BoutonLectureV2 onLire=\{\(\) => playAlbum\(0\)\}[\s\S]{0,160}aleatoire=\{\{ faire: shuffle/);
    expect(src).toContain("attrsAleatoire={{ 'data-aleatoire-album': true }}");
    expect((src.match(/onclick=\{shuffle\}/g) ?? []).length).toBe(0);
    for (const f of ['ColonneAlbumV2', 'VersionsAlbumV2']) {
      const c = readFileSync(resolve(__dirname, `../../components/v2/${f}.svelte`), 'utf8');
      expect(c, f).not.toMatch(/shuffle|aleatoire/i);
    }
  });
  it('recette du .18 (15/11) : la colonne reste sous la grappe fixe, les gestes Qobuz sont habillés', () => {
    expect(src).toMatch(/position:sticky; top:calc\(var\(--v2-grappe-h/);
    const q = readFileSync(resolve(__dirname, '../../components/v2/ApportsQobuzAlbum.svelte'), 'utf8');
    expect(q).not.toContain('class="ghost"');
    expect((q.match(/class="v2-btn"/g) ?? []).length).toBe(3);
  });
  it('la colonne de droite est montée, et le surtitre traduit', () => {
    expect(src).toContain('<ColonneAlbumV2');
    expect(src).toContain("'v2.album.fiche.eyebrow'");
  });
  it('les nouvelles clés existent dans les quinze langues', () => {
    const langues = ['en', 'fr', 'de', 'es', 'it', 'zh', 'ko', 'ja', 'nb', 'sv', 'pl', 'ro', 'hu', 'el', 'vi'];
    for (const l of langues) {
      const t = readFileSync(resolve(__dirname, `../locales/${l}.ts`), 'utf8');
      for (const k of ['discs', 'tracks', 'duration', 'readMore', 'eyebrow', 'tabVersions', 'about', 'viewArtist', 'recording', 'details', 'release', 'genre', 'label', 'format', 'moreFrom', 'seeAll', 'openVersion']) {
        expect(t, `${l} v2.album.fiche.${k}`).toContain(`"v2.album.fiche.${k}"`);
      }
    }
  });
});
