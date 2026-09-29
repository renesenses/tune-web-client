/**
 * LA SÉLECTION MULTIPLE DES PISTES D'UN ALBUM — web#1683, point 3.
 *
 * Levente Toth, fil forum 1998 (27/09/2026) : « maybe there would be a nice
 * option to be able to select multiple all songs - in case the user wants to
 * update metadata eg. Artist / Genre so they don't have to do it one-by-one. »
 * Go de Bertrand le 27/09/2026 : sélection multiple sur la fiche album, et
 * édition groupée de l'artiste et du genre.
 *
 * Aucune sélection multiple de PISTES n'existait dans le client : ni la file,
 * ni les playlists, ni l'onglet Titres. Les gestes repris sont ceux des listes
 * à cocher déjà en place (`ManquantsV2`, `MetadataV2`) : une case par ligne,
 * un bouton « Tout sélectionner / Tout désélectionner », le compte. On y
 * ajoute Maj+clic pour une plage, le geste de toute liste de fichiers.
 *
 * Ce module est PUR : il ne parle ni au réseau ni au DOM. Les routes, toutes
 * EXISTANTES, sont appelées par la fiche :
 *
 *   lire          POST /zones/{id}/play          `{ track_ids }`
 *   file          POST /zones/{id}/queue/add     `{ track_ids, position? }`
 *   playlist      POST /playlists/{id}/tracks    `{ track_ids }`
 *   artiste       PUT  /library/albums/{id}/edition  `{ tracks: [{ id, artist_name }] }`
 *   genre         PUT  /library/tracks/{id}      `{ genre }`, une par piste
 *
 * 🔴 L'artiste passe par la route du mode « Modifier », pas par
 * `PUT /library/tracks/{id}` : celle-ci n'écrit que le NOM (`artist_name`)
 * sans rattacher la piste à un artiste, quand l'édition d'album résout le nom
 * en artiste de la bibliothèque (`artiste_nomme`, création comprise). C'est ce
 * que fait déjà le champ « Artiste » de chaque piste en mode Modifier.
 *
 * ⚠️ Le genre, lui, n'a pas de forme groupée : `CorpsEdition.tracks` ne porte
 * que `title` et `artist_name`. D'où une requête par piste.
 */

/** La sélection : des identifiants de pistes de la BIBLIOTHÈQUE. */
export type Selection = ReadonlySet<number>;

export interface EtatSelection {
  choisies: Selection;
  /** La dernière case cochée sans Maj : l'origine de la prochaine plage. */
  ancre: number | null;
}

export const SELECTION_VIDE: EtatSelection = { choisies: new Set(), ancre: null };

/** Les identifiants sélectionnables, dans l'ORDRE d'affichage. */
export function idsSelectionnables(pistes: readonly { id?: number | null }[]): number[] {
  const ids: number[] = [];
  for (const p of pistes) if (typeof p.id === 'number') ids.push(p.id);
  return ids;
}

/**
 * Un clic sur la case de `id`.
 *
 * Sans Maj : bascule la piste, et elle devient l'ancre.
 * Avec Maj et une ancre visible : toute la plage entre l'ancre et `id` prend
 * l'état que l'ANCRE a — la règle des gestionnaires de fichiers. L'ancre ne
 * bouge pas, pour qu'un second Maj+clic reparte du même point.
 */
export function basculer(
  etat: EtatSelection, id: number, ordre: readonly number[], etendre = false,
): EtatSelection {
  const choisies = new Set(etat.choisies);
  const de = etat.ancre == null ? -1 : ordre.indexOf(etat.ancre);
  const vers = ordre.indexOf(id);
  if (etendre && de >= 0 && vers >= 0) {
    const cocher = choisies.has(etat.ancre!);
    const [a, b] = de <= vers ? [de, vers] : [vers, de];
    for (let i = a; i <= b; i++) {
      if (cocher) choisies.add(ordre[i]); else choisies.delete(ordre[i]);
    }
    return { choisies, ancre: etat.ancre };
  }
  if (choisies.has(id)) choisies.delete(id); else choisies.add(id);
  return { choisies, ancre: id };
}

/** « Tout sélectionner », ou « Tout désélectionner » quand tout l'est déjà. */
export function toutOuRien(etat: EtatSelection, ordre: readonly number[]): EtatSelection {
  const tout = ordre.length > 0 && ordre.every((id) => etat.choisies.has(id));
  return { choisies: tout ? new Set() : new Set(ordre), ancre: null };
}

export function toutEstChoisi(etat: EtatSelection, ordre: readonly number[]): boolean {
  return ordre.length > 0 && ordre.every((id) => etat.choisies.has(id));
}

/**
 * Les pistes choisies, dans l'ORDRE DE L'ALBUM — jamais dans l'ordre des clics.
 *
 * Lire ou enfiler « 7, 2, 4 » parce qu'on les a cochées dans cet ordre
 * brouillerait l'album. On ne garde aussi que ce qui est encore AFFICHÉ :
 * une piste cochée puis masquée par le focus artiste ne part pas.
 */
export function choisiesDansLOrdre(etat: EtatSelection, ordre: readonly number[]): number[] {
  return ordre.filter((id) => etat.choisies.has(id));
}

/** La sélection, réduite à ce qui existe encore après une relecture. */
export function restreindre(etat: EtatSelection, ordre: readonly number[]): EtatSelection {
  const vivants = new Set(ordre);
  const choisies = new Set([...etat.choisies].filter((id) => vivants.has(id)));
  const ancre = etat.ancre != null && vivants.has(etat.ancre) ? etat.ancre : null;
  if (choisies.size === etat.choisies.size && ancre === etat.ancre) return etat;
  return { choisies, ancre };
}

/**
 * Le corps de `PUT /library/albums/{id}/edition` qui donne l'artiste `nom` aux
 * pistes `ids`. `null` quand il n'y a rien à envoyer : un nom vide serait
 * refusé par le serveur (`artiste_de_piste_vide`), autant ne pas l'envoyer.
 */
export function corpsArtistePistes(
  ids: readonly number[], nom: string,
): { tracks: { id: number; artist_name: string }[] } | null {
  const n = nom.trim();
  if (!n || !ids.length) return null;
  return { tracks: ids.map((id) => ({ id, artist_name: n })) };
}

export interface Bilan { reussies: number; echouees: number }

/**
 * Le genre `genre` posé sur chaque piste, une requête à la fois.
 *
 * 🔴 EN SÉRIE, pas en parallèle : `PUT /library/tracks/{id}` réécrit aussi
 * les balises du FICHIER. Vingt écritures simultanées sur le même disque
 * n'iraient pas plus vite, et un échec au milieu serait illisible. Un échec
 * n'arrête pas la suite : le bilan le compte, la fiche le dit.
 */
export async function appliquerGenre(
  ids: readonly number[], genre: string,
  ecrire: (id: number, corps: { genre: string }) => Promise<unknown>,
): Promise<Bilan> {
  const g = genre.trim();
  const bilan: Bilan = { reussies: 0, echouees: 0 };
  if (!g) return bilan;
  for (const id of ids) {
    try {
      await ecrire(id, { genre: g });
      bilan.reussies += 1;
    } catch {
      bilan.echouees += 1;
    }
  }
  return bilan;
}
