/**
 * Où mène le nom d'artiste de la LECTURE EN COURS.
 *
 * Bertrand, 07/09/2026 : « Vue now playing : click sur l'artiste ne renvoie pas
 * là où il faut. Si local : page artiste. Si radio : écran recherche/résultats
 * avec les bons paramètres. Streaming : à voir. »
 *
 * ## Pourquoi une seule destination ne peut pas convenir
 *
 * Le contrat du serveur le dit (`tune-core/src/playback/mod.rs`, struct
 * `NowPlaying`) :
 *
 *     #[serde(default)] pub album_id:  Option<i64>,
 *     #[serde(default)] pub artist_id: Option<i64>,
 *     /// `Option` : une piste en streaming ou une radio n'a pas d'entrée en
 *     /// bibliothèque
 *
 * Mesuré sur le .18 le 07/09/2026, zone « Cet ordinateur » (piste locale) :
 *
 *     source='local'  track_id=29572  artist_id=994  artist_name='Pink Floyd'
 *
 * Une piste locale porte donc l'identifiant de son artiste ; une radio et une
 * piste de service n'en ont aucun — et ne peuvent pas en avoir, l'artiste
 * n'existant pas dans la table. Envoyer les trois vers la fiche artiste ne
 * pouvait marcher que pour un cas sur trois.
 *
 * ## Pourquoi ce module, et pas un `if` dans le composant
 *
 * Parce qu'une garde écrite contre un composant ne peut que lire son TEXTE, et
 * qu'un texte présent ne prouve pas qu'il s'exécute : la garde du menu « … »
 * restait verte quand on préfixait une entrée d'un `if (false)` (07/09/2026).
 * Ici, la garde APPELLE la fonction et regarde où elle envoie.
 */

/** La source telle que le serveur la nomme sur la lecture en cours. */
export type DestinationArtiste =
  /** La fiche de l'artiste, par identifiant — le cas LOCAL. */
  | { type: 'artiste'; artistId: number }
  /**
   * Le nom, à résoudre en identifiant avant d'ouvrir la fiche.
   *
   * Une piste locale d'un serveur antérieur à la 0.9.102 n'a pas d'`artist_id`
   * (le champ a été ajouté pour ce défaut-là). On ne l'envoie pas à la
   * recherche pour autant : l'artiste EST dans la bibliothèque, il ne manque
   * que son numéro.
   */
  | { type: 'artiste-par-nom'; nom: string }
  /**
   * La fiche d'un artiste de SERVICE, par identifiant — #956.
   *
   * 🔴 Mesuré sur la .18 le 16/09/2026 (v0.9.151) : un album ou une piste
   * Qobuz servi par `/search` ou `/streaming/qobuz/…` porte
   * `artist_id: "610403"` — l'identifiant de l'artiste CHEZ QOBUZ, en chaîne.
   * La règle « `artist_id != null` = artiste local » ne tenait que pour la
   * lecture en cours (`NowPlaying.artist_id: Option<i64>`, bibliothèque
   * seule), et envoyait Sandro et Fabien dans la Bibliothèque à la recherche
   * d'un artiste 610403 qui n'y est pas — « ça me renvoie sur la liste des
   * albums », « à la page d'accueil ».
   *
   * Quand la source est un service, l'identifiant est celui du service : la
   * fiche s'ouvre directement, sans résoudre le nom par une recherche.
   */
  | { type: 'artiste-service'; service: string; id: string; nom: string }
  /**
   * L'écran Recherche.
   *
   * `source` restreint le périmètre au service d'où vient la piste, ou vaut
   * `null` pour chercher partout.
   */
  | { type: 'recherche'; requete: string; source: string | null };

export interface PisteEcoutee {
  source?: string | null;
  /** Un nombre pour la bibliothèque ; une chaîne (ou un nombre, Deezer) pour un service. */
  artist_id?: number | string | null;
  artist_name?: string | null;
}

/** La source est-elle un SERVICE — ni la bibliothèque, ni une radio, ni inconnue ? */
export function estUnService(source: string | null | undefined): boolean {
  const s = (source ?? '').toLowerCase();
  return s !== '' && s !== LOCAL && s !== RADIO;
}

/**
 * Les sources qui ne sont NI la bibliothèque NI une radio sont des services.
 *
 * On ne tient pas la liste des services ici : elle change (Bandcamp est arrivé
 * en août), et une liste en dur ferait retomber tout nouveau service sur le
 * mauvais chemin sans que personne fasse le rapprochement.
 */
export const RADIO = 'radio';
export const LOCAL = 'local';

export function destinationArtiste(piste: PisteEcoutee | null | undefined): DestinationArtiste | null {
  const nom = piste?.artist_name?.trim() ?? '';
  const source = piste?.source ?? null;

  const id = piste?.artist_id;

  // 0. SERVICE avec identifiant — #956 : l'identifiant est celui du service,
  //    quel que soit son type (Qobuz le sert en chaîne, Deezer en nombre).
  //    Il ne désigne RIEN dans la bibliothèque, et ouvre la fiche directement.
  if (estUnService(source) && id != null && String(id).trim() !== '') {
    return { type: 'artiste-service', service: source as string, id: String(id).trim(), nom };
  }

  // 1. LOCAL — l'identifiant prime sur tout le reste : c'est la seule donnée
  //    qui désigne l'artiste sans ambiguïté. « M » et « -M- » sont le même
  //    artiste et deux chaînes différentes. Un identifiant de bibliothèque est
  //    un NOMBRE ; une chaîne sans source connue n'est pas une clé locale.
  if (typeof id === 'number' && Number.isFinite(id) && !estUnService(source)) {
    return { type: 'artiste', artistId: id };
  }
  if (source === LOCAL && nom) return { type: 'artiste-par-nom', nom };

  // Sans nom, il n'y a rien à chercher : aucun geste plutôt qu'un geste mort.
  if (!nom) return null;

  // 2. RADIO — l'artiste peut être n'importe où : dans la bibliothèque comme
  //    chez un service. On ne restreint donc RIEN, sans quoi un artiste qu'on
  //    possède serait masqué par un filtre qu'on n'a pas demandé.
  if (source === RADIO) return { type: 'recherche', requete: nom, source: null };

  // 3. SERVICE — on cherche partout MAIS le périmètre s'ouvre sur le service
  //    d'où sort la piste : c'est là que l'utilisateur écoutait. Les autres
  //    sources restent à une puce de distance, et un artiste présent en
  //    bibliothèque n'est pas perdu pour autant.
  if (source) return { type: 'recherche', requete: nom, source };

  // Sans source connue, on cherche sans périmètre.
  return { type: 'recherche', requete: nom, source: null };
}
