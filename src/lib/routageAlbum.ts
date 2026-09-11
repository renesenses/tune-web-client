/**
 * Où mène l'ALBUM de la lecture en cours.
 *
 * Jumeau de [`routageArtiste`], et pour la même raison : trois sources, trois
 * destinations, et une seule ne peut pas convenir. Il ferme #1361 (« Retrouver
 * l'album Qobuz en cours de lecture — promesse du 03/07 non tenue ») et la
 * moitié « album » de #3626.
 *
 * ## Ce que faisait `NowPlaying.navigateToAlbum`
 *
 * Sans `album_id` local — c'est-à-dire pour une radio ET pour tout le
 * streaming — il cherchait le titre de l'album dans la bibliothèque LOCALE :
 *
 *     const results = await api.searchLibrary(albumTitle);
 *     const match = results?.albums?.[0];
 *     …sinon ouvrirRecherche(albumTitle, null);
 *
 * Pour un album Qobuz qu'on ne possède pas, il n'y a par construction aucun
 * `match` : on atterrissait sur une recherche par titre. FabienM, fil 1739,
 * point 5 : « quand on clique sur l'hyperlien de l'album cela renvoie au menu
 * bibliothèque locale mais c'est vide si on a pas l'album dans sa bibliothèque
 * locale. Il faut une page album pour les albums provenant du streaming ».
 *
 * ## Ce que la piste portait déjà
 *
 * 🔴 Un `StreamTrack` porte l'identifiant de son album chez le service —
 * `tune-core/src/streaming/traits.rs:14`, `pub album_id: Option<String>`,
 * sérialisé tel quel. Il n'y avait rien à aller chercher : l'information
 * voyageait avec la piste, et on lançait une recherche par titre à côté.
 *
 * ⚠️ PIÈGE DE TYPE, et c'est lui qui rendait la chose invisible.
 * `Track.album_id` est déclaré `number | null` côté client. C'est vrai d'une
 * piste LOCALE ; c'est faux d'une piste de service, où le fil porte une
 * CHAÎNE. Le champ paraissait donc inutilisable là où il était précisément la
 * réponse. On le lit ici en `unknown`, et on le rend en chaîne.
 *
 * ## Pourquoi un module, et pas un `if` dans le composant
 *
 * Même raison que son jumeau : une garde écrite contre `NowPlaying` ne peut
 * que lire son texte, et un texte présent ne prouve pas qu'il s'exécute. Ici
 * la garde APPELLE la décision et regarde où elle envoie.
 */
import { LOCAL, RADIO } from './routageArtiste';

export type DestinationAlbum =
  /** La fiche de l'album en bibliothèque, par identifiant. */
  | { type: 'album'; albumId: number }
  /**
   * La fiche de l'album CHEZ LE SERVICE : la piste porte les deux moitiés de
   * la clé, et `AlbumDetailV2` n'apparie un album distant que sur la PAIRE
   * service + identifiant.
   */
  | { type: 'album-service'; service: string; albumId: string; titre: string }
  /** Le titre, à résoudre en bibliothèque avant d'ouvrir la fiche. */
  | { type: 'album-par-titre'; titre: string }
  /** L'écran Recherche, périmètre ouvert sur la source quand il y en a une. */
  | { type: 'recherche'; requete: string; source: string | null };

export interface PisteEcouteeAlbum {
  source?: string | null;
  /**
   * `unknown` À DESSEIN. Le type public dit `number | null`, le fil envoie une
   * chaîne pour une piste de service : typer ce champ ici en `number`
   * reconduirait l'erreur qui a masqué la solution.
   */
  album_id?: unknown;
  album_title?: string | null;
}

/** L'identifiant d'album LOCAL — un entier, et seulement un entier. */
function idLocal(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** L'identifiant d'album CHEZ UN SERVICE — une chaîne non vide. */
function idDistant(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  // Un service dont les identifiants sont numériques (Deezer) arrive en
  // nombre : c'est un identifiant distant quand même, pas une clé locale.
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

export function destinationAlbum(
  piste: PisteEcouteeAlbum | null | undefined,
): DestinationAlbum | null {
  const source = piste?.source ?? null;
  const titre = piste?.album_title?.trim() ?? '';

  // 1. LOCAL — l'identifiant prime, comme pour l'artiste : deux albums peuvent
  //    porter le même titre, un identifiant ne désigne qu'un album.
  if (source === LOCAL || source == null) {
    const id = idLocal(piste?.album_id);
    if (id != null) return { type: 'album', albumId: id };
    return titre ? { type: 'album-par-titre', titre } : null;
  }

  // 2. RADIO — aucun identifiant d'album n'existe, ni local ni distant. Le
  //    titre annoncé par la station est tout ce qu'on a, et l'album peut être
  //    n'importe où : on ne restreint pas le périmètre.
  if (source === RADIO) return titre ? { type: 'recherche', requete: titre, source: null } : null;

  // 3. SERVICE — la piste porte l'identifiant de son album chez le service.
  //    C'est le cas que `navigateToAlbum` envoyait chercher dans la
  //    bibliothèque locale, où il ne pouvait rien trouver.
  const distant = idDistant(piste?.album_id);
  if (distant) return { type: 'album-service', service: source, albumId: distant, titre };

  // Un service sans identifiant d'album : il reste le titre. On ouvre le
  // périmètre sur la source, là où l'utilisateur écoutait.
  return titre ? { type: 'recherche', requete: titre, source } : null;
}
