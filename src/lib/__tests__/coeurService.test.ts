/**
 * Le cœur sur une pochette de SERVICE (Qobuz, Tidal, …).
 *
 * Bertrand, 03/09/2026, sur le v2 : « il manque des boutons sur les covers
 * Qobuz », « et de mise en favoris ! sur la homepage », « idem Tidal »,
 * « seul le bouton edit devrait être invisible ».
 *
 * Les vignettes de service n'avaient ni cœur ni étiquettes, pour un motif
 * commun écrit dans les deux écrans : les deux s'appuient sur un identifiant de
 * la bibliothèque, qu'un album distant n'a pas. Le motif tenait pour les
 * étiquettes — la route serveur prend `item_id: i64`, la table SQLite un
 * `INTEGER`, et un album Qobuz s'identifie « kxend2k5wdg06 ». Il ne tenait PAS
 * pour le favori, qui a sa propre table (`streaming_favorites`, clef `service`
 * + `service_id` en TEXTE). Le cœur était donc absent sans raison.
 *
 * Ce fichier garde les deux moitiés du constat : le cœur est branché, et il
 * passe par l'UNIQUE chemin de `toggleStreamingFavorite` — la divergence des
 * deux cœurs signalée par Didier (forum #1478) s'était corrigée en n'en gardant
 * qu'un, et rebrancher un appel direct la rouvrirait.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { favoriExterneService } from '../streamingFavorites';
import { streamingFavKey } from '../stores/profile';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const streaming = () => lire('../../components/v2/StreamingV2.svelte');
const accueil = () => lire('../../components/v2/PageWidgets.svelte');
const favoris = () => lire('../../components/v2/FavoritesV2.svelte');

describe('Cœur d’un objet de service', () => {
  it('un objet sans identifiant distant n’a PAS de cœur', () => {
    // Un identifiant vide n'est pas une clé : le cœur cocherait d'un coup tous
    // les objets sans identifiant du même service.
    for (const serviceId of ['', '   ']) {
      expect(
        favoriExterneService(new Set(), { itemType: 'album', service: 'qobuz', serviceId }),
        `un identifiant « ${serviceId} » a quand même donné un cœur`,
      ).toBeNull();
    }
    expect(
      favoriExterneService(new Set(), { itemType: 'album', service: '', serviceId: 'kxend2k5wdg06' }),
      'un service vide a quand même donné un cœur',
    ).toBeNull();
  });

  it('le cœur est plein quand l’objet est dans le jeu de clés', () => {
    const ref = { itemType: 'album' as const, service: 'qobuz', serviceId: 'kxend2k5wdg06' };
    const clefs = new Set([streamingFavKey('album', 'qobuz', 'kxend2k5wdg06')]);
    expect(favoriExterneService(clefs, ref)?.actif, 'le cœur est resté vide').toBe(true);
    expect(favoriExterneService(new Set(), ref)?.actif, 'le cœur est plein sans raison').toBe(false);
  });

  it('un même identifiant chez DEUX services reste deux objets', () => {
    // Qobuz et Tidal peuvent porter le même identifiant sans parler du même
    // disque. La clé porte le service, sinon cocher l'un cocherait l'autre.
    const clefs = new Set([streamingFavKey('album', 'qobuz', 'abc')]);
    expect(
      favoriExterneService(clefs, { itemType: 'album', service: 'tidal', serviceId: 'abc' })?.actif,
      'le favori Qobuz a coché la pochette Tidal',
    ).toBe(false);
  });

  it('un même identifiant sur un album et sur un artiste reste deux objets', () => {
    const clefs = new Set([streamingFavKey('album', 'qobuz', 'abc')]);
    expect(
      favoriExterneService(clefs, { itemType: 'artist', service: 'qobuz', serviceId: 'abc' })?.actif,
      'le favori de l’album a coché celui de l’artiste',
    ).toBe(false);
  });
});

describe('Les écrans qui portent des pochettes de service', () => {
  it('la vignette de l’écran Streaming passe un cœur', () => {
    expect(
      /favoriExterne=\{[\s\S]{0,400}?favoriExterneService\(\$favoriteStreamingKeys/.test(streaming()),
      'les pochettes de l’écran Streaming ont reperdu leur cœur',
    ).toBe(true);
  });

  it('la vignette de l’accueil passe un cœur sur un album DISTANT', () => {
    const src = accueil();
    expect(
      /favoriExterne=\{[\s\S]{0,400}?favoriExterneService\(\$favoriteStreamingKeys/.test(src),
      'les bandes de l’accueil ont reperdu leur cœur de service',
    ).toBe(true);
    // Le cœur local et le cœur distant ne doivent pas se disputer la même
    // pochette : `favoriExterne` ne se calcule que faute d'identifiant local.
    expect(
      src.includes('{@const sidDistant = idLocal == null ? (el.fiche?.source_id ?? null) : null}'),
      'un album de la bibliothèque peut recevoir les DEUX cœurs à la fois',
    ).toBe(true);
  });

  it('aucun des deux écrans n’écrit le favori de service à la main', () => {
    // Le défaut de Didier (#1478) : deux chemins, deux vérités. Le magasin et
    // le service ne se recopient que dans `toggleStreamingFavorite`.
    for (const [nom, src] of [
      ['StreamingV2', streaming()],
      ['PageWidgets', accueil()],
    ] as const) {
      for (const appel of [
        'addProfileStreamingFavorite',
        'removeProfileStreamingFavorite',
        'addStreamingFavorite(',
        'removeStreamingFavorite(',
      ]) {
        expect(src.includes(appel), `${nom} rappelle « ${appel} » en direct`).toBe(false);
      }
    }
  });

  it('une playlist de service n’a pas de cœur', () => {
    // `streaming_favorites.item_type` ne connaît que piste, album et artiste.
    // Un cœur sur une playlist serait un bouton qui échoue en silence.
    expect(
      streaming().includes('{@render tile(p, () => playPlaylist(p), null)}'),
      'les playlists de service redemandent un cœur que le serveur ne stocke pas',
    ).toBe(true);
  });
});

describe('L’écran Favoris montre AUSSI les favoris de service', () => {
  /**
   * Bertrand, 03/09/2026 : « Sidebar Favoris et ceux des services de
   * streaming ?? ». L'écran n'appelait que `getFavorites` — les favoris de la
   * bibliothèque. Les cœurs posés sur une pochette Qobuz ou Tidal partent dans
   * une AUTRE table (`streaming_favorites`) : ils s'enregistraient, et
   * n'apparaissaient nulle part. Mesure sur le .18 le 03/09/2026 : deux
   * favoris de service rangés, zéro affiché.
   */
  it('les deux sources sont lues', () => {
    const src = favoris();
    expect(src.includes('api.getFavorites('), 'les favoris de la bibliothèque ont disparu').toBe(true);
    expect(
      src.includes('api.getProfileStreamingFavorites('),
      'l’écran a reperdu les favoris de service : les cœurs Qobuz/Tidal ne reviennent nulle part',
    ).toBe(true);
  });

  it('un service muet ne vide pas les favoris de la bibliothèque', () => {
    expect(
      /getProfileStreamingFavorites\(pid\)\.catch\(/.test(favoris()),
      'une route absente sur un serveur ancien ferait tomber TOUT l’écran',
    ).toBe(true);
  });

  it('les trois onglets accueillent les deux origines', () => {
    const src = favoris();
    for (const [nom, conv] of [
      ['albums', 'versAlbum'],
      ['titres', 'versPiste'],
      ['artistes', 'versArtiste'],
    ] as const) {
      expect(src.includes(`.map(${conv})`), `l’onglet ${nom} ne reçoit plus les objets de service`).toBe(true);
    }
  });

  it('deux objets de service ne se disputent pas la clé « null »', () => {
    // `id` est nul sur TOUT objet de service. Deux entrées de clé `null`
    // arrêtent Svelte sur `each_key_duplicate` — l'écran entier disparaît.
    const src = favoris();
    const cles = src.match(/\{#each v(?:Albums|Tracks|Artists) as [^}]*\}/g) ?? [];
    expect(cles.length, 'les trois listes n’ont plus leur clé').toBe(3);
    for (const c of cles) {
      expect(c.includes('clef('), `une liste garde une clé qui vaut null deux fois : ${c}`).toBe(true);
    }
  });

  it('le retrait vise la table qui PORTE le favori', () => {
    // `removeFavorite({track_id: undefined})` sur une piste de service ne
    // retire rien, et ne le dit pas.
    expect(favoris().includes('async function retirerPiste('), 'le retrait est redevenu unique').toBe(true);
    expect(
      /retirerPiste[\s\S]{0,700}?coeurService\(t, 'track'\)/.test(favoris()),
      'le retrait d’une piste de service ne passe plus par le cœur qui l’avait posée',
    ).toBe(true);
  });

  it('la fiche d’un album de service est ouverte EN TANT QUE service', () => {
    expect(
      favoris().includes("service={opened.id == null ? ((opened as any).source ?? null) : null}"),
      'la fiche chercherait les pistes d’un album distant par un id local inexistant',
    ).toBe(true);
  });
});

describe('Voir les métadonnées d’un album de service', () => {
  /**
   * Bertrand, 04/09/2026 : « si si bouton edit permettait juste d'afficher les
   * metadata de l'album ». Sur l'écran Streaming, cliquer une pochette LANÇAIT
   * la lecture — `onOuvrir` valait `onPlay` — au motif écrit dans le code que
   * « cet écran n'a pas de fiche distante à ouvrir ». C'était faux :
   * `AlbumDetailV2` prend un `service` depuis le début, et l'accueil l'ouvrait
   * déjà ainsi. Il n'y avait donc AUCUN moyen de voir les métadonnées d'un
   * album Qobuz ou Tidal.
   */
  it('la pochette OUVRE la fiche, elle ne se contente plus de lire', () => {
    const src = streaming();
    expect(src.includes("import AlbumDetailV2 from './AlbumDetailV2.svelte';"),
      'l’écran Streaming a reperdu la fiche album').toBe(true);
    expect(src.includes('onOuvrir={ouvrirFiche(p, type) ?? onPlay}'),
      'cliquer une pochette relance la lecture au lieu d’ouvrir la fiche').toBe(true);
    // La fiche doit être ouverte EN TANT QUE service : sans le drapeau, elle
    // chercherait les pistes par un `id` local qui n'existe pas.
    expect(/<AlbumDetailV2[^>]*service=\{ficheService\}/.test(src),
      'la fiche est ouverte sans son service').toBe(true);
  });

  it('ce qui n’a pas de fiche retombe sur la lecture', () => {
    // Une playlist, une piste, un objet Bandcamp (identifié par une URL, pas
    // par un `source_id`) n'ont pas de fiche. `ouvrirFiche` rend `null`, et le
    // clic reste ce qu'il était plutôt que de ne rien faire.
    expect(/if \(type !== 'album' \|\| !sid \|\| !svc \|\| svc === BANDCAMP\) return null;/.test(streaming()),
      'la garde de `ouvrirFiche` a changé : une playlist pourrait ouvrir une fiche vide').toBe(true);
  });

  it('le CRAYON reste absent d’un album de service', () => {
    // `AlbumEditModal` écrit par `updateAlbum(album.id, …)` : sur un album
    // distant, `id` est nul. Un crayon y serait un bouton qui ment.
    expect(streaming().includes('onEditer'), 'un crayon est apparu sur une pochette de service').toBe(false);
  });
});
