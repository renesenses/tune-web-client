import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHAMPS, OPERATEURS, typeDuChamp, operateursDe, sansValeur, regleComplete, valeurInitiale,
} from '../smartRegles';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Grammaire des règles : une seule, partagée', () => {
  it('elle décrit tous les champs que le serveur connaît', () => {
    // Recopier vingt-deux champs dans un second éditeur aurait donné deux
    // vocabulaires qui divergent à la première addition.
    expect(CHAMPS.length).toBe(24);
    for (const c of CHAMPS) {
      expect(OPERATEURS[c.type], `${c.value} : type sans opérateurs`).toBeTruthy();
      expect(OPERATEURS[c.type].length).toBeGreaterThan(0);
    }
  });

  it('un champ inconnu retombe sur le texte, il ne casse pas', () => {
    expect(typeDuChamp('champ_invente')).toBe('text');
    expect(operateursDe('champ_invente')).toBe(OPERATEURS.text);
  });

  it('« est vide » n’attend PAS de valeur', () => {
    // Exiger une saisie pour ceux-là bloquerait une règle parfaitement formée.
    expect(sansValeur('is_null')).toBe(true);
    expect(sansValeur('is_not_null')).toBe(true);
    expect(sansValeur('contains')).toBe(false);
    expect(regleComplete({ field: 'cover_path', op: 'is_null', value: null })).toBe(true);
  });

  it('une règle incomplète est reconnue AVANT l’enregistrement', () => {
    // Le serveur la refuse, mais l'erreur ne remonte qu'après que tout est
    // saisi.
    expect(regleComplete({ field: 'artist_name', op: 'contains', value: '' })).toBe(false);
    expect(regleComplete({ field: '', op: 'contains', value: 'x' })).toBe(false);
    expect(regleComplete({ field: 'artist_name', op: 'contains', value: 'Miles' })).toBe(true);
  });

  it('« entre » exige ses DEUX bornes', () => {
    expect(regleComplete({ field: 'year', op: 'between', value: [1960] })).toBe(false);
    expect(regleComplete({ field: 'year', op: 'between', value: [1960, ''] })).toBe(false);
    expect(regleComplete({ field: 'year', op: 'between', value: [1960, 1969] })).toBe(true);
  });

  it('la valeur de départ suit l’opérateur ET le type', () => {
    expect(valeurInitiale('is_null', 'text')).toBeNull();
    expect(valeurInitiale('between', 'int')).toEqual([0, 0]);
    expect(valeurInitiale('between', 'timestamp')).toEqual(['', '']);
    expect(valeurInitiale('=', 'int')).toBe(0);
    expect(valeurInitiale('contains', 'text')).toBe('');
    // Un FAVORI se qualifie par sa SORTE, pas par un oui/non : partir sur
    // `true` produisait une regle que le serveur ne sait pas apparier — zero
    // album, sans rien dire.
    expect(valeurInitiale('is', 'favorite')).toBe('');
  });
});

describe("L'éditeur v2 de collection intelligente", () => {
  const ed = sansCommentaires(lire('src/components/v2/CollectionSmartEditeurV2.svelte'));
  const col = sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));

  it('il puise dans la grammaire partagée, il ne la recopie pas', () => {
    expect(ed).toContain("from '../../lib/smartRegles'");
    expect(ed, 'un vocabulaire recopié').not.toContain("labelKey: 'smartCollection.fieldArtist'");
  });

  it("il ANNONCE ce que les règles retiennent avant d'enregistrer", () => {
    // Une règle mal posée ne se voit qu'à l'usage : « année > 2020 » sur une
    // discothèque de jazz peut ne rien rendre.
    expect(ed).toContain('api.previewSmartCollection(');
    expect(ed).toContain('v2.smart.previewCount');
    // 🔴 Sans `max_limit` : le serveur calcule `total` comme la LONGUEUR de la
    // liste rendue, donc le plafonner plafonne le compteur. Mesuré sur le .18,
    // même règle : `max_limit: 1` -> total 1 ; sans limite -> total 1853.
    expect(ed, 'le compteur est de nouveau plafonne').not.toContain('max_limit');
    // Débouncé : on tape dans un champ, pas la peine d'interroger à chaque
    // lettre.
    expect(ed).toContain('setTimeout(');
    expect(ed).toContain('clearTimeout(');
  });

  it('il ne descend jamais sous UNE règle', () => {
    // Zéro règle retiendrait toute la bibliothèque, ce que personne ne demande
    // sciemment.
    expect(ed).toContain('if (regles.length <= 1) return;');
  });

  it('un FAVORI se qualifie par sa SORTE', () => {
    // Mesure sur le .18, meme regle : `true` -> 0 album, `"album"` -> 3.
    expect(ed).toContain('<option value="track">');
    expect(ed).toContain('<option value="album">');
    expect(ed).toContain('<option value="artist">');
    expect(ed, 'le oui/non est revenu').not.toContain("e.currentTarget.value === 'true'");
    // Et une sorte non choisie n'est pas une regle complete.
    expect(regleComplete({ field: 'favorite', op: 'is', value: '' })).toBe(false);
    expect(regleComplete({ field: 'favorite', op: 'is', value: 'album' })).toBe(true);
  });

  it('les RÉFÉRENCES ont chacune leur sélecteur', () => {
    // Bertrand, 05/09/2026 : « améliorer la gestion dans les règles de :
    // collections, playlists et favoris ». La valeur est `classic:<id>` ou
    // `smart:<id>` — une saisie libre y produirait des règles refusées après
    // coup.
    expect(ed).toContain("'collection_ref', 'playlist_ref'");
    expect(ed).toContain('`classic:${c.id}`');
    expect(ed).toContain('`smart:${c.id}`');
    expect(ed).toContain('`classic:${p.id}`');
    expect(ed).toContain('`smart:${p.id}`');
    // Les quatre listes réelles, chacune tolérant l'échec : un serveur sans
    // playlists intelligentes ne doit pas priver des trois autres.
    for (const a of ['api.getCollections()', 'api.listSmartCollections()',
                     'api.getPlaylists(500)', 'api.getSmartPlaylists()']) {
      expect(ed, a).toContain(a);
    }
    expect((ed.match(/\.catch\(\(\) => \[\]\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("la collection editee ne peut pas se referencer elle-meme", () => {
    // Le serveur refuse l'auto-reference : la proposer serait promettre une
    // chose impossible.
    expect(ed).toContain('.filter((x: any) => x.id !== moi)');
  });

  it('une reference part VIDE, et une reference vide n’est pas complete', () => {
    // Sans quoi on enregistrerait « dans la collection <rien> ».
    expect(valeurInitiale('in', 'collection_ref')).toBe('');
    expect(regleComplete({ field: 'in_collection', op: 'in', value: '' })).toBe(false);
    expect(regleComplete({ field: 'in_collection', op: 'in', value: 'classic:3' })).toBe(true);
  });

  it("le seul champ encore hors de portee est `credit`", () => {
    // Il demande un controle a DEUX valeurs (role + nom). Il reste dans la
    // grammaire : une collection qui l'utilise s'ouvre sans le perdre.
    expect(ed).toContain('SAISISSABLES');
    expect(ed).not.toContain("'credit'");
    expect(CHAMPS.some((c) => c.type === 'credit')).toBe(true);
  });

  it('il va CHERCHER la collection à modifier', () => {
    // L'écran ne porte qu'une forme normalisée, sans règles ni mode.
    expect(ed).toContain('api.getSmartCollection(id)');
    expect(col).toContain('editeurSmart = { id: e.id }');
  });

  it("l'écran Collections sait enfin en créer une", () => {
    // « Et comment ajouter une smart collection ? » — on ne pouvait pas.
    expect(col).toContain('editeurSmart = { id: null }');
    expect(col).toContain("import('./CollectionSmartEditeurV2.svelte')");
  });
});

describe("Les albums d'une collection ouverte", () => {
  const col = sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));

  it('leurs pochettes portent les CINQ gestes', () => {
    // Bertrand, 05/09/2026 : « smart collection, aucun CTA sur les covers
    // d'album. Pas normal ! ». La grille était un simple bouton avec une
    // pochette nue.
    const grille = col.slice(col.indexOf('{#each albums as a'), col.indexOf('{/each}', col.indexOf('{#each albums as a')));
    expect(grille).toContain('<PochetteActions');
    expect(grille).toContain('favori={a.id != null ? { albumId: a.id } : null}');
    expect(grille).toContain("etiquettes={a.id != null ? { itemType: 'album', itemId: a.id } : null}");
    expect(grille).toContain('onLire={() => lireAlbum(a)}');
    expect(grille).toContain('onOuvrir={() => (fiche = a)}');
  });

  it("cliquer une carte OUVRE l'album, il ne le lance plus", () => {
    // Toutes les autres grilles du nouveau client ouvrent et laissent les
    // gestes à la pochette : lancer sur un simple clic était l'exception.
    const grille = col.slice(col.indexOf('{#each albums as a'), col.indexOf('{/each}', col.indexOf('{#each albums as a')));
    expect(grille, 'la carte lance encore la lecture').not.toContain('onclick={(ev) => lireAlbum(a, ev)}');
    expect(grille).toContain('<button class="meta" onclick={() => (fiche = a)}>');
  });

  it("la carte n'est plus un <button>", () => {
    // Elle contient cinq boutons : des boutons imbriqués sont du HTML invalide.
    const grille = col.slice(col.indexOf('{#each albums as a'), col.indexOf('{/each}', col.indexOf('{#each albums as a')));
    expect(grille).not.toContain('<button class="card"');
    expect(grille).toContain('<div class="card">');
  });

  it("la fiche d'album et l'édition sont montées", () => {
    expect(col).toContain('<AlbumDetailV2 album={fiche}');
    expect(col).toContain("import('../AlbumEditModal.svelte')");
    // Le titre corrigé doit revenir dans la grille sans rouvrir la collection.
    expect(col).toContain('albums = albums.map((x: any) => (x.id === maj.id ? { ...x, ...maj } : x))');
  });

  it('la troisième ligne y est comme ailleurs', () => {
    expect(col).toContain('<QualiteAlbum objet={a} />');
  });
});
