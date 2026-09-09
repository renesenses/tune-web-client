import { fold } from './utils';

/**
 * Vocabulaire canonique des genres de radio.
 *
 * ── LE DÉFAUT ────────────────────────────────────────────────────────────
 *
 * Vingt-six valeurs de genre en production pour une quinzaine de genres
 * réels. `eclectic` coexiste avec `Éclectique`, `jazz` avec `Jazz`, `rock`
 * avec `Rock`, `classical` avec `Classique`, `world` et `World` avec `Monde`,
 * `reggae` avec `Reggae`, `electronic` avec `Électronique`. La page Radios
 * construit sa liste de genres à partir de ces chaînes brutes
 * (`new Set(radios.map(r => r.genre))`) : chaque variante d'orthographe
 * fabrique donc son propre rayon, et l'utilisateur qui clique sur « Jazz » ne
 * voit que la moitié des stations de jazz — l'autre moitié est rangée sous
 * « jazz ».
 *
 * ── OÙ VIT LA VALEUR, ET POURQUOI CE MODULE NE LA TOUCHE PAS ─────────────
 *
 * Le genre est une colonne texte libre du serveur (`radio_stations.genre`,
 * `Option<String>`). Le client ne la stocke pas : il la lit sur
 * `GET /api/v1/radios` et la renvoie telle quelle. Trois écrivains y
 * déposent trois vocabulaires :
 *
 *   1. le semis d'origine du serveur — quinze termes FRANÇAIS canoniques
 *      (`Éclectique`, `Classique`, `Monde`, `Chanson française`…) ;
 *   2. le semis figé de l'annuaire mozaiklabs — français lui aussi, ses
 *      valeurs ayant été normalisées à la main au moment du gel ;
 *   3. le bouton « + Ajouter à Tune » de l'annuaire, qui écrit la valeur de
 *      l'annuaire VERBATIM — et c'est par là qu'entrent `eclectic`, `jazz`,
 *      `classical`, `rock`, `world`, `electronic`, `blues`, `reggae`.
 *
 * L'annuaire mesuré le 30/08/2026 sert lui-même 51 stations pour VINGT
 * valeurs de genre distinctes, mêlant déjà l'anglais minuscule et le français
 * capitalisé. La divergence naît donc là-bas, et le semis la reprend
 * délibérément verbatim (#2119) : la corriger ailleurs recréerait l'écart
 * annuaire/produit qui est précisément le sujet du ticket.
 *
 * Ce module ne réécrit RIEN. Il ne touche ni la base, ni ce que l'utilisateur
 * a tapé dans la fiche d'une station : une valeur stockée est une donnée, pas
 * un libellé. Il se contente de REPLIER les variantes sur une clé stable au
 * moment du regroupement et de l'affichage. C'est la seule couche où le
 * client peut agir honnêtement — et c'est aussi pourquoi elle ne suffit pas :
 * voir « ce qui reste à faire » en bas de fichier.
 *
 * ── LE PIÈGE DE COUCHE, ET COMMENT IL EST ÉVITÉ ─────────────────────────
 *
 * « Normaliser en français puis traduire » ne peut pas vouloir dire « écrire
 * des libellés français dans le regroupement » : on recréerait le problème
 * dans onze langues au lieu d'une, et une interface allemande afficherait
 * « Chanson française » en dur. La clé de regroupement est donc un
 * IDENTIFIANT ASCII stable (`radioGenre.chansonFrancaise`), jamais un
 * libellé ; le libellé se résout par `$t()` à l'affichage, comme
 * `podcast-genres.ts` le fait déjà pour les podcasts.
 *
 * ── CE QUE LE CONTRÔLE i18n NE VOIT PAS ─────────────────────────────────
 *
 * `scripts/check-i18n.mjs` cherche les clés appelées sous la forme littérale
 * `$t('…')` et ne lit le français en dur que dans les `.svelte`. Une clé
 * déclarée dans une table TypeScript et résolue indirectement lui échappe
 * donc deux fois. C'est exactement pourquoi `radioGenres.test.ts` existe :
 * il vérifie que chacune des clés d'ici est traduite dans les onze langues.
 */

/** Un rayon de genre : ce sur quoi on regroupe, filtre et clique. */
export interface RadioGenreShelf {
  /**
   * Clé de regroupement — stable, indépendante de la langue, de la casse et
   * des accents. C'est elle, et jamais le libellé, qui sert de valeur de
   * filtre.
   */
  key: string;
  /**
   * Clé de traduction du genre, ou `null` quand la valeur brute n'appartient
   * pas au vocabulaire connu.
   */
  i18nKey: string | null;
  /**
   * Valeur brute telle que le serveur l'a servie. Elle sert de libellé de
   * repli pour un genre hors vocabulaire — on n'invente pas de traduction
   * pour un mot qu'on ne connaît pas, et on ne le cache surtout pas.
   */
  raw: string;
}

/**
 * Table des synonymes : forme repliée (`fold`) → clé canonique.
 *
 * Les entrées viennent du RELEVÉ, pas de l'imagination : les quinze genres du
 * semis serveur, plus les huit formes anglaises minuscules servies par
 * l'annuaire mozaiklabs le 30/08/2026, plus `blues` que l'annuaire est seul à
 * porter. Quelques variantes voisines très probables (`electro`, `rap`,
 * `hip hop`, `world music`) sont admises d'avance : elles ne coûtent rien et
 * évitent qu'un ajout manuel refabrique un rayon.
 *
 * `fold()` (utils.ts) met en minuscules et retire les diacritiques : une
 * seule entrée `eclectique` absorbe donc `Éclectique`, `éclectique` et
 * `ECLECTIQUE`.
 */
const ALIASES: Readonly<Record<string, string>> = {
  // Éclectique
  eclectique: 'radioGenre.eclectic',
  eclectic: 'radioGenre.eclectic',
  eclectisme: 'radioGenre.eclectic',

  // Jazz
  jazz: 'radioGenre.jazz',

  // Classique
  classique: 'radioGenre.classical',
  classical: 'radioGenre.classical',
  classic: 'radioGenre.classical',

  // Rock
  rock: 'radioGenre.rock',

  // Pop
  pop: 'radioGenre.pop',

  // Électronique
  electronique: 'radioGenre.electronic',
  electronic: 'radioGenre.electronic',
  electronica: 'radioGenre.electronic',
  electro: 'radioGenre.electronic',

  // Monde
  monde: 'radioGenre.world',
  world: 'radioGenre.world',
  'world music': 'radioGenre.world',
  'musiques du monde': 'radioGenre.world',

  // Reggae
  reggae: 'radioGenre.reggae',

  // Blues
  blues: 'radioGenre.blues',

  // Metal
  metal: 'radioGenre.metal',

  // Hip-Hop
  'hip-hop': 'radioGenre.hipHop',
  'hip hop': 'radioGenre.hipHop',
  hiphop: 'radioGenre.hipHop',
  rap: 'radioGenre.hipHop',

  // Groove
  groove: 'radioGenre.groove',

  // Chanson française
  'chanson francaise': 'radioGenre.chansonFrancaise',
  chanson: 'radioGenre.chansonFrancaise',

  // Culture
  culture: 'radioGenre.culture',

  // Généraliste
  generaliste: 'radioGenre.generalist',
  generalist: 'radioGenre.generalist',

  // Contemporaine
  contemporaine: 'radioGenre.contemporary',
  contemporain: 'radioGenre.contemporary',
  contemporary: 'radioGenre.contemporary',
};

/**
 * Les clés canoniques, dédupliquées et triées.
 *
 * Sert au test de parité des traductions : c'est la liste qui doit exister
 * dans les onze fichiers de langue.
 */
export const RADIO_GENRE_KEYS: readonly string[] = [...new Set(Object.values(ALIASES))].sort();

/** Préfixe des rayons hors vocabulaire — jamais une clé de traduction. */
const RAW_PREFIX = 'raw:';

/**
 * Replie une valeur de genre brute sur son rayon.
 *
 * Rend `null` pour une valeur vide : une station sans genre n'a pas de rayon,
 * elle n'en fabrique pas un « (vide) ».
 *
 * Un genre inconnu n'est PAS jeté : il obtient son propre rayon, clé
 * `raw:<forme repliée>`, libellé = sa valeur brute. Deux orthographes d'un
 * même mot inconnu (`Ambient` / `ambient`) se rejoignent donc quand même,
 * puisque la clé passe par `fold()` — le premier libellé rencontré gagne, ce
 * qui est arbitraire mais stable, et de toute façon préférable à deux rayons.
 */
export function radioGenreShelf(raw: string | null | undefined): RadioGenreShelf | null {
  const brut = (raw ?? '').trim();
  if (brut === '') return null;
  const replie = fold(brut);
  if (replie === '') return null;
  const i18nKey = ALIASES[replie] ?? null;
  return { key: i18nKey ?? `${RAW_PREFIX}${replie}`, i18nKey, raw: brut };
}

/**
 * Le libellé à afficher pour un rayon, dans la langue courante.
 *
 * `translate` est le `$t` du composant : le module ne connaît pas la langue,
 * il ne connaît que les clés. C'est ce découpage qui empêche le français de
 * s'écrire en dur dans une couche de données.
 */
export function radioGenreLabel(
  shelf: RadioGenreShelf,
  translate: (key: string) => string,
): string {
  return shelf.i18nKey ? translate(shelf.i18nKey) : shelf.raw;
}

/**
 * Les rayons présents dans une liste de stations, un par genre réel.
 *
 * L'ordre n'est PAS décidé ici : il dépend de la langue affichée, donc du
 * `$t` du composant. Trier sur les clés donnerait un ordre alphabétique
 * anglais à un lecteur japonais.
 */
export function radioGenreShelves(
  stations: readonly { genre?: string | null }[],
): RadioGenreShelf[] {
  const rayons = new Map<string, RadioGenreShelf>();
  for (const station of stations) {
    const rayon = radioGenreShelf(station.genre);
    if (rayon && !rayons.has(rayon.key)) rayons.set(rayon.key, rayon);
  }
  return [...rayons.values()];
}

/* ─────────────────────────────────────────────────────────────────────────
 * CE QUI RESTE À FAIRE, ET QUI N'EST PAS ICI
 *
 * Ce module soigne l'AFFICHAGE : un seul rayon par genre, un libellé traduit.
 * Il ne soigne pas la DONNÉE. La base de chaque utilisateur continue de
 * contenir `eclectic` à côté de `Éclectique`, et toute vue qui lirait le
 * genre sans passer par ici — un tri serveur `?genre=`, un export, une
 * requête SQL — retrouverait les doublons intacts.
 *
 * La correction durable est une ÉDITION DE L'ANNUAIRE mozaiklabs, décrite
 * dans la PR : y ramener chaque fiche à un terme français canonique de la
 * liste ci-dessus. Le semis reprend l'annuaire verbatim et délibérément
 * (#2119) ; corriger le semis sans corriger l'annuaire recréerait la
 * divergence que ce ticket combat. Aucune écriture en base n'est faite
 * depuis ici.
 * ──────────────────────────────────────────────────────────────────────── */
