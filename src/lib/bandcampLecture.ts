/**
 * Ce qu'on envoie à `POST /zones/{id}/play` pour lancer du Bandcamp.
 *
 * # Le défaut (#2702, Sevy Tabroc, 0.9.119 macOS)
 *
 * « Je choisis un album / je lance le premier titre / à la fin du morceau, le
 * prochain ne s'enchaîne pas. »
 *
 * L'écran envoyait une **piste distante seule** — la paire
 * `{source, source_id}`, `source_id` étant l'URL de flux mp3-128 de la piste.
 * Ce chemin termine par `update_queue_info(zone, 0, 1)` : une file d'EXACTEMENT
 * une piste. Il n'y avait jamais de piste suivante, et le poller de fin de
 * piste trouvait une file de longueur 1 puis s'arrêtait. Le défaut n'était pas
 * dans la détection de fin de piste, il était dans la **constitution de la
 * file**.
 *
 * # Ce qui manquait, et qui existe depuis la v0.9.132
 *
 * Les deux seules routes qui savent construire une file complète —
 * `streaming_album_id` et `streaming_playlist_id` — commencent par
 * `registry.get(source)`. Bandcamp n'était pas dans le registre : elles
 * répondaient `400 unknown service: bandcamp`. Il y est inscrit depuis
 * `tune-server/src/state.rs:369` (`BandcampService::new`), mesuré présent aux
 * tags v0.9.132, v0.9.144 et v0.9.145.
 *
 * Côté serveur tout est donc prêt : `get_album_tracks` rouvre la page de
 * l'album et rend ses pistes, `start_index` choisit celle par où commencer
 * (`tune-server/src/routes/playback.rs:1422-1445`), la file est écrite AVANT
 * la lecture, et l'avance de file re-résout chaque piste par le chemin commun
 * (`resolve_queue_item_url` → `resolve_stream`), zone navigateur comprise.
 *
 * Personne ne l'appelait : c'est un « écrit mais pas branché ». Cette fonction
 * est le branchement, et elle est pure pour être éprouvable sans DOM.
 *
 * # L'identifiant d'album Bandcamp EST son adresse
 *
 * `get_album_tracks(album_id)` fait `album_depuis_url(album_id)`. L'identifiant
 * attendu est donc l'URL publique de la page
 * (`https://artiste.bandcamp.com/album/disque`) — celle que `/ext/bandcamp/album`
 * rend dans `url`, et celle que chaque article de « Ma collection » porte déjà
 * (`collection_mise_en_forme`, champ `url`).
 */

/** Une piste telle que la rend `/ext/bandcamp/album`. */
export interface PisteBandcamp {
  stream_url: string;
  title: string;
  artist?: string;
  duration_s?: number;
}

/** Ce qu'il faut d'un album pour le jouer : son adresse, et ses pistes. */
export interface AlbumBandcamp {
  url?: string | null;
  title?: string;
  artist?: string;
  pochette?: string | null;
  tracks?: PisteBandcamp[];
}

/** Le corps d'album : une file complète, ouverte à la piste demandée. */
export interface CorpsAlbum {
  source: 'bandcamp';
  streaming_album_id: string;
  start_index: number;
}

/** Le corps de repli : une piste seule, donc une file d'une piste. */
export interface CorpsPiste {
  source: 'bandcamp';
  source_id: string;
  title: string;
  artist_name: string;
  album_title: string;
  cover_path: string | null;
  duration_ms: number;
}

/**
 * Le corps de lecture pour la piste n° `index` de `album`.
 *
 * Rend le corps d'ALBUM dès que l'adresse de l'album est connue — c'est lui
 * qui remplit la file. Le corps de piste seule ne reste que pour ce qui n'a
 * pas d'album derrière (une piste isolée d'un résultat de recherche) : mieux
 * vaut une file d'une piste que rien du tout.
 *
 * `null` quand il n'y a ni adresse d'album ni piste à cet indice : l'appelant
 * doit alors le dire, pas envoyer un corps vide — un corps vide fait retomber
 * le serveur sur « reprendre la lecture en cours ».
 */
export function corpsDeLectureBandcamp(
  album: AlbumBandcamp | null | undefined,
  index: number,
): CorpsAlbum | CorpsPiste | null {
  const depart = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  const adresse = typeof album?.url === 'string' ? album.url.trim() : '';
  if (adresse) {
    return { source: 'bandcamp', streaming_album_id: adresse, start_index: depart };
  }
  const piste = album?.tracks?.[depart];
  if (!piste?.stream_url) return null;
  return {
    source: 'bandcamp',
    source_id: piste.stream_url,
    title: piste.title,
    artist_name: piste.artist || album?.artist || '',
    album_title: album?.title ?? '',
    cover_path: album?.pochette ?? null,
    duration_ms: Math.round((piste.duration_s || 0) * 1000),
  };
}

/**
 * Le corps de lecture d'un article de « Ma collection ».
 *
 * Le second volet du fil 1606 (FabienM, #2778), requalifié par Bertrand le
 * 29/08 : « ce qui manque, ce n'est pas la lecture pour Bandcamp, c'est la
 * lecture depuis Ma collection ». L'article porte l'adresse de l'album, donc
 * le même corps d'album que partout ailleurs — et donc la file entière, pas
 * l'extrait d'une piste.
 */
export function corpsDeLectureCollection(
  article: { url?: string | null; type?: string } | null | undefined,
): CorpsAlbum | null {
  const adresse = typeof article?.url === 'string' ? article.url.trim() : '';
  if (!adresse) return null;
  return { source: 'bandcamp', streaming_album_id: adresse, start_index: 0 };
}
