// Tri des albums d'une collection manuelle — Bertrand, 16/09/2026 : « pouvoir
// les trier par Titre de l'album, Artistes et les 3 dates en ascendant ou
// descendant » — Année · Sortie · Ajout.
//
// Ce que ce fichier tient : les cinq clés et le sens partent AU SERVEUR
// (`?sort=&order=`) — c'est lui qui trie, pour que tous les clients lisent le
// même ordre ; le sélecteur n'existe que sur une collection manuelle ; le
// choix est mémorisé ; et aucun libellé nouveau n'a été inventé — les cinq
// clés et les deux sens réutilisent des libellés qui existent déjà dans les
// onze langues.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('tri des albums d’une collection', () => {
  const api = sansCommentaires(lire('src/lib/api.ts'));
  const vue = sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));

  it('la route reçoit la clé ET le sens', () => {
    expect(api).toMatch(/\/library\/collections\/\$\{id\}\/albums\?sort=\$\{sort\}&order=\$\{order\}/);
    expect(api).toMatch(/type CollectionAlbumsSort = 'artist' \| 'title' \| 'year' \| 'release_date' \| 'added_at' \| 'added'/);
  });

  it('les cinq clés demandées, dans cet ordre, et le serveur qui trie', () => {
    expect(vue).toMatch(/const TRIS_ALBUMS = \['artist', 'title', 'year', 'release_date', 'added_at'\] as const/);
    expect(vue).toMatch(/api\.getCollectionAlbums\(e\.id, triAlbums, sensAlbums\)/);
    // Aucun tri JavaScript sur la liste chargée : ce serait un second ordre.
    expect(vue).not.toMatch(/albums\s*=\s*\[\.\.\.albums\]\.sort|albums\.sort\(/);
  });

  // Bertrand, 17/09/2026 : « toujours pas de tri possible dans les playlists
  // et collections » — la collection INTELLIGENTE a désormais le sien, trié
  // côté client (sa route ne prend pas `?sort=`), la manuelle garde le serveur.
  it('une collection intelligente a son propre sélecteur, la manuelle garde le tri serveur', () => {
    const i = vue.indexOf('<label class="tricol">', vue.indexOf('<div class="v2-actions fa">'));
    expect(i).toBeGreaterThan(-1);
    expect(vue.slice(i - 80, i)).toMatch(/\{#if ouverte\.sorte === 'smart'\}/);
    expect(vue).toMatch(/\{:else\}\s*<label class="tricol">/);
    expect(vue).toMatch(/trierAlbums\(albums, triSmart === 'regles' \? 'pertinence' : triSmart, sensSmart\)/);
  });

  it('le choix est mémorisé, clé et sens', () => {
    expect(vue).toMatch(/lireChoix<TriAlbums>\('v2\.collection\.albums\.tri', TRIS_ALBUMS, 'artist'\)/);
    expect(vue).toMatch(/lireChoix<Sens>\('v2\.collection\.albums\.sens', SENS, 'asc'\)/);
  });

  it('aucun libellé inventé : tous existent déjà dans les onze langues', () => {
    const cles = ['v2.lib.sortArtist', 'v2.lib.sortTitle', 'v2.lib.sortYear',
      'library.sortReleaseDate', 'library.sortAddedDate', 'common.ascending', 'common.descending', 'v2.fav.sortBy'];
    for (const c of cles) expect(vue, c).toContain(`'${c}'`);
    for (const l of ['de','en','es','fr','hu','it','ja','ko','ro','sv','zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of cles) expect(src, `${l} : ${c}`).toContain(`"${c}":`);
    }
  });
});
