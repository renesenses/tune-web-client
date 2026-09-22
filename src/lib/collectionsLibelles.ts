/**
 * Le nom AFFICHÉ d'une collection intelligente — traduit quand il vient du
 * semis, intact quand il vient de l'utilisateur.
 *
 * ── LE DÉFAUT ────────────────────────────────────────────────────────────
 *
 * Silviu, testeur roumain, v0.9.161 : quatre tuiles en français au milieu
 * d'une interface roumaine — « 🖼️ Sans pochette », « 🆕 Récents »,
 * « 🎻 Classique », « 🎬 Bandes Originales ». Les douze voisines passaient
 * inaperçues parce que leur nom est déjà neutre (Jazz, Rock, Pop, Piano,
 * Audiophile, Soul & Funk, SACD / DSD, World Music…).
 *
 * Rien n'était écrit en dur dans le client : le semis écrit les seize
 * collections par défaut en français (`tune-core/src/db/migrations.rs:546` et
 * `:614`), et `CollectionsV2` affichait `c.name` tel quel — il n'avait rien
 * d'autre à quoi accrocher une traduction.
 *
 * ── CE QUE LE SERVEUR JOINT DEPUIS #4714 ─────────────────────────────────
 *
 * `name_key` et `description_key`, À CÔTÉ de `name` et `description`
 * (`tune-smart-http/src/smart_collections.rs:117`). Aucune migration, rien
 * de réécrit en base : la reconnaissance se fait à l'affichage, et seulement
 * si la valeur lue est encore MOT POUR MOT celle du semis.
 *
 * 🔴 UNE COLLECTION RENOMMÉE N'A PAS DE CLÉ. C'est la promesse du serveur, et
 * c'est ce qui rend ce module sûr : sans clé, le nom de l'utilisateur est
 * rendu VERBATIM. On ne traduit jamais le travail de quelqu'un d'autre.
 *
 * ── 🔴 CE QU'ON NE TRADUIT SURTOUT PAS ───────────────────────────────────
 *
 * Le nom est aussi une DONNÉE : c'est la valeur de filtre de
 * `/library/tracks?collection=<name>` (`src/lib/api.ts`, facette Oxygen
 * MONOVALUÉE), et c'est le corps de `PUT /library/smart-collections/{id}`
 * quand on renomme. Traduire ce qui part en requête, c'est filtrer sur un
 * nom qui n'existe dans aucune base, ou renommer la collection du lecteur
 * roumain en roumain la première fois qu'il ouvre l'éditeur.
 *
 * D'où la forme de ce module : il rend un LIBELLÉ, jamais un nom. L'appelant
 * garde la valeur stockée à part, et c'est elle qui voyage.
 */

/** Préfixe des clés servies par le serveur pour les collections du semis. */
const PREFIXE = 'smartCollection.default.';

/** Suffixe de la clé de description, posé par le serveur. */
const SUFFIXE_DESCRIPTION = '.description';

/**
 * Les seize collections du semis, dans l'ordre de
 * `reseed_smart_collections` (`tune-core/src/db/migrations.rs:616-632`).
 *
 * Cette liste n'est pas décorative : elle est le FILTRE. `$t()` rend la clé
 * elle-même lorsqu'elle est absente du catalogue, donc une clé servie par un
 * serveur plus récent que ce client s'afficherait telle quelle —
 * « smartCollection.default.karaoke » sur une tuile. On ne traduit que ce
 * qu'on connaît ; le reste retombe sur le nom stocké, qui est lisible.
 */
export const SMART_COLLECTION_KEYS: readonly string[] = [
  'audiophile',
  'soundtracks',
  'classical',
  'electroAmbient',
  'frenchTouch',
  'jazz',
  'rock',
  'sacdDsd',
  'soulFunk',
  'recent',
  'noCover',
  'piano',
  'vocalACappella',
  'blues',
  'world',
  'pop',
].map((suffixe) => `${PREFIXE}${suffixe}`);

const CONNUES = new Set(SMART_COLLECTION_KEYS);

/** Ce que ce module lit d'une collection — bien moins que `SmartCollection`. */
export interface CollectionLibellable {
  name?: string | null;
  name_key?: string | null;
  description?: string | null;
  description_key?: string | null;
}

/**
 * Traduit une clé, ou rend `null` si le résultat n'est pas présentable.
 *
 * `$t()` rend la clé nue quand elle manque au catalogue : ce cas est traité
 * comme une absence de traduction, pas comme un libellé.
 */
function traduite(
  cle: string,
  translate: (key: string) => string,
): string | null {
  const rendu = (translate(cle) ?? '').trim();
  if (rendu === '' || rendu === cle) return null;
  return rendu;
}

/**
 * Le nom à AFFICHER pour une collection.
 *
 * `translate` est le `$t` du composant : ce module ne connaît pas la langue,
 * seulement les clés — le même découpage que `radioGenres.ts`, et celui qui
 * empêche un libellé français de s'écrire dans une couche de données.
 */
export function collectionNomAffiche(
  collection: CollectionLibellable,
  translate: (key: string) => string,
): string {
  const stocke = (collection.name ?? '').trim();
  const cle = (collection.name_key ?? '').trim();
  if (cle !== '' && CONNUES.has(cle)) {
    const rendu = traduite(cle, translate);
    if (rendu !== null) return rendu;
  }
  return stocke;
}

/**
 * La description à AFFICHER, ou `null` quand il n'y en a pas.
 *
 * Le serveur ne pose `description_key` que si la description lue en base est
 * encore celle du semis : une description réécrite par l'utilisateur garde
 * SON texte, même sur une collection dont le nom, lui, porte encore sa clé.
 */
export function collectionDescriptionAffichee(
  collection: CollectionLibellable,
  translate: (key: string) => string,
): string | null {
  const stockee = collection.description ?? null;
  const cle = (collection.description_key ?? '').trim();
  if (cle.endsWith(SUFFIXE_DESCRIPTION)) {
    const racine = cle.slice(0, -SUFFIXE_DESCRIPTION.length);
    if (CONNUES.has(racine)) {
      const rendu = traduite(cle, translate);
      if (rendu !== null) return rendu;
    }
  }
  return stockee;
}
