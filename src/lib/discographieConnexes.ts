/**
 * DISCOGRAPHIE DE L'ARTISTE, ET « AUTRES / CONNEXES » — renesenses/tune-server-rust#4651.
 *
 * FabienM, fil forum 1875 (v0.9.161, 21/09/2026) : « la liste des albums
 * affichés est trop large ! Elle présente également les versions d'autres
 * artistes » — Agnes Obel, 36 vignettes, dont « Pass Them By » de Jessie
 * Black et « Trojan » de Plug Pirate.
 *
 * ## Ce que le service rend — mesuré sur le .18, 21 et 22/09/2026
 *
 * `/streaming/qobuz/artists/551325/albums` (Agnes Obel) : 52 entrées, dont
 * 15 d'AUTRES artistes (reprises, arrangements, musiques de film). Neil Young
 * (35865) : 300 entrées sur six pages, 101 d'autres artistes (Baskery,
 * Nicolette Larson, « Various Artists », The Ducks…). Tidal (3694795) : 17
 * entrées, une de Park Jiha. Tune ne fabrique rien : la liste arrive telle
 * quelle du service, le tri nous revient.
 *
 * Chaque album de service porte `artist_id` et `artist_name` — l'artiste
 * PRINCIPAL de l'album chez ce service. Sur ces trois mesures, `artist_id ==
 * identifiant résolu` et `nom replié == nom de l'artiste` retiennent
 * exactement les mêmes entrées (37/52, 199/300, 16/17).
 *
 * ## Ranger, ne rien jeter
 *
 * La réponse du testeur au même fil (id 6609) : « séparer en 2 sections :
 * Discographie de l'artiste — uniquement les albums sortis par l'artiste ;
 * Autres/Connexes — albums en lien avec l'artiste (reprises, collaborations
 * d'un membre du groupe…) ». Un filtre sec perdrait « The Ducks » (le groupe
 * de Neil Young en 1977) ou David Crosby : ils passent sous « Connexes ».
 *
 * ## Ce qui reste dans la discographie
 *
 *  - l'album dont `artist_id` est celui que la fiche a résolu chez ce service ;
 *  - l'album dont l'artiste principal porte LE MÊME NOM replié (`nomNormalise`,
 *    la règle de #1373) — un service peut tenir deux entités homonymes ;
 *  - l'album qui ne dit RIEN de son artiste (YouTube rend `artist_id: null`,
 *    `artist_name: ""`) : sans indice, on ne déplace pas.
 *
 * Tout le reste va dans « Connexes ». La bibliothèque n'est jamais triée ici :
 * ses albums sont ceux que l'artiste de la table porte déjà.
 */
import type { Album } from './types';
import { nomNormalise, type AlbumsDeService } from './albumsArtisteStreaming';

const vide = (v: unknown) => v == null || String(v).trim() === '';

/** L'album est-il de l'artiste de la fiche ? Voir l'en-tête pour la règle. */
export function estDeLArtiste(album: Album, artistId: string | null | undefined, nom: string): boolean {
  const al = album as Album & { artist_id?: unknown; artist_name?: unknown };
  const aid = al?.artist_id;
  const anom = al?.artist_name;
  if (vide(aid) && vide(anom)) return true;
  if (!vide(aid) && !vide(artistId) && String(aid) === String(artistId)) return true;
  const cible = nomNormalise(nom ?? '');
  if (cible && !vide(anom) && nomNormalise(String(anom)) === cible) return true;
  // Un identifiant qui ne correspond pas, alors que la fiche n'a résolu aucun
  // identifiant chez ce service ET que le nom est absent : rien ne permet de
  // l'écarter.
  if (vide(anom) && vide(artistId)) return true;
  return false;
}

export interface DiscographiePartagee {
  /** Ce que chaque service rend DE l'artiste — la grille principale. */
  propres: AlbumsDeService[];
  /** Le reste, par service — la section « Autres / Connexes ». */
  connexes: AlbumsDeService[];
}

/**
 * Sépare, service par service, les albums de l'artiste de ceux qui ne font
 * que le citer. Une section vide disparaît : une grille ne montre pas un
 * service qui n'a rien à y mettre.
 */
export function partagerDiscographie(
  services: AlbumsDeService[] | null | undefined,
  nom: string | null | undefined,
): DiscographiePartagee {
  const propres: AlbumsDeService[] = [];
  const connexes: AlbumsDeService[] = [];
  for (const sec of services ?? []) {
    const oui: Album[] = [];
    const non: Album[] = [];
    for (const al of sec.albums ?? []) (estDeLArtiste(al, sec.artistId, nom ?? '') ? oui : non).push(al);
    if (oui.length) propres.push({ ...sec, albums: oui });
    if (non.length) connexes.push({ ...sec, albums: non });
  }
  return { propres, connexes };
}
