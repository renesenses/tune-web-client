/**
 * Clé de dédoublonnage des pochettes d'une mosaïque.
 *
 * Miroir de `tune-core/src/library/mosaique.rs`. Le serveur rend déjà quatre
 * pochettes distinctes ; ce module sert au REPLI, tant qu'une version qui les
 * rend n'est pas déployée, et sur les listes que le client compose lui-même.
 *
 * ## Le défaut
 *
 * Une mosaïque montre quatre pochettes censées être distinctes. Sur la
 * bibliothèque de Bertrand, elles ne l'étaient pas : la collection
 * « Classique » affichait quatre fois le même coffret Górecki alors qu'elle
 * compte 139 albums.
 *
 * Mesuré sur son serveur le 02/09/2026 : un même disque physique est stocké
 * comme PLUSIEURS albums, un par artiste crédité, chacun avec son propre
 * fichier de pochette en cache. Quatre albums, quatre chemins, une seule image.
 *
 * | Collection | Titre | Albums |
 * |---|---|---|
 * | Classique | Les indispensables du piano (96kHz/24bit) | 13 |
 * | Bandes Originales | I Give It A Year | 14 |
 * | 2025 | Coco Maria Presents: New Dimensions In Latin Music | 11 |
 * | Blues | 75 Birthday Bash (Live) | 6 |
 *
 * ## Le TITRE seul, pas artiste + titre
 *
 * Une première version groupait sur artiste + titre. C'était exactement à
 * côté : l'artiste est précisément ce qui VARIE d'un album à l'autre — treize
 * pianistes pour un seul disque.
 *
 * Le risque symétrique — deux albums homonymes d'artistes différents réduits à
 * une case — est réel mais sans conséquence : on ne choisit que quatre
 * pochettes parmi des dizaines, et l'album suivant prend la place. Le coût d'un
 * faux regroupement est une image différente ; celui d'un regroupement manqué
 * est la mosaïque entière remplie d'une seule pochette.
 */

/** Un album, tel que le rendent `/collections/{id}/albums` et ses voisines. */
export interface AlbumPochette {
  cover_path?: string | null;
  title?: string | null;
  /**
   * Accepté et DÉLIBÉRÉMENT ignoré.
   *
   * Les listes du serveur le portent, et le champ figure ici pour qu'on puisse
   * les passer telles quelles. Mais il n'entre pas dans la clé : l'artiste est
   * précisément ce qui varie entre les lignes d'un même disque — treize
   * pianistes pour « Les indispensables du piano ». Le déclarer absent
   * laisserait croire qu'on l'a oublié.
   */
  artist_name?: string | null;
}

/**
 * Retire les groupes parenthésés en FIN de titre, tant qu'il en reste.
 *
 * « A Nonesuch Retrospective » et « A Nonesuch Retrospective (24bit) »
 * désignent la même pochette. Sans ce nettoyage, le coffret Górecki repassait à
 * deux cases : le titre seul ne suffisait pas.
 *
 * On s'arrête si le retrait viderait le titre : « ( ) » de Sigur Rós et
 * « (What's the Story) Morning Glory? » d'Oasis, tous deux dans la collection
 * Rock, gardent donc leur titre entier.
 */
function sansSuffixe(titre: string): string {
  let t = titre.trim();
  for (;;) {
    const fin = t.at(-1);
    const ouvrant = fin === ')' ? '(' : fin === ']' ? '[' : null;
    if (!ouvrant) return t;
    const i = t.lastIndexOf(ouvrant);
    if (i < 0) return t;
    const reste = t.slice(0, i).trimEnd();
    if (!reste) return t;
    t = reste;
  }
}

/**
 * Ce qui sépare deux albums dans une mosaïque : le titre, nettoyé.
 *
 * Sans titre exploitable, la clé retombe sur le `chemin`. Un album sans titre
 * n'a rien d'autre, et tous se regrouperaient sinon sous la clé vide.
 */
export function clePochette(titre: string | null | undefined, chemin: string): string {
  const base = sansSuffixe(titre ?? '');
  return (base || chemin).toLowerCase();
}

/**
 * Jusqu'à quatre pochettes distinctes, dans l'ordre reçu.
 *
 * Deux dédoublonnages, et il faut les deux : sur le DISQUE d'abord, puis sur le
 * CHEMIN — deux disques réellement distincts peuvent partager une pochette,
 * une compilation et sa réédition par exemple.
 */
export function quatreDistinctes(source: AlbumPochette[], max = 4): string[] {
  const vues: string[] = [];
  const cles: string[] = [];
  for (const a of source ?? []) {
    const c = a?.cover_path;
    if (!c) continue;
    const cle = clePochette(a.title, c);
    if (cles.includes(cle) || vues.includes(c)) continue;
    cles.push(cle);
    vues.push(c);
    if (vues.length === max) break;
  }
  return vues;
}
