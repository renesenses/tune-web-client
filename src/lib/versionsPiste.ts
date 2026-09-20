/**
 * Ce qu'on ENVOIE à la lecture quand on clique une « autre version ».
 *
 * Bertrand, 07/09/2026 : « Autres versions : le click sur la cover ne doit pas
 * lancer l'album mais la chanson ! »
 *
 * C'était le cas : la première version envoyait `streaming_album_id` dès qu'un
 * album était connu, et `source_id` — la PISTE chez le service — ne servait que
 * de repli. On demandait une autre version d'un morceau et on obtenait un
 * disque entier, qui ne commençait même pas par lui.
 *
 * L'ordre est donc : la PISTE d'abord, l'album seulement quand le service ne
 * nomme pas la piste. C'est le même ordre que `corpsDeLecture` applique à
 * toute piste distante.
 *
 * Le module existe pour que la garde puisse APPELER la règle : une garde
 * écrite contre le composant ne pourrait que lire son texte, et deux gardes à
 * moi ont déjà rougi ou verdi à tort pour cette raison (07/09/2026).
 */

import { ORDRE_SOURCES } from './discographieCommune';

export interface VersionService {
  service: string;
  source_id: string | null;
  album_id: string | null;
  title: string;
  artist_name: string | null;
  album_title: string | null;
  cover_path: string | null;
}

export interface VersionLocale {
  track_id: number | null;
}

/**
 * @returns Le corps de lecture, ou `null` quand la version ne désigne rien —
 *   une reprise trouvée chez un service sans identifiant ne mène nulle part.
 */
export function corpsVersionService(v: VersionService): Record<string, unknown> | null {
  // 🔴 LA PISTE D'ABORD. Les métadonnées l'accompagnent : sans elles la barre
  // de lecture reste sans titre ni pochette le temps que le service réponde.
  if (v.source_id) {
    return {
      source: v.service,
      source_id: String(v.source_id),
      title: v.title ?? null,
      artist_name: v.artist_name ?? null,
      album_title: v.album_title ?? null,
      cover_path: v.cover_path ?? null,
    };
  }
  // L'album seulement en dernier recours : mieux vaut le bon disque que rien.
  if (v.album_id) return { streaming_album_id: String(v.album_id), source: v.service };
  return null;
}

/** Une version de la BIBLIOTHÈQUE : elle a toujours désigné la piste. */
export function corpsVersionLocale(v: VersionLocale): Record<string, unknown> | null {
  return v.track_id == null ? null : { track_id: v.track_id };
}

/**
 * Ce qu'une tuile de SERVICE du panneau « Autres versions » écrit — #1115.
 *
 * FabienM (fil 1829, 0.9.152) : « il manque le nom de l'album à côté de chaque
 * vignette ». La tuile n'avait qu'une ligne de texte : l'INTERPRÈTE pour une
 * reprise, l'ALBUM pour une version. Il manquait donc toujours l'un des deux,
 * alors que le serveur rend les deux pour chaque candidat (mesuré sur le .18
 * le 19/09/2026, piste 25930 « Lovely Day » : 14 candidats Qobuz/Tidal, tous
 * avec `artist_name` ET `album_title`).
 *
 * Deux lignes, dans le même ordre pour une version et pour une reprise :
 * l'album (ce qui distingue deux versions d'un même interprète), puis
 * l'interprète (ce qui distingue deux reprises). Le titre du morceau ne sert
 * que de repli quand le service ne nomme pas l'album.
 */
export function libellesVersionService(
  v: Pick<VersionService, 'title' | 'artist_name' | 'album_title'>,
): { album: string; interprete: string | null } {
  const album = (v.album_title ?? '').trim() || v.title;
  const interprete = (v.artist_name ?? '').trim() || null;
  return { album, interprete };
}

/**
 * Ce qu'une tuile de la BIBLIOTHÈQUE du panneau « Autres versions » écrit — #1235.
 *
 * Bertrand, 18/09/2026 : « Autres versions — manque nom du groupe ». Deux
 * pressages locaux d'un même titre par deux formations différentes ne se
 * distinguaient que par la pochette : la tuile ne portait que l'album. La
 * route ne transportait pas l'interprète sur ce chemin ; elle le fait depuis
 * tune-server-rust#4468 (0.9.157), sous le même nom `artist_name` que les
 * versions de service — celui de la PISTE, l'artiste d'album en repli.
 *
 * Même forme que `libellesVersionService` : l'album, puis l'interprète. Un
 * serveur antérieur n'envoie pas le champ : la tuile reste alors ce qu'elle
 * était, sans inventer de nom.
 */
export function libellesVersionLocale(
  v: { album_title: string | null; artist_name?: string | null },
): { album: string; interprete: string | null } {
  const album = (v.album_title ?? '').trim();
  const interprete = (v.artist_name ?? '').trim() || null;
  return { album, interprete };
}


/**
 * ─── L'ORDRE des « Autres versions » ─────────────────────────────────────
 *
 * FabienM (fil 1829, 0.9.152, point 11) : « Le problème est l'ordre de
 * présentation qui n'est pas respectée: (en 1er: local puis Qobuz / Tidal /
 * Youtube et en dernier Bandcamp). […] Il faut grouper par source et tous les
 * résultats Qobuz doivent être avant Bandcamp ».
 *
 * Ce qu'il voit n'est PAS un défaut : le serveur classe par PERTINENCE
 * (`routes/versions.rs`, barème introduit par #2372 — l'ISRC domine, puis les
 * écarts de durée, le service ne servant que de départage). Deux versions
 * Qobuz de scores différents encadrent donc légitimement des tuiles Bandcamp.
 *
 * Arbitrage de Bertrand (20/09/2026, tune-server-rust#4368) : on ne remplace
 * pas ce classement, on laisse l'utilisateur CHOISIR. « Par pertinence » reste
 * le défaut ; « par source » regroupe, dans l'ordre demandé.
 *
 * ## Pourquoi côté CLIENT, et pourquoi l'ordre reste STABLE
 *
 * Le regroupement ne fabrique aucun ordre : il PARTITIONNE. Un passage unique
 * range chaque version dans le panier de sa source, puis les paniers sont
 * concaténés. Aucun tri, donc aucun comparateur à qui reprocher une égalité :
 * à l'intérieur d'un panier, l'ordre reçu du serveur est conservé TEL QUEL, et
 * cet ordre-là est déjà TOTAL côté serveur (`classer_par_score` départage par
 * `service`, `title`, puis `source_id`, un identifiant unique) — donc
 * reproductible d'un appel à l'autre.
 *
 * Conséquence, qui est la propriété recherchée : si la liste se COMPLÈTE (un
 * service lent répond après les autres, un second appel en rend plus), les
 * tuiles déjà présentes ne peuvent pas changer d'ordre RELATIF entre elles.
 * Une nouvelle tuile s'insère dans son panier, elle n'en déplace aucune. La
 * fonction est pure — recalculée depuis la liste entière, sans état accumulé —
 * et ne mute jamais le tableau reçu : pas de `sort()` en place, qui
 * réordonnerait le `$state` du panneau sous les pieds du rendu.
 */
export type OrdreVersions = 'pertinence' | 'source';

/** Le comportement d'avant : le barème du serveur, intact. */
export const ORDRE_VERSIONS_DEFAUT: OrdreVersions = 'pertinence';

export function estOrdreVersions(v: unknown): v is OrdreVersions {
  return v === 'pertinence' || v === 'source';
}

/**
 * 🔴 L'ordre des sources n'est PAS réécrit ici : c'est `ORDRE_SOURCES`, déjà
 * partagé par la discographie d'artiste et les titres phares — et il vaut
 * exactement `local, qobuz, tidal, youtube, bandcamp`, la liste de FabienM au
 * mot près. Une seconde copie divergerait le jour où une source s'ajoute.
 *
 * `local` y figure en tête et n'y sert jamais : la route rend les versions de
 * la bibliothèque dans un tableau SÉPARÉ (`versions`), que le panneau dessine
 * avant le tableau `streaming`. « Local d'abord » est donc déjà vrai dans les
 * deux modes, sans que ce barème ait à s'en mêler.
 */
const BANDCAMP = 'bandcamp';
/** « et en dernier Bandcamp » — la seule position que le testeur ait fixée
 *  par la FIN, donc la seule qu'un service inattendu ne doit pas lui prendre. */
const RANG_BANDCAMP = ORDRE_SOURCES.length;
/**
 * Un service que `ORDRE_SOURCES` ne nomme pas — Deezer et Spotify, que
 * `SERVICES_VERSIONS` interroge pourtant, ou un futur. Juste AVANT Bandcamp.
 *
 * C'est le seul point où ce barème s'écarte de `rangDe()` de la discographie,
 * qui range l'inconnu après tout le monde : là-bas rien n'était promis sur la
 * fin de liste, ici « Bandcamp en dernier » l'est.
 */
const RANG_INCONNU = RANG_BANDCAMP - 1;
const NB_PANIERS = RANG_BANDCAMP + 1;

function rangSource(service: string | null | undefined): number {
  const s = (service ?? '').trim().toLowerCase();
  if (s === BANDCAMP) return RANG_BANDCAMP;
  const i = ORDRE_SOURCES.indexOf(s);
  return i === -1 ? RANG_INCONNU : i;
}

/**
 * @param versions Les versions de SERVICE, dans l'ordre rendu par le serveur.
 * @param ordre    Le choix de l'utilisateur (`preferences.ordreAutresVersions`).
 * @returns En mode « pertinence », le tableau REÇU — sans copie ni
 *   modification. En mode « source », un NOUVEAU tableau regroupé par source,
 *   chaque groupe conservant l'ordre de pertinence du serveur.
 */
export function ordonnerVersionsService<T extends { service: string }>(
  versions: T[],
  ordre: OrdreVersions,
): T[] {
  if (ordre !== 'source') return versions;
  const paniers: T[][] = Array.from({ length: NB_PANIERS }, () => []);
  for (const v of versions) paniers[rangSource(v.service)].push(v);
  return paniers.flat();
}
