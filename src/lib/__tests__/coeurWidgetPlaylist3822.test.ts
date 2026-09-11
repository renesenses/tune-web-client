/**
 * Le cœur sur les vignettes de playlist des WIDGETS — seconde moitié de #3822
 * (FabienM, fil 1749, point 12). La première moitié — les vignettes de l'écran
 * Streaming — est partie dans sa propre branche.
 *
 * > « Il n'y a pas l'icone du coeur sur les playlist Qobuz pour les mettre en
 * >   favoris -> il faut rajouter l'icone dans le coin de la vignette »
 *
 * Fabien ne dit pas QUEL écran. Les quatre étaient dans le même cas, et les
 * widgets — Éditorial Qobuz/Tidal, Accueil — pour deux raisons cumulées :
 *
 *  1. `playlistDistante()` et `ficheDe(…, 'playlist')` ne posaient AUCUN champ
 *     d'identité distante sur l'élément. `PageWidgets` n'avait donc rien à
 *     quoi accrocher un cœur ;
 *  2. et quand bien même, son `favoriExterne` typait `itemType: 'album'` en
 *     dur : une playlist aurait été mise en favori comme un album, sous une
 *     clé que l'écran Favoris ne relit pas.
 *
 * ## Pourquoi un champ à part, et pas `fiche`
 *
 * `fiche` est documenté comme « l'album normalisé pour la fiche, quand `ouvrir`
 * vaut `album` ». Une playlist de widget n'ouvre rien — les deux notions se
 * recouvrent pour un album, pas au-delà. Détourner `fiche` aurait aussi fait
 * apparaître `onEditer` et `ouvrir` sur des objets qui n'en veulent pas. D'où
 * `favoriDistant`, qui ne dit QUE l'identité de favori.
 *
 * ## La prémisse, mesurée côté serveur
 *
 * `streaming_favorites.item_type` est un `TEXT NOT NULL` **sans énumération ni
 * contrainte** (`tune-core/src/db/migrations.rs`), et
 * `streaming_favorites_repo.rs` fait transiter `item_type: &str` sans le
 * valider. La table prend `playlist`, et `favoriPlaylistQobuz.test.ts` vérifie
 * qu'un favori ainsi écrit est bien relu.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as api from '../api';
import { catalogueService } from '../widgetsService';
import { widgetParId, type Contexte } from '../accueilWidgets';

afterEach(() => vi.restoreAllMocks());

const ctx: Contexte = { profileId: 1, albums: [], zones: [] };

/** Une playlist telle que `/streaming/{service}/playlists/featured` la rend. */
const playlist = (o: any = {}) => ({
  source_id: '77', name: 'Jazz du dimanche', owner: 'Qobuz',
  cover_path: 'http://x/c.jpg', ...o,
});

describe('#3822 — Éditorial : la playlist d’un service porte le cœur', () => {
  async function bande(id: string, liste: any[]) {
    vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue([] as any);
    vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as any);
    vi.spyOn(api, 'getStreamingFeaturedPlaylists').mockResolvedValue(liste as any);
    const w = (await catalogueService('qobuz')).find((x) => x.id === id);
    expect(w, `le widget « ${id} » doit exister`).toBeTruthy();
    return w!.charger(ctx);
  }

  it('pose `favoriDistant` typé playlist sur la bande éditoriale', async () => {
    const els = await bande('qobuz-playlists-editoriales', [playlist()]);
    expect(els[0].favoriDistant).toEqual({ itemType: 'playlist', serviceId: '77' });
  });

  /** Sans identifiant, pas de clé : un cœur y serait une icône morte — la même
   *  règle que `favoriExterneService`, qui rend `null` sur un identifiant vide. */
  it('ne pose aucun cœur sur une playlist sans identifiant de service', async () => {
    const els = await bande('qobuz-playlists-editoriales', [playlist({ source_id: '' })]);
    expect(els[0]?.favoriDistant).toBeFalsy();
  });

  /** La playlist ne s'OUVRE toujours pas depuis un widget : le cœur s'ajoute,
   *  il ne remplace rien et n'invente aucun geste. */
  it('n’invente pas d’ouverture de fiche au passage', async () => {
    const els = await bande('qobuz-playlists-editoriales', [playlist()]);
    expect(els[0].ouvrir).toBeFalsy();
    expect(els[0].fiche).toBeUndefined();
    expect(typeof els[0].jouer, 'la lecture doit survivre').toBe('function');
  });
});

describe('#3822 — Accueil : le widget « Sélection Qobuz »', () => {
  it('pose `favoriDistant` typé playlist', async () => {
    vi.spyOn(api, 'getStreamingFeaturedPlaylists').mockResolvedValue([playlist()] as any);
    const w = widgetParId('qobuz-selection');
    expect(w, 'le widget « qobuz-selection » doit exister').toBeTruthy();
    const els = await w!.charger(ctx);
    expect(els[0].favoriDistant).toEqual({ itemType: 'playlist', serviceId: '77' });
  });
});

/**
 * Non-régression du chemin ALBUM. `PageWidgets` rend TOUTES les vignettes de
 * widget : un album ne doit rien gagner ni rien perdre à ce changement.
 */
describe('#3822 — le chemin album reste intact', () => {
  it('un album éditorial garde sa fiche, son ouverture, et aucun `favoriDistant`', async () => {
    vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue(
      [{ id: 'new-releases', name: 'New Releases' }] as any,
    );
    vi.spyOn(api, 'getStreamingGenres').mockResolvedValue([] as any);
    vi.spyOn(api, 'getStreamingFeatured').mockResolvedValue(
      [{ source_id: 'kxend2k5wdg06', title: 'Kind of Blue', artist_name: 'Miles Davis' }] as any,
    );
    const w = (await catalogueService('qobuz')).find((x) => x.id === 'qobuz-sec-new-releases');
    const els = await w!.charger(ctx);
    expect(els[0].fiche?.source_id).toBe('kxend2k5wdg06');
    expect(els[0].ouvrir).toBe('album');
    expect(els[0].favoriDistant, 'un album n’a pas à porter `favoriDistant`').toBeUndefined();
  });
});

/**
 * Garde de code : les champs ci-dessus ne servent à rien si le rendu ne les
 * lit pas. `PageWidgets` ne se monte pas en test — il demande le magasin de
 * profil, l'API et les quatre services.
 */
describe('#3822 — PageWidgets lit bien le type et l’identifiant', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/v2/PageWidgets.svelte'),
    'utf-8',
  );

  it('le type du cœur n’est plus « album » en dur', () => {
    expect(src).toContain('itemType: typeFavori');
    expect(src, 'un `album` en dur subsiste dans favoriExterne').not.toContain(
      "itemType: 'album',\n                              service:",
    );
  });

  it('l’identifiant distant retombe sur `favoriDistant`', () => {
    expect(src).toContain('el.favoriDistant?.serviceId');
  });

  it('le type retombe sur « album » quand l’élément n’en porte pas', () => {
    expect(src).toContain("el.favoriDistant?.itemType ?? 'album'");
  });
});
