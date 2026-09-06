/**
 * Retours de Bertrand du 05/09/2026 sur la v1 (0.9.137), avec deux captures.
 *
 * Favoris : « il manque les playlists, les collections » · « après avoir
 * enlevé le favori, l'objet ne disparaît pas de l'écran favoris : voulu ? » ·
 * « manquent format - rate - bit sur entrées Streaming et bit sur local ! ».
 * Étiquettes : « on doit pouvoir tagger tous les objets audio ».
 * Playlists : « manque une zone de recherche ».
 * Collections : « filtrées selon différents critères (dates, alpha) ».
 * Bibliothèque : « alignement des textes ».
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (src: string) =>
  src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Favoris — la ligne de piste est la ligne PARTAGÉE', () => {
  const src = sansCommentaires(lire('src/components/v2/FavoritesV2.svelte'));

  it('utilise LignePisteV2 au lieu de sa ligne maison', () => {
    expect(src).toContain('LignePisteV2');
    // La fonction qui omettait la profondeur ne doit pas revenir.
    expect(src).not.toContain('function tech(');
  });

  it('n a plus DEUX cœurs sur la même piste', () => {
    // Le bouton de retrait dessiné à côté de `PisteActions` a disparu :
    // c'est le double cœur de la capture du 05/09.
    expect(src).not.toContain('retirerPiste');
    expect(src).not.toContain('labelRetirerFavori');
  });

  it('la profondeur passe par le badge, qui la porte', () => {
    const ligne = sansCommentaires(lire('src/components/v2/LignePisteV2.svelte'));
    expect(ligne).toContain('bitDepth={piste.bit_depth}');
  });
});

describe('Favoris — retirer le cœur fait DISPARAÎTRE l objet', () => {
  const src = sansCommentaires(lire('src/components/v2/FavoritesV2.svelte'));

  it('les trois seaux se filtrent sur les magasins de favoris', () => {
    expect(src).toContain('function encoreFavori(');
    expect(src).toContain("encoreFavori(a, 'album')");
    expect(src).toContain("encoreFavori(t, 'track')");
    expect(src).toContain("encoreFavori(a, 'artist')");
    expect(src).toContain('$favoriteAlbumIds.has');
    expect(src).toContain('$favoriteTrackIds.has');
    expect(src).toContain('$favoriteArtistIds.has');
  });

  it('une piste locale reste affichée tant que son JUMEAU distant est favori', () => {
    expect(src).toContain('$favoriteStreamingTrackKeys.has(clePisteJumelee(');
  });

  it('un objet qu on ne sait pas juger est GARDÉ, pas effacé', () => {
    expect(src).toMatch(/if \(!service \|\| sid == null\) return true;/);
  });
});

describe('Favoris — les onglets manquants', () => {
  const src = sansCommentaires(lire('src/components/v2/FavoritesV2.svelte'));

  it('Playlists et Collections sont des onglets', () => {
    expect(src).toContain("'playlists'");
    expect(src).toContain("'collections'");
    // 🔴 RÉORIENTÉE le 06/09/2026 : les libellés sont passés par `$t()`. La
    // garde exigeait la chaîne française, ce qui interdisait de traduire les
    // onglets — le défaut même que Bertrand signalait ce jour-là. Ce qu'elle
    // protège reste entier : les deux onglets existent et sont nommés.
    expect(src).toContain("{ id: 'playlists', label: $t('favorites.playlists'");
    expect(src).toContain("{ id: 'collections', label: $t('v2.nav.collections'");
  });

  it('les deux familles de collections sont lues', () => {
    expect(src).toContain('f.collectionIds');
    expect(src).toContain('f.smartCollectionIds');
    expect(src).toContain('api.listSmartCollections()');
  });

  it('ouvrir mène à l OBJET, pas à sa liste', () => {
    // Le défaut du raccourci, déjà signalé le 05/09 : « le raccourci me
    // renvoie sur la liste des smart collections ». On rejoue le chemin que
    // les deux écrans honorent déjà.
    expect(src).toContain("new CustomEvent('tune:shortcut-restore'");
    expect(src).toContain('await tick()');
  });
});

describe('Playlists — la zone de recherche', () => {
  const src = sansCommentaires(lire('src/components/v2/PlaylistsV2.svelte'));

  it('un champ existe et porte une étiquette accessible', () => {
    expect(src).toContain('bind:value={recherche}');
    expect(src).toContain('aria-label={$t(\'v2.pl.searchPlaceholder\' as any)}');
  });

  it('elle filtre les QUATRE listes, pas une seule', () => {
    for (const liste of ['services[source]', 'smart.filter(', 'local.filter(', 'instantanes.filter(']) {
      expect(src).toContain(liste);
    }
    expect(src).toContain('function');
    expect(src).toContain('correspond');
  });

  it('la recherche ignore casse et accents', () => {
    expect(src).toMatch(/fold\(v \?\? ''\)\.includes\(fold\(recherche\)\)/);
  });
});

describe('Collections — le tri au choix', () => {
  const src = sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));

  it('les quatre critères existent', () => {
    expect(src).toContain("const TRIS = ['alpha', 'alphaInverse', 'recent', 'ancien'] as const");
  });

  it('la date vient du serveur, pas d une invention', () => {
    expect(src).toContain('creee: c.created_at ?? null');
    expect(src).toContain('creee: (c as any).created_at ?? null');
  });

  it('une collection sans date se range en FIN, dans les deux sens', () => {
    expect(src).toMatch(/if \(va\) return 1;/);
    expect(src).toMatch(/if \(vb\) return -1;/);
  });

  it('le choix est mémorisé', () => {
    expect(src).toContain("lireChoix<Tri>('v2.collections.tri', TRIS, 'alpha')");
    expect(src).toContain("ecrireChoix('v2.collections.tri', tri)");
  });
});

describe('Bibliothèque — les colonnes s alignent d une ligne à l autre', () => {
  const src = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

  it('le gabarit est calculé UNE fois et partagé', () => {
    expect(src).toContain('const colonnesListe = $derived(');
    expect(src).toContain('style="--lcols:{colonnesListe}"');
    expect(src).toContain('grid-template-columns:var(--lcols');
  });

  it('plus aucune colonne intrinsèque dans la ligne : elles se résolvaient par ligne', () => {
    const regle = /\.lrow\{[^}]*grid-template-columns:[^;]*;/.exec(src)?.[0] ?? '';
    expect(regle).not.toMatch(/\bauto\b/);
  });

  it('la cellule du badge existe même vide, sinon la technique glisse dedans', () => {
    expect(src).toContain('{#if showBadges}<span class="lb">');
    expect(src).toContain('.lrow .lb{');
  });

  it('les chiffres sont tabulaires et la technique ferrée à droite', () => {
    expect(src).toMatch(/\.lrow \.ly\{[^}]*font-variant-numeric:tabular-nums/);
    expect(src).toMatch(/\.lrow \.lq\{[^}]*text-align:right/);
  });
});

describe('Étiquettes — une PISTE s étiquette aussi', () => {
  const src = sansCommentaires(lire('src/components/v2/PisteActions.svelte'));

  it('la barre d actions porte le geste', () => {
    expect(src).toContain('panneauEtiquettes');
    expect(src).toContain('itemType="track"');
  });

  it('seule une piste de la BIBLIOTHÈQUE le propose', () => {
    // Une piste de service n'a pas d'identifiant numérique pour la route.
    expect(src).toContain('{#if local && piste.id != null}');
  });

  it('le panneau est chargé à la demande, pas à chaque ligne', () => {
    expect(src).toContain("import('./EtiquettesPanneau.svelte')");
  });
});
