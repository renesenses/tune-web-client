/**
 * Quelle année d'un album, et dans quel sens.
 *
 * ## Deux années, très inégalement renseignées
 *
 * Un album porte jusqu'à quatre champs de date : `year` et `release_date`
 * disent la parution de CETTE édition ; `original_year` et `original_date`
 * disent la première parution de l'œuvre. « Wish You Were Here » sort en 1975
 * et l'édition rangée ici date de 1994.
 *
 * MESURE SUR LE .18, 04/09/2026, sur 4255 albums :
 *
 * | champ            | rempli |
 * |------------------|--------|
 * | `year`           | 3049 (72 %) |
 * | `original_year`  | 90 (2 %) |
 * | `original_date`  | 90 (2 %) |
 * | `release_date`   | 0 |
 *
 * Et les deux années ne diffèrent que sur 28 albums.
 *
 * ## Ce que cette mesure impose
 *
 * `release_date` n'est proposé comme MODE nulle part : un choix qui ne
 * trierait RIEN n'est pas un choix. Il sert en revanche de DÉPARTAGE sous
 * l'année depuis #866 — voir [`comparerAlbumsParAnnee`] en bas de ce fichier :
 * un second critère ne coûte rien quand la donnée manque, alors qu'une entrée
 * de menu vide se lit comme une panne. Et « année d'origine » seule fait tomber la
 * bibliothèque de 3049 albums datés à 90 — l'écran doit donc annoncer la
 * couverture de chaque mode, sinon le choix ressemble à une panne.
 *
 * Le mode `auto` — origine si connue, sinon édition — est celui que l'écran
 * appliquait déjà en dur. Il reste le défaut : c'est le seul qui garde les
 * 72 % de couverture tout en plaçant les 90 albums réédités à leur date de
 * création.
 */
import type { Album } from './types';

/** Quelle année lire. */
export type ModeAnnee = 'auto' | 'edition' | 'origine';

/** Bornes de vraisemblance : au-delà, c'est une donnée abîmée, pas une année. */
const MIN = 1800;
const MAX = 2200;

function valide(y: unknown): number | null {
  return typeof y === 'number' && y > MIN && y < MAX ? y : null;
}

/**
 * L'année à retenir pour cet album, ou `null` s'il n'en a pas dans ce mode.
 *
 * `null` n'est pas un défaut à masquer : l'écran range ces albums sous
 * « Année inconnue » plutôt que de les faire disparaître.
 */
export function anneeAlbum(a: Album | null | undefined, mode: ModeAnnee = 'auto'): number | null {
  if (!a) return null;
  const edition = valide(a.year);
  const origine = valide(a.original_year);
  if (mode === 'edition') return edition;
  if (mode === 'origine') return origine;
  return origine ?? edition;
}

/** Combien d'albums portent une année dans ce mode — ce que l'écran annonce. */
export function couvertureAnnees(albums: readonly Album[], mode: ModeAnnee): number {
  return albums.reduce((n, a) => n + (anneeAlbum(a, mode) != null ? 1 : 0), 0);
}

/**
 * Combien d'albums CHANGENT d'année selon le mode retenu.
 *
 * La couverture ne suffit pas à distinguer les modes : sur cette
 * bibliothèque, « origine sinon édition » et « année d'édition » datent tous
 * deux 3049 albums — les 90 qui portent une année d'origine portent aussi une
 * année d'édition. Deux chiffres identiques donnent l'impression de deux
 * options interchangeables.
 *
 * Ce nombre-ci répond à l'autre question, celle qu'on se pose vraiment :
 * qu'est-ce que ça change ? Mesure du 04/09/2026 sur le .18 : **28 albums**,
 * dont « Wish You Were Here » — édition 1994, origine 1975.
 */
export function albumsQuiChangent(albums: readonly Album[]): number {
  return albums.reduce((n, a) => {
    const e = anneeAlbum(a, 'edition');
    const o = anneeAlbum(a, 'origine');
    return n + (e != null && o != null && e !== o ? 1 : 0);
  }, 0);
}

/**
 * Compare deux années pour un tri, sens compris.
 *
 * Un album SANS année part en dernier dans les DEUX sens : en ordre croissant,
 * le mettre en tête reviendrait à le dire plus ancien que tout, ce qu'on ne
 * sait pas.
 */
export function comparerAnnees(
  ya: number | null,
  yb: number | null,
  ordre: 'asc' | 'desc',
): number {
  if (ya == null && yb == null) return 0;
  if (ya == null) return 1;
  if (yb == null) return -1;
  return ordre === 'asc' ? ya - yb : yb - ya;
}

/**
 * La date COMPLÈTE d'un album dans ce mode — `null` si elle n'apporte rien.
 *
 * Même cascade que [`anneeAlbum`] : `edition` lit `release_date`, `origine`
 * lit `original_date`, `auto` prend l'origine si elle existe. Le tri par année
 * doit départager sur la MÊME date que celle qu'il affiche, sinon deux albums
 * se rangeraient selon une date que l'écran ne montre pas.
 *
 * 🔴 On exige le MOIS (`AAAA-MM`). Une date réduite à `1975` ne dit rien de
 * plus que l'année déjà comparée, et la comparer comme texte la ferait passer
 * avant `1975-03-02` — on affirmerait « janvier » là où la donnée dit
 * seulement « 1975 ». Même règle que l'année absente : on ne classe pas ce
 * qu'on ne sait pas.
 */
export function dateAlbum(a: Album | null | undefined, mode: ModeAnnee = 'auto'): string | null {
  if (!a) return null;
  const precise = (v: unknown): string | null =>
    typeof v === 'string' && /^\d{4}-\d{2}/.test(v) ? v : null;
  const edition = precise(a.release_date);
  const origine = precise(a.original_date);
  if (mode === 'edition') return edition;
  if (mode === 'origine') return origine;
  return origine ?? edition;
}

/**
 * Compare deux ALBUMS pour le tri par année — l'année d'abord, puis la date.
 *
 * ## Pourquoi la date, alors que l'année suffisait
 *
 * « Dans Bibliothèque, le bouton ne fonctionne que sur les années et pas sur
 * les dates de sortie d'album » (Jean Valjean, forum 1671, réponse 6154,
 * 09/09/2026). Le constat était exact : la granularité maximale du tri était
 * l'année, et deux albums de 1975 retombaient sur l'ordre ALPHABÉTIQUE — ce
 * qui, sur une frise triée « Plus récent d'abord », se lit comme un bouton qui
 * n'ordonne pas.
 *
 * ## Ce que ça change RÉELLEMENT, mesuré
 *
 * Mesure du 12/09/2026 sur le .18 (v0.9.146, 4 255 albums) :
 *
 * | champ           | rempli |
 * |-----------------|--------|
 * | `release_date`  | **0** |
 * | `original_date` | 90 (2,1 %) — dont **12** avec un mois |
 *
 * Douze albums portent une date plus fine que l'année, et ils ne se
 * rencontrent que sur DEUX années (1999 et 2024). Le départage ne joue donc
 * aujourd'hui que sur une seule paire — « True Blue » (1999-01-21) et « Trio
 * in Tokyo » (1999-10-15). C'est peu, et c'est dit : la date de sortie n'est
 * pas une donnée que ce parc porte. Ajouter une ENTRÉE DE MENU « date de
 * sortie » resterait donc exclu (« un choix qui ne trierait rien n'est pas un
 * choix ») ; affiner le tri existant là où la donnée EXISTE, en revanche, ne
 * coûte rien quand elle manque — on retombe sur le titre, exactement comme
 * avant.
 *
 * Rend `0` quand rien ne départage : c'est à l'appelant d'enchaîner sur le
 * titre, pour qu'il n'y ait qu'UN ordre de repli dans tout l'écran.
 */
export function comparerAlbumsParAnnee(
  a: Album,
  b: Album,
  mode: ModeAnnee,
  ordre: 'asc' | 'desc',
): number {
  const parAnnee = comparerAnnees(anneeAlbum(a, mode), anneeAlbum(b, mode), ordre);
  if (parAnnee !== 0) return parAnnee;
  const da = dateAlbum(a, mode);
  const db = dateAlbum(b, mode);
  // Une seule des deux dates ne départage PAS : on ignore le mois de l'un
  // plutôt que de décréter que l'autre est de janvier.
  if (da == null || db == null || da === db) return 0;
  return ordre === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
}
