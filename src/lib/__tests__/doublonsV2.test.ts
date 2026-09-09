/**
 * Doublons dans le nouveau client : le serveur nomme et répare les albums
 * éclatés (BIB-A2), les artistes en double (BIB-C1) et les paires de pistes à
 * critère nommé (BIB-B3) ; l'onglet « Doublons » de l'écran Métadonnées les
 * montre et agit. Cette garde tient l'API, l'écran et les onze langues.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('onglet Doublons', () => {
  it("l'API porte les routes du serveur, telles quelles", () => {
    const api = lire('src/lib/api.ts');
    expect(api).toContain('`${BASE}/library/albums/eclates`');
    expect(api).toContain('/library/albums/${cible}/absorber/${doublon}');
    expect(api).toContain('`${BASE}/library/artists/doublons`');
    expect(api).toContain('/library/artists/${cible}/absorber/${doublon}');
    expect(api).toContain('`${BASE}/library/duplicates${q}`');
    expect(api).toContain('`${BASE}/library/duplicates/resolve`');
  });

  it("l'écran a son onglet, charge les trois listes et agit en deux clics", () => {
    const src = lire('src/components/v2/MetadataV2.svelte');
    expect(src).toContain("tab === 'doublons'");
    for (const f of ['api.getAlbumsEclates()', 'api.getArtistsDoublons()', 'api.getPairesDoublons()', 'api.absorbAlbum(', 'api.absorbArtist(', 'api.resolveTrackDuplicate(']) {
      expect(src, f).toContain(f);
    }
    expect(src).toContain("if (arme !== cle) { arme = cle; return; }");
    // Un groupe d'artistes aux identifiants MusicBrainz distincts ne se fusionne pas d'un clic.
    expect(src).toContain('disabled={!!g.mbid_distincts}');
  });

  it('les quinze clés existent dans les onze langues', () => {
    const cles = ['v2.meta.tabDoublons', 'v2.meta.dupAlbums', 'v2.meta.dupArtists', 'v2.meta.dupTracks', 'v2.meta.regroupIn', 'v2.meta.absorbIn', 'v2.meta.keepThis', 'v2.meta.confirm', 'v2.meta.noDup', 'v2.meta.critereFichier', 'v2.meta.critereContenu', 'v2.meta.critereEmpreinte', 'v2.meta.critereEtiquettes', 'v2.meta.recoKeep', 'v2.meta.mbidDistinct'];
    for (const l of ['fr', 'en', 'de', 'es', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const k of cles) expect(src, `${k} manque en ${l}`).toContain(`"${k}"`);
    }
  });
});
