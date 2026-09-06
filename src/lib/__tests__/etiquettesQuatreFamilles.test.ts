/**
 * « Pas de prise en compte des tags artistes ! » (Bertrand, 06/09/2026).
 *
 * Le défaut ne venait pas du serveur, ni du geste : on pouvait DÉJÀ étiqueter
 * un artiste depuis sa pochette (ArtistesV2, Favoris). C'est l'écran
 * Étiquettes qui ne savait pas le relire — et il ne le savait pas parce qu'un
 * COMMENTAIRE l'affirmait :
 *
 *   « `GET /tags/{id}/albums` est la SEULE route qui liste par étiquette. »
 *
 * Mesuré sur le .18 le 06/09/2026, les quatre répondent 200 avec la même
 * forme. Une phrase tenait la moitié de la fonction hors service.
 *
 * Neuvième « écrit mais pas branché » de ce client — et le premier où la
 * consigne à retenir est : sonder la route avant de croire le commentaire qui
 * dit qu'elle n'existe pas.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('les quatre routes de listage par étiquette', () => {
  const api = sansCommentaires(lire('src/lib/api.ts'));

  it.each([
    ['getTagAlbums', 'albums'],
    ['getTagArtists', 'artists'],
    ['getTagTracks', 'tracks'],
    ['getTagPlaylists', 'playlists'],
  ])('%s vise /tags/{id}/%s', (fn, chemin) => {
    expect(api).toContain(`export function ${fn}(tagId: number)`);
    const i = api.indexOf(`export function ${fn}(`);
    expect(api.slice(i, i + 400)).toContain(`/tags/\${tagId}/${chemin}`);
  });
});

describe("l'écran Étiquettes lit les quatre familles", () => {
  const src = sansCommentaires(lire('src/components/v2/EtiquettesV2.svelte'));

  it.each(['getTagAlbums', 'getTagArtists', 'getTagTracks', 'getTagPlaylists'])(
    'appelle %s', (fn) => { expect(src).toContain(`api.${fn}(tag.id!)`); },
  );

  it('les quatre partent EN PARALLÈLE', () => {
    // En série, ouvrir une étiquette coûterait quatre allers-retours avant le
    // premier pixel. Les compteurs des onglets doivent être justes tout de
    // suite : un onglet « Artistes » sans nombre n'invite pas à cliquer.
    const i = src.indexOf('Promise.all([');
    expect(i).toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 500);
    for (const fn of ['getTagAlbums', 'getTagArtists', 'getTagTracks', 'getTagPlaylists'])
      expect(bloc).toContain(fn);
  });

  it('une famille en échec ne vide pas les trois autres', () => {
    const i = src.indexOf('Promise.all([');
    const bloc = src.slice(i, i + 500);
    expect(bloc.match(/\.catch\(\(\) => null\)/g)).toHaveLength(4);
  });

  it("l'ouverture se pose sur la première famille NON VIDE", () => {
    // Une étiquette qui ne porte que des artistes s'ouvrait sur un onglet
    // Albums vide : c'est ce vide qui se lisait comme « pas de prise en
    // compte ».
    expect(src).toMatch(/famille = ONGLETS\.find\(\(o\) => compte\[o\.id\] > 0\)\?\.id \?\? 'albums'/);
  });

  it('le compte annoncé porte sur les quatre familles', () => {
    // Annoncer un nombre d'albums au-dessus de quatre onglets ferait mentir
    // l'en-tête dès qu'on change d'onglet.
    expect(src).toMatch(/total = \$derived\(albums\.length \+ artistes\.length \+ pistes\.length \+ listes\.length\)/);
    expect(src).toContain("$t('v2.tags.itemsWithTag' as any)");
  });

  it('chaque famille a son propre message de vide', () => {
    for (const c of ['noAlbumWithTag', 'noArtistWithTag', 'noTrackWithTag', 'noPlaylistWithTag'])
      expect(src, `il manque v2.tags.${c}`).toContain(`v2.tags.${c}`);
  });

  it('les pistes passent par la ligne partagée, pas par un rendu maison', () => {
    expect(src).toContain('LignePisteV2');
  });

  it("l'en-tête documente les QUATRE routes, mesure à l'appui", () => {
    // Ici on lit le commentaire A DESSEIN, contrairement au reste du fichier.
    //
    // C'est un commentaire qui avait mis la fonction hors service : il
    // affirmait qu'une seule route existait, et l'écran l'a cru. La citation
    // de cette phrase reste — savoir qu'on s'est trompé vaut mieux que
    // l'effacer — mais les quatre routes doivent figurer à côté, sans quoi le
    // prochain lecteur retirera les trois appels « puisque ça n'existe pas ».
    const brut = lire('src/components/v2/EtiquettesV2.svelte');
    const entete = brut.slice(0, brut.indexOf('</script>'));
    for (const r of ['/tags/1/albums', '/tags/1/artists', '/tags/1/tracks', '/tags/1/playlists'])
      expect(entete, `${r} doit être documentée`).toContain(r);
  });
});
