// 🔴 `renesenses/tune-web-client#911` — Didier, fil 1571 :
//
//   « pourquoi ne pas mettre au début de la page Qobuz les thèmes "Mes
//     playlists" et "Albums favoris" plutôt qu'à la fin de cette très longue
//     page ? »
//
// 🔴 LA SPÉCIFICATION EST DANS LE FIL, PAS DANS LA FICHE
// ------------------------------------------------------
// Le fil porte SEPT réponses. Deux d'entre elles décident, et aucune n'était
// remontée dans la fiche — je les y ai portées le 12/09 avant d'écrire ce lot.
//
// L'ORDRE, convenu avec Didier (réponse 1) :
//   « avec l'ordre exact que vous proposez : Albums favoris, puis Mes
//     playlists, puis les thèmes Qobuz. »
//
// ⚠️ LA CONTRAINTE, posée par FabienM (réponse 2), qui affine la demande au
// lieu de s'y opposer :
//   « Attention à ne pas mettre les titres favoris car la liste peut être
//     longue et reléguer très loin les propositions de Qobuz, ce qui les
//     rendra quasi invisibles. »
//
// Les TITRES favoris ne remontent donc pas — et ce n'est pas un oubli. La
// route les sert pourtant : mesuré le 12/09 sur la .18 en v0.9.147,
// `/streaming/qobuz/favorites/tracks` rend 14 titres.
//
// ET LE WIDGET « ALBUMS FAVORIS » N'EXISTAIT PAS
// Le catalogue n'en avait aucun, alors que la route répond et que le client
// sait déjà la demander :
//   GET /streaming/qobuz/favorites/albums   → 3 albums
//   GET /streaming/qobuz/favorites/artists  → 0
//
// CONTRE-ÉPREUVE : le dernier bloc rejoue l'ordre d'AVANT et montre que ce qui
// appartient à l'utilisateur y arrivait en dernier.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { catalogueService, dispositionDefautService } from '../widgetsService';
import type { Widget } from '../accueilWidgets';

afterEach(() => vi.restoreAllMocks());

const bande = (id: string, categorie?: Widget['categorie']): Widget => ({
  id, cleTitre: id, forme: 'bande', charger: async () => [],
  ...(categorie ? { categorie } : {}),
});

/** Le catalogue Qobuz, dans son ordre réel. */
const QOBUZ: Widget[] = [
  bande('qobuz-nouveautes'),
  ...['new-releases', 'best-sellers', 'press-awards', 'editor-picks'].map((s) => bande(`qobuz-sec-${s}`)),
  bande('qobuz-playlists-editoriales'),
  ...['hi-res', 'mood', 'focus'].map((t) => bande(`qobuz-tag-${t}`, 'playlists-editoriales')),
  bande('qobuz-albums-favoris', 'a-moi'),
  bande('qobuz-mes-playlists', 'a-moi'),
  ...Array.from({ length: 5 }, (_, i) => bande(`qobuz-genre-${i}`)),
];

describe('#911 — ce qui est À MOI passe devant', () => {
  it('🔴 l’ordre exact convenu avec Didier : favoris, playlists, puis les thèmes', () => {
    const d = dispositionDefautService(QOBUZ);
    expect(d[0]).toBe('qobuz-albums-favoris');
    expect(d[1]).toBe('qobuz-mes-playlists');
    expect(d[2], 'les thèmes ne suivent pas immédiatement').toBe('qobuz-nouveautes');
  });

  it('les bandes de service gardent leur ordre derrière', () => {
    const d = dispositionDefautService(QOBUZ);
    expect(d.slice(2, 6)).toEqual([
      'qobuz-nouveautes', 'qobuz-sec-new-releases',
      'qobuz-sec-best-sellers', 'qobuz-sec-press-awards',
    ]);
  });

  it('les catégories de playlists suivent, sans doublon', () => {
    const d = dispositionDefautService(QOBUZ);
    expect(d.filter((x) => x.startsWith('qobuz-tag-')))
      .toEqual(['qobuz-tag-hi-res', 'qobuz-tag-mood', 'qobuz-tag-focus']);
    expect(new Set(d).size, 'un identifiant est rendu deux fois').toBe(d.length);
  });

  it('un service SANS rien à moi n’est pas gonflé', () => {
    const tidal = [bande('tidal-nouveautes'), bande('tidal-genre-0'), bande('tidal-genre-1')];
    expect(dispositionDefautService(tidal))
      .toEqual(['tidal-nouveautes', 'tidal-genre-0', 'tidal-genre-1']);
  });
});

describe('#911 — ⚠️ les TITRES favoris ne remontent PAS', () => {
  it('la contrainte de FabienM est tenue : aucun widget de titres favoris', async () => {
    // Il l'a posée dans le fil : la liste peut être longue et reléguerait les
    // propositions Qobuz hors de vue. La route les sert (14 sur la .18), et
    // c'est un CHOIX de ne pas les offrir ici.
    const api = await import('../api');
    vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([] as never);
    vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as never);
    vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue([] as never);

    const cat = await catalogueService('qobuz');
    const ids = cat.map((w) => w.id);
    expect(ids, 'un widget de titres favoris est apparu').not.toContain('qobuz-titres-favoris');
    expect(ids.some((i) => /favoris/.test(i) && /titre|track/.test(i))).toBe(false);
  });
});

describe('#911 — le widget « Albums favoris » existe enfin', () => {
  it('🔴 il est dans le catalogue, et marqué « à moi »', async () => {
    const api = await import('../api');
    vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([] as never);
    vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as never);
    vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue([] as never);

    const cat = await catalogueService('qobuz');
    const w = cat.find((x) => x.id === 'qobuz-albums-favoris');
    expect(w, 'le widget des albums favoris n’a pas été bâti').toBeTruthy();
    expect(w!.categorie).toBe('a-moi');
    expect(w!.cleTitre).toBe('v2.svc.wFavAlbums');
  });

  it('« Mes playlists » est marquée aussi — sans quoi elle resterait en bas', async () => {
    const api = await import('../api');
    vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([] as never);
    vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as never);
    vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue([] as never);

    const cat = await catalogueService('qobuz');
    expect(cat.find((x) => x.id === 'qobuz-mes-playlists')?.categorie).toBe('a-moi');
  });
});

describe('#911 — CONTRE-ÉPREUVE', () => {
  it('l’ordre d’avant reléguait bien ce qui est à moi', () => {
    // `catalogue.slice(0, 4)` puis les catégories : ni les favoris ni mes
    // playlists n'y entraient — c'est la « très longue page » de Didier.
    const tete = QOBUZ.slice(0, 4).map((w) => w.id);
    const cats = QOBUZ.filter((w) => w.categorie === 'playlists-editoriales').map((w) => w.id);
    const avant = [...tete, ...cats];
    expect(avant.includes('qobuz-albums-favoris'), 'le témoin ne reproduit pas le défaut').toBe(false);
    expect(avant.includes('qobuz-mes-playlists')).toBe(false);
    // Et la règle actuelle les met en tête.
    expect(dispositionDefautService(QOBUZ).slice(0, 2))
      .toEqual(['qobuz-albums-favoris', 'qobuz-mes-playlists']);
  });
});
