// @vitest-environment jsdom
//
// web#2770 — LIENS HYPERTEXTE, lot 0 : le geste commun (`lib/lienEntite`).
//
// Ce que ces témoins prouvent, et ce qu'ils ne prouvent pas :
//  - le DÉCOUPAGE d'un nom composé, et le geste de chaque partie (la partie,
//    puis le nom entier — « Simon » ouvre « Simon & Garfunkel ») ;
//  - l'identifiant connu va à la TÊTE ;
//  - sans cible connue, `ouvrir` est `null` : le nom restera un texte ;
//  - 🔴 le repli d'un nom sans fiche n'est plus la Bibliothèque « dans son
//    dernier état » (lien mort déguisé), mais la Recherche sur ce nom.
//
// Contre-épreuve : `ouvrirArtisteDepuis.ts` remis à `origin/main` fait rougir
// « repli : la Recherche » (la vue atteinte est `library`) et « candidats »
// (le second nom n'est jamais cherché).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const { searchLibrary, federatedSearch, getZoneCurrentAlbum, getZone } = vi.hoisted(() => ({
  searchLibrary: vi.fn(async (_q: string, _n?: number) => ({ artists: [] as any[], albums: [], tracks: [] })),
  federatedSearch: vi.fn(async () => ({ services: {} })),
  getZoneCurrentAlbum: vi.fn(async (_zid: number): Promise<any> => null),
  getZone: vi.fn(async (_zid: number): Promise<any> => null),
}));
vi.mock('../api', async (orig) => ({ ...(await orig<object>()), searchLibrary, federatedSearch, getZoneCurrentAlbum, getZone }));

import { artisteDAlbum, artisteDePisteEcoutee, decouperArtistes, partiesDEntite } from '../lienEntite';
import { artisteLocalParNom, ouvrirArtisteDepuis } from '../ouvrirArtisteDepuis';
import { ouvrirAlbumDeLaZoneCourante } from '../lienLectureEnCours';
import { activeView, gestesNavigationService, pendingLibraryAlbum, pendingLibraryYear, pendingSearchQuery, vueDeRetour } from '../stores/navigation';
import { ficheArtisteService } from '../stores/streaming';
import { currentZoneId, zones } from '../stores/zones';

const liens = (p: ReturnType<typeof partiesDEntite>) => p.filter((x) => x.ouvrir);

beforeEach(() => {
  searchLibrary.mockReset();
  searchLibrary.mockResolvedValue({ artists: [], albums: [], tracks: [] });
  activeView.set('home');
  pendingSearchQuery.set(null as any);
  pendingLibraryAlbum.set(null);
  pendingLibraryYear.set(null);
  ficheArtisteService.set(null);
  vueDeRetour.set(null);
});

describe('decouperArtistes — un lien par artiste', () => {
  it('coupe sur feat., &, virgule et barre, en gardant les séparateurs', () => {
    expect(decouperArtistes('Daft Punk feat. Pharrell Williams').noms).toEqual(['Daft Punk', 'Pharrell Williams']);
    expect(decouperArtistes('Daft Punk (feat. Pharrell Williams)').noms).toEqual(['Daft Punk', 'Pharrell Williams']);
    expect(decouperArtistes('Simon & Garfunkel')).toEqual({ noms: ['Simon', 'Garfunkel'], separateurs: [' & '] });
    expect(decouperArtistes('Crosby, Stills & Nash').noms).toEqual(['Crosby', 'Stills', 'Nash']);
    expect(decouperArtistes('Earth, Wind & Fire').noms).toEqual(['Earth', 'Wind', 'Fire']);
    expect(decouperArtistes('Air / Phoenix').noms).toEqual(['Air', 'Phoenix']);
  });
  it('ne coupe ni « AC/DC », ni « Software », ni « Diving With Andy », ni un nom vide', () => {
    expect(decouperArtistes('AC/DC').noms).toEqual(['AC/DC']);
    expect(decouperArtistes('Software').noms).toEqual(['Software']);
    expect(decouperArtistes('Diving With Andy').noms).toEqual(['Diving With Andy']);
    expect(decouperArtistes('  ').noms).toEqual([]);
    expect(decouperArtistes('& ').noms).toEqual(['&']);
  });
});

describe('partiesDEntite — artiste', () => {
  it('un artiste de la bibliothèque avec identifiant : UN lien, vers la page commune', () => {
    const p = partiesDEntite({ type: 'artiste', nom: 'Air', artiste: { id: 42, name: 'Air', source: 'local' } }, 'home');
    expect(p).toHaveLength(1);
    p[0].ouvrir!();
    expect(get(ficheArtisteService)).toMatchObject({ service: null, id: '42' });
    expect(get(activeView)).toBe('streamingartist');
    expect(get(vueDeRetour)).toBe('home');
  });

  it('« A feat. B » avec identifiant : l’identifiant va à la TÊTE, B se cherche par son nom', async () => {
    const p = partiesDEntite(
      { type: 'artiste', nom: 'Daft Punk feat. Pharrell Williams', artiste: { id: 7, name: 'Daft Punk feat. Pharrell Williams', source: 'local' } },
      'home',
    );
    expect(p.map((x) => x.texte)).toEqual(['Daft Punk', ' feat. ', 'Pharrell Williams']);
    expect(liens(p)).toHaveLength(2);
    expect(p[1].separateur).toBe(true);
    p[0].ouvrir!();
    expect(get(ficheArtisteService)).toMatchObject({ id: '7' });
    searchLibrary.mockResolvedValue({ artists: [{ id: 99, name: 'Pharrell Williams' }], albums: [], tracks: [] });
    await p[2].ouvrir!();
    expect(searchLibrary).toHaveBeenCalledWith('Pharrell Williams', expect.any(Number));
    expect(get(ficheArtisteService)).toMatchObject({ id: '99' });
  });

  it('🔴 candidats : « Simon » introuvable, « Simon & Garfunkel » existe → le groupe', async () => {
    searchLibrary.mockImplementation(async (q: string) =>
      q === 'Simon & Garfunkel' ? { artists: [{ id: 5, name: 'Simon & Garfunkel' }], albums: [], tracks: [] } : { artists: [], albums: [], tracks: [] });
    const p = partiesDEntite({ type: 'artiste', nom: 'Simon & Garfunkel' }, 'favorites');
    expect(liens(p)).toHaveLength(2);
    await p[0].ouvrir!();
    expect(searchLibrary.mock.calls.map((c) => c[0])).toEqual(['Simon', 'Simon & Garfunkel']);
    expect(get(ficheArtisteService)).toMatchObject({ service: null, id: '5' });
    expect(get(activeView)).toBe('streamingartist');
  });

  it('un artiste de service : la tête par identifiant, l’autre par le nom chez le service', () => {
    const p = partiesDEntite({ type: 'artiste', nom: 'A & B', artiste: { name: 'A & B', source: 'qobuz', source_id: 'q1' } }, 'search');
    expect(liens(p)).toHaveLength(2);
    p[0].ouvrir!();
    expect(get(ficheArtisteService)).toMatchObject({ service: 'qobuz', id: 'q1' });
  });

  it('`multi: false` garde un seul lien ; sans nom ni identifiant, rien', () => {
    expect(liens(partiesDEntite({ type: 'artiste', nom: 'A & B', multi: false }, 'home'))).toHaveLength(1);
    expect(partiesDEntite({ type: 'artiste', nom: '' }, 'home')).toEqual([]);
    expect(partiesDEntite(null, 'home')).toEqual([]);
  });
});

describe('partiesDEntite — album, année, radio', () => {
  it('un album sans identifiant connu reste un TEXTE (pas de lien mort)', () => {
    const [p] = partiesDEntite({ type: 'album', nom: 'Moon Safari', piste: { source: 'local', album_title: 'Moon Safari' } }, 'home');
    expect(p.texte).toBe('Moon Safari');
    expect(p.ouvrir).toBeNull();
  });
  it('un album de la bibliothèque ouvre sa fiche', () => {
    const [p] = partiesDEntite({ type: 'album', nom: 'Moon Safari', albumId: 12 }, 'home');
    p.ouvrir!();
    expect(get(pendingLibraryAlbum)).toBe(12);
    expect(get(activeView)).toBe('library');
  });
  it('une année ouvre la Bibliothèque sur cette année', () => {
    const [p] = partiesDEntite({ type: 'annee', annee: 1998 }, 'nowplaying');
    expect(p.texte).toBe('1998');
    p.ouvrir!();
    expect(get(pendingLibraryYear)).toBe(1998);
    expect(get(activeView)).toBe('library');
    expect(partiesDEntite({ type: 'annee', annee: null }, 'home')).toEqual([]);
  });
  it('une radio sans cible fournie par l’écran reste un texte ; avec, c’est la cible', () => {
    expect(partiesDEntite({ type: 'radio', nom: 'FIP' }, 'home')[0].ouvrir).toBeNull();
    const ouvrir = vi.fn();
    partiesDEntite({ type: 'radio', nom: 'FIP', ouvrir }, 'home')[0].ouvrir!();
    expect(ouvrir).toHaveBeenCalled();
  });
});

describe('🔴 ouvrirArtisteDepuis — repli : la Recherche, plus la Bibliothèque', () => {
  it('un nom sans fiche ouvre la Recherche sur ce nom', async () => {
    await ouvrirArtisteDepuis({ name: 'Inconnu' }, 'favorites');
    expect(get(activeView), 'la Bibliothèque « dans son dernier état » est un lien mort déguisé').toBe('search');
    expect(get(pendingSearchQuery)).toBe('Inconnu');
  });
  it('artisteLocalParNom lit les candidats dans l’ordre, et rend le nom RETENU', async () => {
    searchLibrary.mockImplementation(async (q: string) =>
      q === 'B' ? { artists: [{ id: 3, name: 'b' }], albums: [], tracks: [] } : { artists: [], albums: [], tracks: [] });
    expect(await artisteLocalParNom('A', ['A', 'B'])).toEqual({ id: 3, nom: 'B' });
    expect(searchLibrary.mock.calls.map((c) => c[0])).toEqual(['A', 'B']);
  });
});

describe('ouvrirAlbumDeLaZoneCourante — le nom d’album de la barre de lecture (lot 1)', () => {
  const zone = (piste: any) => { zones.set([{ id: 1, name: 'Salon', current_track: piste } as any]); currentZoneId.set(1); };
  beforeEach(() => { getZoneCurrentAlbum.mockReset(); gestesNavigationService.set(null); });

  it('🔴 l’album de la bibliothèque, tel que le serveur le tranche (#1361)', async () => {
    zone({ source: 'local', title: 'Sexy Boy', album_title: 'Moon Safari' });
    getZoneCurrentAlbum.mockResolvedValue({ kind: 'library', album_id: 12 });
    await ouvrirAlbumDeLaZoneCourante();
    expect(getZoneCurrentAlbum).toHaveBeenCalledWith(1);
    expect(get(pendingLibraryAlbum)).toBe(12);
    expect(get(activeView)).toBe('library');
  });
  it('l’album d’un service, par la coquille ; aucun album connu (404) → Lecture en cours', async () => {
    const ouvrirAlbum = vi.fn();
    gestesNavigationService.set({ ouvrirAlbum, ouvrirArtiste: vi.fn() } as any);
    zone({ source: 'qobuz', title: 'X', album_title: 'Y', cover_path: '/c.jpg', artist_name: 'Z' });
    getZoneCurrentAlbum.mockResolvedValue({ kind: 'streaming', service: 'qobuz', album_id: 'q9', artist_id: 'a1' });
    await ouvrirAlbumDeLaZoneCourante();
    expect(ouvrirAlbum).toHaveBeenCalledWith(expect.objectContaining({ service: 'qobuz', albumId: 'q9', titre: 'Y', artisteId: 'a1' }));
    getZoneCurrentAlbum.mockRejectedValue(new Error('404'));
    await ouvrirAlbumDeLaZoneCourante();
    expect(get(activeView)).toBe('nowplaying');
  });
  it('une radio ne demande rien au serveur : Lecture en cours', async () => {
    zone({ source: 'radio', title: 'FIP' });
    await ouvrirAlbumDeLaZoneCourante();
    expect(getZoneCurrentAlbum).not.toHaveBeenCalled();
    expect(get(activeView)).toBe('nowplaying');
  });
});

describe('artisteDAlbum / artisteDePisteEcoutee — la forme que lit la page artiste', () => {
  it('album local avec artist_id → identifiant ; de service → source_id ; sans → service d’écoute', () => {
    expect(artisteDAlbum({ artist_name: 'Air', artist_id: 3 })).toEqual({ id: 3, name: 'Air', source: 'local' });
    expect(artisteDAlbum({ artist_name: 'Air', artist_id: 'q9', source: 'qobuz' })).toEqual({ name: 'Air', source: 'qobuz', source_id: 'q9' });
    expect(artisteDAlbum({ artist_name: 'Air', source: 'qobuz' })).toEqual({ name: 'Air', service_ecoute: 'qobuz' });
    expect(artisteDAlbum({ artist_name: '' })).toBeNull();
  });
  it('piste de la file : artist_id_service prime ; locale : artist_id ; radio : le nom', () => {
    expect(artisteDePisteEcoutee({ source: 'qobuz', artist_id: 1, artist_id_service: 'q2', artist_name: 'Air' }))
      .toEqual({ name: 'Air', source: 'qobuz', source_id: 'q2' });
    expect(artisteDePisteEcoutee({ source: 'local', artist_id: 4, artist_name: 'Air' })).toEqual({ id: 4, name: 'Air', source: 'local' });
    expect(artisteDePisteEcoutee({ source: 'radio', artist_name: 'Air' })).toEqual({ name: 'Air' });
    expect(artisteDePisteEcoutee({ source: 'radio' })).toBeNull();
  });
});
