/**
 * Registre des widgets de la page d'accueil.
 *
 * ## Pourquoi un registre, et pas des sections écrites en dur
 *
 * L'accueil affichait quatre sections figées dans son balisage. Bertrand veut
 * qu'on puisse en ajouter, en retirer et les réordonner (02/09/2026) : la
 * disposition devient une DONNÉE, et le composant ne connaît plus que la liste
 * qu'on lui remet.
 *
 * Chaque widget se déclare ici avec son chargeur. Le composant ne sait rien
 * d'aucun d'eux : il rend une bande horizontale et laisse le chargeur remplir.
 *
 * ## Tous horizontaux
 *
 * Décision de Bertrand : une bande qui défile, pour tous. Une grille pour
 * certains et une bande pour d'autres donnerait à l'accueil l'air d'un
 * assemblage de morceaux, et surtout la hauteur deviendrait imprévisible.
 *
 * ## Ce que rend un chargeur
 *
 * Une liste d'ÉLÉMENTS déjà normalisés — `{ id, titre, sous, cover, jouer }` —
 * et non la charge brute du serveur. Les quatorze sources ont chacune leur
 * forme : « album_title » ici, « name » là, « cover_url » ailleurs. Normaliser
 * dans le chargeur laisse au rendu un seul cas à traiter.
 */
import * as api from './api';
import { estSourceDeBibliotheque } from './provenanceBibliotheque';
import type { StreamingItemType } from './streamingFavorites';
import { reprisesUtiles, sousTitreReprise } from './reprendreEcoute';
import { estAParaitre } from './albumAParaitre';
import { CHOIX_DEFAUT, cartes, sourcesNecessaires } from './chiffresAccueil';

/** Un élément affichable dans une bande, quelle qu'en soit la source. */
export interface Element {
  /** Identité stable pour la clé de liste. Jamais une chaîne vide. */
  id: string;
  titre: string;
  sous?: string;
  cover?: string | null;
  /** Ce que fait un clic. Absent = l'élément n'est pas actionnable. */
  jouer?: (zoneId: number) => Promise<unknown> | void;
  /**
   * Service d'origine, pour la pastille sur la pochette (`ServiceBadge`).
   *
   * Les albums éditoriaux de Qobuz ne portent AUCUN champ de source — mesuré
   * sur le serveur de Bertrand le 02/09/2026 : `{artist_id, artist_name,
   * cover_path, quality, source_id, title, track_count, year}`. La source vient
   * donc du WIDGET, qui sait à quel service il s'adresse, et non de l'objet.
   * `local` et `radio` sont filtrés par `AlbumArt` : pas de pastille pour eux.
   */
  source?: string | null;
  /**
   * Ce qu'ouvre un clic AILLEURS que sur le disque de lecture.
   *
   * Bertrand, 02/09/2026 : « quand je clique sur le nom de l'album ou sur la
   * cover hors bouton, cela m'ouvre l'album en local ou dans le service de
   * streaming », et « quand je clique sur la zone d'écoute active cela
   * m'ouvre l'écran Now playing ».
   */
  ouvrir?: 'album' | 'zone' | 'playlist' | 'artiste' | null;
  /**
   * Nom de l'artiste à ouvrir, quand `ouvrir` vaut `artiste`. Un NOM et pas un
   * identifiant : les classements viennent de l'historique, qui n'en porte
   * aucun (`TopArtistEntry` = `{artist_name, plays, listening_ms,
   * cover_path}`). `ouvrirArtisteParNom` fait le rapprochement exact.
   */
  artiste?: string;
  /** Album normalisé pour la fiche, quand `ouvrir` vaut `album`. */
  fiche?: any;
  /**
   * Playlist de SERVICE normalisée pour `PlaylistDetailV2`, quand `ouvrir`
   * vaut `playlist` — #1108.
   *
   * Un champ à part de `fiche`, pour la même raison qui avait fait naître
   * `favoriDistant` : `fiche` est l'album qu'ouvre `ouvrir: 'album'`, et les
   * deux natures ne se recouvrent pas. Les identifiants non plus — l'album 42
   * de Qobuz n'est pas la playlist 42, et `/streaming/qobuz/albums/{id}/tracks`
   * n'est pas `/streaming/qobuz/playlists/{id}/tracks`.
   */
  playlist?: any;
  /**
   * Album ANNONCÉ, pas encore sorti (point 10, 17/09/2026). La vignette est
   * grisée et ne porte pas de disque de lecture : le service répond « no url »
   * sur ses pistes, et un geste qui échoue vaut moins qu'un geste absent.
   */
  aParaitre?: boolean;
  /** La date annoncée, telle que le service la donne (époque, secondes). */
  parution?: number | null;
  /**
   * Objet de SERVICE à mettre en favori quand ce n'est pas un album — une
   * playlist Qobuz ou Tidal, aujourd'hui.
   *
   * Il fallait un champ à part plutôt qu'un détournement de `fiche` : `fiche`
   * est l'album normalisé qu'ouvre `ouvrir: 'album'`, et une playlist ouvre
   * `playlist` (#1108), pas `fiche`. Les deux notions se recouvrent pour un
   * album, pas pour le reste (#3822).
   */
  favoriDistant?: { itemType: StreamingItemType; serviceId: string } | null;
  /**
   * Colonne du gros widget des tops — `forme: 'tops'`.
   *
   * Le widget rend TROIS listes côte à côte à partir d'une seule réponse ;
   * `charger` les aplatit en une liste unique, et cette marque dit à laquelle
   * chaque élément appartient. C'est le même procédé que `zoneId` pour les
   * cartes de zones : le registre reste plat, la forme range.
   */
  colonne?: 'artistes' | 'albums' | 'titres';
  /** Zone suivie par la vignette — bande « Zones d'écoute actives ». */
  zoneId?: number | null;
  /** Cette zone joue-t-elle ? Pilote le mini-analyseur sous la vignette. */
  enLecture?: boolean;
}

/**
 * `zones-cartes` : une CARTE large par zone, deux fois la largeur d'une
 * vignette de bande. C'est la troisième forme, ajoutée le 06/09/2026 —
 * « Créé un deuxième widget ! » (Bertrand), après la maquette Figma.
 */
export type Forme = 'bande' | 'chiffres' | 'zones-cartes' | 'tops';

export interface Widget {
  id: string;
  /** Clé de traduction du titre. Jamais une chaîne en dur. */
  cleTitre: string;
  forme: Forme;
  /** Rend les éléments à afficher. Peut lever : l'appelant l'attrape. */
  charger: (ctx: Contexte) => Promise<Element[]>;
  /** Chiffres d'un widget de statistiques. */
  chiffres?: (ctx: Contexte) => Promise<ChiffreAffiche[]>;
  /**
   * Ce widget honore-t-il `ctx.chiffresChoisis` ? — #1426.
   *
   * Seul un widget qui LIT le choix du profil a le droit d'en offrir le
   * sélecteur en mode « Modifier ». `stats-semaine` sert une liste figée
   * (`CHIFFRES_SEMAINE`) : lui laisser le panneau de #4527 afficherait un
   * réglage qui ne change rien à ce qu'il surmonte — exactement le défaut
   * déjà payé sur la correction acoustique (« dire que ça ne fera rien ici
   * plutôt que de MASQUER le réglage » vaut aussi dans l'autre sens : ne pas
   * proposer un réglage sans effet).
   *
   * Tant que `stats-semaine` était hors de la disposition par défaut,
   * personne ne le voyait. L'y faire entrer le montrait à tout le monde.
   */
  chiffresComposables?: boolean;
  /**
   * Ce que la bande contient, quand ça compte pour la disposition par défaut.
   *
   * `'a-moi'` marque ce qui appartient à l'utilisateur — ses albums favoris,
   * ses playlists. Ces bandes passent EN TÊTE de la disposition par défaut
   * (#911, fil 1571) : on ne cherche pas ce qu'on possède déjà au bas d'une
   * très longue page.
   *
   * `'playlists-editoriales'` marque une CATÉGORIE de playlists du service —
   * « Hi-Res », « Thématiques », « Humeurs »… Le marqueur est déclaratif
   * exprès : la disposition par défaut les retenait autrement par la forme de
   * leur identifiant (`${service}-tag-${gid}`), ce qui aurait cassé au premier
   * renommage d'identifiant sans qu'aucun test ne le voie.
   */
  categorie?: 'playlists-editoriales' | 'a-moi';
}

/**
 * Une carte de la ligne de chiffres : sa valeur déjà FORMATÉE, son icône et
 * la vue qu'elle ouvre. `id`, `icone` et `vue` sont facultatifs pour que les
 * widgets de chiffres écrits avant #4527 restent valides.
 */
export interface ChiffreAffiche {
  cle: string;
  valeur: string;
  id?: string;
  icone?: string;
  vue?: string | null;
}

export interface Contexte {
  profileId: number | null;
  /** Les chiffres que CE profil a choisis pour la ligne de l'accueil. Vide ou
   *  absent : le choix par défaut (#4527). */
  chiffresChoisis?: string[];
  /** La langue de l'écran — les nombres s'écrivent `1 110` ou `1,110`. */
  langue?: string;
  /** Albums déjà chargés par la coquille — évite un appel pour « au hasard ». */
  albums: any[];
  /**
   * Zones déjà chargées par la coquille.
   *
   * `/zones/now-listening` ne rend PAS le nom de la zone — ses clefs sont
   * `{dop_active, metadata_changed_at_ms, muted, now_playing, play_seq,
   * position_ms, queue_length, queue_position, repeat, resolving,
   * session_context_*, shuffle, state, track_generation, volume, zone_id}`,
   * mesuré sur le .18 le 02/09/2026. Le nom se retrouve par `zone_id` dans la
   * liste des zones, que la coquille tient déjà.
   */
  zones: any[];
}

/**
 * Combien d'éléments par bande.
 *
 * 🔴 Bertrand, 02/09/2026 : « ne borne pas la homepage comme Roon le fait ».
 * Roon impose des sections courtes et fermées ; ici la bande DÉFILE, et rien
 * n'oblige à la couper court — le coût d'une vignette de plus est celui d'une
 * ligne de DOM qu'on ne rend même pas tant qu'elle est hors du cadre.
 *
 * Cinquante, parce que c'est ce que rendent la plupart des sources : on montre
 * ce qu'elles donnent, on ne le rogne pas. Les rares qui rendent davantage
 * (500 playlists Qobuz) restent bornées, mais par le bon sens et non par une
 * règle d'affichage.
 */
const LIMITE = 50;

/** Première valeur non vide parmi les noms donnés. */
function champ(o: any, ...noms: string[]): string | undefined {
  for (const n of noms) {
    const v = o?.[n];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/**
 * LA PLAYLIST DE SERVICE, NORMALISÉE POUR `PlaylistDetailV2` — #1108.
 *
 * Un SEUL normaliseur pour les deux fabriques de vignettes de bande
 * (`ficheDe` ici, `playlistDistante` dans `widgetsService`), parce qu'un
 * second aurait divergé au premier champ renommé par un service. C'est déjà
 * la leçon du `?? onPlay` de #1016 : un geste « ouvrir » à deux
 * implémentations concurrentes est pire que pas de geste du tout.
 *
 * 🔴 `source` VA TOUJOURS AVEC `source_id`. La fiche demande
 * `/streaming/{source}/playlists/{source_id}/tracks` : sans la paire, elle
 * interroge le mauvais service — le même piège que sur la lecture.
 *
 * Les noms de champs sont ceux que les deux routes rendent : Qobuz sert `id` /
 * `name` sur `/featured`, `source_id` / `name` sur `/playlists`. On prend les
 * deux plutôt que de parier.
 */
export function playlistOuvrable(o: any, sid: string, service: string) {
  return {
    source_id: sid,
    name: champ(o, 'name', 'title') ?? '',
    description: champ(o, 'description') ?? null,
    cover_path: champ(o, 'cover_path', 'image_url', 'cover_url') ?? null,
    track_count: typeof o?.track_count === 'number' ? o.track_count : 0,
    duration_ms: typeof o?.duration_ms === 'number' ? o.duration_ms : 0,
    source: service,
  };
}

/**
 * Normalise un objet de n'importe quelle source en `Element`.
 *
 * ⚠️ L'identité retombe sur l'INDEX si l'objet n'en porte pas, et jamais sur
 * une chaîne vide : `feed_url: ''` du palmarès des podcasts avait mis cinquante
 * entrées sous la même clé et vidé l'écran (02/09/2026).
 */
export interface OptsElement {
  /** Service d'origine quand l'objet ne le porte pas (cas de tout Qobuz). */
  service?: string;
  /**
   * Ce que DÉSIGNE l'identifiant de l'objet, quand ce n'est pas un album.
   *
   * Sans cette indication la fonction devait deviner, et devinait au prefixe
   * de clé (`prefixe.startsWith('alb')`) — un detail d'affichage promu en
   * regle metier. « Recommandations » portait le prefixe `rec` et ses vingt
   * albums locaux n'etaient donc pas jouables.
   */
  genre?: 'album' | 'playlist' | 'aucun';
  /**
   * L'objet est une ligne d'HISTORIQUE d'écoute (`/library/history`).
   *
   * Son `source_id` y désigne la PISTE jouée, jamais l'album : le serveur
   * (`record_listen`) écrit l'identifiant du morceau diffusé, et range ce que
   * l'auditeur avait demandé dans `context_type` / `context_id`. Voir `geste`.
   */
  historique?: boolean;
}

/** Exporté pour les tests : c'est ici que se décide ce qu'une vignette
 *  porte, et notamment si elle est jouable (point 10). */
export function versElement(o: any, i: number, prefixe: string, opts: OptsElement = {}): Element {
  const id = champ(o, 'id', 'album_id', 'track_id', 'source_id', 'feed_url', 'uri') ?? '';
  const aParaitre = estAParaitre(o);
  // La source de l'OBJET prime sur celle du widget : une bande locale peut
  // rendre un album importé d'un service, la déclaration ne le sait pas.
  const service = champ(o, 'source', 'service', 'provider') ?? opts.service ?? null;
  return {
    // 🔴 L'INDEX fait toujours partie de la clé.
    //
    // Sans lui, deux objets portant le même identifiant donnent la même clé, et
    // Svelte s'arrête sur `each_key_duplicate` — l'écran entier disparaît.
    //
    // Vécu deux fois le 02/09/2026 : `feed_url: ''` sur les cinquante entrées
    // du palmarès des podcasts, puis `id: 0` sur deux entrées de
    // « Reprendre l'écoute » que `champ()` rendait fidèlement comme « 0 ».
    //
    // Se fier à l'identifiant de la source, c'est parier qu'elle en fournit un
    // qui soit unique. Quatorze sources, quatorze occasions de se tromper :
    // l'index, lui, est unique par construction.
    id: `${prefixe}${i}-${id}`,
    titre: champ(o, 'title', 'name', 'album_title', 'album') ?? '—',
    sous: champ(o, 'artist_name', 'artist', 'author', 'artistName', 'station'),
    cover: champ(o, 'cover_path', 'cover_url', 'image_url', 'image_path', 'logo_url') ?? null,
    // La source de l'objet PRIME sur celle du widget : une bande locale peut
    // rendre un album importé d'un service, la déclaration ne le sait pas.
    source: service,
    // Un album annoncé garde son geste : ses singles déjà sortis s'écoutent.
    // C'est la PISTE qui porte l'indisponibilité (`pisteIndisponible`).
    jouer: geste(o, service, opts.genre ?? 'album', opts.historique ?? false),
    aParaitre,
    parution: typeof o?.released_at === 'number' ? o.released_at : null,
    ...ficheDe(o, service, opts.genre ?? 'album'),
  };
}

/**
 * L'album à ouvrir derrière une vignette, normalisé pour `AlbumDetailV2`.
 *
 * ⚠️ L'`id` de l'objet n'est PAS toujours celui de l'album. Une ligne
 * d'historique vaut `{id: 661, album_id: 3198, album_title: …}` — mesuré sur
 * le .18 : `id` y désigne l'écoute, pas le disque. Ouvrir sur `id` afficherait
 * un album au hasard.
 */
function ficheDe(o: any, service: string | null, genre: 'album' | 'playlist' | 'aucun') {
  // 🔴 Une playlist de service S'OUVRE — #1108. Elle ne le faisait pas, et
  // c'est tout le défaut : `PageWidgets` ne rend le bouton d'ouverture de la
  // pochette que si `ouvrir` est posé, et DÉSACTIVE le bouton du titre sinon.
  // Deux gestes morts sur la vignette, exactement ce que schmitt décrit le
  // 17/09/2026 (« le lien sous la pochette ou la playlist permettant de
  // développer sa composition n'est pas actif »).
  //
  // Elle se met aussi en favori, comme sa vignette de l'écran Streaming et
  // comme sa propre fiche (#3822) — `streaming_favorites` prend `playlist`
  // depuis #2370. Les deux gestes cohabitent sur la même vignette.
  if (genre === 'playlist') {
    const sid = champ(o, 'source_id', 'id');
    if (!service || !sid) return {};
    return {
      favoriDistant: { itemType: 'playlist' as const, serviceId: String(sid) },
      ouvrir: 'playlist' as const,
      playlist: playlistOuvrable(o, String(sid), service),
    };
  }
  if (genre !== 'album') return {};
  const svc = serviceDistant(service);
  const dist = svc ? idDistant(o) : null;
  // 🔴 `0` n'est pas un identifiant local : c'est le remplissage de
  // `/home/continue-listening`. Le prendre pour vrai faisait passer des albums
  // Qobuz pour des albums de la bibliothèque — d'où le crayon et les
  // étiquettes sur les uns et pas sur les autres.
  const idLocal = idLocalValide(o?.album_id) ?? (dist ? null : idLocalValide(o?.id));
  if (idLocal == null && !(svc && dist)) return {};
  // Un identifiant qui désigne une PLAYLIST n'ouvre pas plus un album qu'un
  // identifiant de piste.
  if (idLocal == null && dist && dist.genre !== 'album') return {};
  const sid = dist?.id ?? null;

  /**
   * 🔴 Un identifiant de PISTE n'ouvre pas un album.
   *
   * Bertrand, 05/09/2026 : « pourquoi cet écran incomplet ? » — capture d'une
   * fiche « Random Access Memories » annonçant « 0 titre ». Elle venait d'une
   * tuile « Get Lucky », et la ligne d'historique dit tout :
   *
   *     {"source":"qobuz", "source_id":"9140031", "context_type":"track",
   *      "album_id":null, "album_title":"Random Access Memories",
   *      "title":"Get Lucky"}
   *
   * `source_id` designe la PISTE. L'album, lui, n'a aucun identifiant dans
   * cette ligne — et les deux espaces sont disjoints chez Qobuz. La fiche
   * demandait donc `/streaming/qobuz/albums/9140031/tracks`, qui rend 502
   * (Qobuz 404). Mesure sur le .18.
   *
   * On ne peut pas le deviner : on n'offre donc PAS l'ouverture. La tuile
   * garde sa lecture, qui elle marche — elle passe la paire service +
   * identifiant de piste. Mieux vaut un geste absent qu'un ecran vide.
   *
   * Deux signaux, du plus sur au plus general :
   *  - `context_type === 'track'`, que l'historique ecrit explicitement ;
   *  - un `album_title` different du `title` : le titre de l'objet est celui
   *    d'une piste, pas d'un album.
   */
  if (idLocal == null) {
    const titre = champ(o, 'title');
    const titreAlbum = champ(o, 'album_title');
    const estUnePiste =
      o?.context_type === 'track' || (!!titreAlbum && !!titre && titreAlbum !== titre);
    if (estUnePiste) return {};
  }
  return {
    ouvrir: 'album' as const,
    fiche: {
      id: idLocal ?? null,
      source_id: sid ?? null,
      source: service,
      title: champ(o, 'album_title', 'title') ?? '',
      artist_name: champ(o, 'artist_name', 'artist') ?? '',
      cover_path: champ(o, 'cover_path', 'cover_url', 'image_url') ?? null,
      year: o?.year ?? null,
      format: o?.format ?? o?.quality?.codec ?? null,
      sample_rate: o?.sample_rate ?? o?.quality?.sample_rate ?? null,
      bit_depth: o?.bit_depth ?? o?.quality?.bit_depth ?? null,
    },
  };
}

/**
 * Ce que fait un clic sur une vignette. `undefined` = rien à jouer, et la
 * carte n'affiche alors aucun bouton.
 *
 * ⚠️ Un contenant de STREAMING n'a PAS d'identifiant local. Les albums
 * éditoriaux de Qobuz valent `{artist_id, artist_name, cover_path, quality,
 * source_id, title, track_count, year}` et les parutions d'artistes
 * `{cover_path, service, source_id, title, year}` — mesuré sur le .18 le
 * 02/09/2026. Faute de reconnaître `source_id`, aucune des huit bandes Qobuz
 * ni « Nouveautés de vos artistes » n'avait de bouton Lire. Bertrand :
 * « pas de bouton play sur toutes les covers ».
 *
 * 🔴 `source` est OBLIGATOIRE avec un `streaming_*_id` : le serveur n'apparie
 * les deux qu'ensemble, et un identifiant seul le fait retomber sur
 * « reprendre la lecture en cours » — le même défaut que sur les playlists.
 */
/**
 * 🔴 L'identifiant DISTANT et ce qu'il désigne.
 *
 * Bertrand, 05/09/2026 : « et donc Play ne marche pas ! », et « certains albums
 * Qobuz ont les CTA edit et tag et d'autres non ». Une seule cause pour les
 * deux. Une entrée de `/home/continue-listening` vaut :
 *
 *     {"id": 0, "album_id": null, "context_id": "58698608",
 *      "context_type": "playlist", "source": "qobuz", …}
 *
 * Elle ne porte AUCUN `source_id` : son identifiant est dans `context_id`, et
 * ce qu'il désigne est dans `context_type`. Les deux étaient ignorés.
 *
 * Conséquences mesurées :
 *  - la lecture retombait sur `{album_id: 0}` — `0 != null` est vrai — que le
 *    serveur ne peut apparier ;
 *  - la fiche prenait ce même `0` pour un identifiant LOCAL, d'où le crayon et
 *    les étiquettes sur des albums Qobuz, et seulement sur ceux-là.
 */
/**
 * 🔴 `upnp` N'EST PAS UN SERVICE — bug du .18, 17/09/2026 : « Erreur de
 * lecture : unknown service: upnp », depuis l'Accueil.
 *
 * `/library/albums/recent` rend des albums de BIBLIOTHÈQUE intégrés depuis un
 * serveur UPnP (27 sur 50 sur le .18) :
 *
 *     {"id": 4429, "album_id": null, "source": "upnp",
 *      "source_id": "uuid:258FC2D5-…|0ac4042f1994b976", …}
 *
 * `source` y dit la PROVENANCE, pas un service de streaming, et `source_id`
 * est l'adresse de l'objet sur le serveur UPnP, pas un identifiant distant.
 * Pris pour un service, l'album partait en `streaming_album_id` + `source:
 * upnp`, que le registre des services refuse. Il se joue et s'ouvre par son
 * `id` de bibliothèque, comme un album local.
 */
function estProvenanceBibliotheque(source: string | null | undefined): boolean {
  return !!source && estSourceDeBibliotheque(source);
}

/** Le service de streaming à qui parler — jamais une provenance de bibliothèque. */
function serviceDistant(service: string | null): string | null {
  return service && !estProvenanceBibliotheque(service) ? service : null;
}

function idDistant(o: any): { id: string; genre: string } | null {
  const sid = champ(o, 'source_id');
  if (sid) return { id: String(sid), genre: 'album' };
  const ctx = champ(o, 'context_id');
  if (ctx) return { id: String(ctx), genre: String(o?.context_type ?? 'album') };
  return null;
}

/** Un identifiant local VALIDE. `0` n'en est pas un — c'est le remplissage que
 *  le serveur pose quand il n'en a pas. */
function idLocalValide(v: any): number | null {
  return typeof v === 'number' && v > 0 ? v : null;
}

/**
 * 🔴 LA LIGNE D'HISTORIQUE D'UN SERVICE — bug du .18, 22/09/2026 : une tuile
 * « Récemment écoutés » Qobuz répondait « Erreur de lecture : qobuz
 * /album/get: 404 No result matching given argument ».
 *
 * La ligne vaut, mesurée sur le .18 :
 *
 *     {"source":"qobuz", "source_id":"9140031", "context_type":"track",
 *      "album_id":null, "album_title":"Random Access Memories"}
 *
 * `source_id` est celui de la PISTE (« Get Lucky ») : `record_listen` écrit
 * l'identifiant du morceau diffusé, avec `track_id: None`. `idDistant` le
 * prenait pour un album, et la tuile partait en `streaming_album_id` — que
 * Qobuz ne connaît pas. `ficheDe` avait déjà la garde pour l'OUVERTURE
 * (05/09) ; la lecture ne l'avait pas.
 *
 * Ce que l'auditeur avait demandé est dans `context_*` : un album demandé se
 * rejoue depuis la piste où il en était (`context_position`, son rang dans la
 * file), tout le reste rejoue la piste elle-même.
 */
function gesteHistorique(o: any, svc: string) {
  const ctx = champ(o, 'context_id');
  if (o?.context_type === 'album' && ctx) {
    const rang = typeof o?.context_position === 'number' && o.context_position >= 0
      ? { start_index: o.context_position }
      : {};
    return (z: number) => api.play(z, { streaming_album_id: ctx, source: svc as any, ...rang });
  }
  const sid = champ(o, 'source_id');
  if (sid) return (z: number) => api.play(z, { source: svc as any, source_id: sid });
  return undefined;
}

export function geste(
  o: any,
  service: string | null,
  genre: 'album' | 'playlist' | 'aucun',
  historique = false,
) {
  if (genre === 'aucun') return undefined;
  const local = idLocalValide(o?.album_id);
  if (local != null) return (z: number) => api.play(z, { album_id: local });
  if (o?.track_id != null) return (z: number) => api.play(z, { track_id: o.track_id });

  const svc = serviceDistant(service);
  if (svc && historique) {
    const g = gesteHistorique(o, svc);
    if (g) return g;
  }
  const dist = svc ? idDistant(o) : null;
  if (svc && dist) {
    // Ce que l'identifiant DÉSIGNE prime sur le genre déclaré par le widget :
    // une entrée d'historique dont le contexte est une playlist ne se joue pas
    // comme un album.
    const quoi = dist.genre === 'playlist' || genre === 'playlist' ? 'playlist'
      : dist.genre === 'track' ? 'track' : 'album';
    if (quoi === 'playlist') {
      return (z: number) => api.play(z, { streaming_playlist_id: dist.id, source: svc as any });
    }
    if (quoi === 'track') {
      return (z: number) => api.play(z, { source: svc as any, source_id: dist.id });
    }
    return (z: number) => api.play(z, { streaming_album_id: dist.id, source: svc as any });
  }

  // Un identifiant NU n'est un album que si l'appelant le dit. Sinon on ne
  // prétend pas savoir ce qu'il désigne.
  const nu = idLocalValide(o?.id);
  if (nu != null && genre === 'album' && !dist) {
    return (z: number) => api.play(z, { album_id: nu });
  }
  return undefined;
}

const liste = (r: any): any[] =>
  Array.isArray(r) ? r : (r?.items ?? r?.albums ?? r?.tracks ?? r?.results ?? []);

/**
 * Écarte ce qui n'a rien à montrer.
 *
 * `/home/continue-listening` rend des entrées `{id: 0, album_id: null}` sans
 * titre ni pochette — mesuré sur le serveur de Bertrand le 02/09/2026, deux sur
 * cinq. Affichées, elles donnent des cases grises marquées « — » au milieu des
 * vraies, et on cherche une pochette manquante là où il n'y a pas d'objet.
 */
const utiles = (els: Element[]): Element[] => els.filter((e) => e.titre !== '—' || e.cover);

/** Combien de rangs par colonne du gros widget des tops. */
const RANG_TOPS = 5;

/**
 * Ce qu'on DEMANDE au tableau de bord, et sur quelle période.
 *
 * 🔴 MESURÉ sur le .18 le 20/09/2026, parce que la première version a échoué
 * en plein écran d'accueil : « This widget could not be loaded. (delai) ».
 * La route `GET /library/history/dashboard` coûte ~300 ms PAR ENTRÉE rendue
 * — elle résout les pochettes une par une, et ne met rien en cache :
 *
 *   | période | top_n | temps  |
 *   |---------|-------|--------|
 *   | today   |   1   |  1,9 s |
 *   | today   |  50   | 15,8 s |
 *   | 7d      |  12   |  6,3 s |
 *   | 30d     |   5   |  8,4 s |
 *   | 30d     |  12   | 14,4 s |
 *
 * Le budget d'un widget est de 8 s (`PageWidgets`, DELAI_MS). Deux
 * conséquences, et la première est ma faute :
 *
 *  - je demandais `LIMITE` (50) alors que ces widgets affichent 12 lignes au
 *    plus, et 5 par colonne pour les tops. On ne demande plus que ce qu'on
 *    montre ;
 *  - la période passe de 30 à 7 JOURS. Sur 30 jours, même en ne demandant que
 *    5 entrées, la route dépasse le budget — le widget ne pouvait pas marcher.
 *    Sept jours tient, et pour un accueil « ce que j'écoute en ce moment » est
 *    de toute façon plus juste que « ces trente derniers jours ».
 *
 * Tant que le serveur résout les pochettes une par une, ces widgets restent
 * à la merci d'une machine chargée. Le vrai correctif est là-bas.
 */
const PERIODE_TOPS = '7d' as const;
const TOPS_DEMANDES = 12;

/** Les quatre chiffres de la semaine, dans l'ordre d'affichage. */
const CHIFFRES_SEMAINE = ['lectures', 'heures-ecoutees', 'titres-ecoutes', 'artistes-ecoutes'] as const;

/**
 * Le tableau de bord, partagé entre les widgets qui en vivent.
 *
 * `PageWidgets` charge ses widgets EN PARALLÈLE : sans ce partage, les trois
 * extraits déclencheraient trois fois la même requête au même instant.
 *
 * 🔴 Le partage dure exactement le temps de la requête, PAS une seconde de
 * plus. Ma première version gardait la réponse quinze secondes « le temps
 * d'un chargement de page » : un rechargement demandé par l'utilisateur
 * juste après une écoute lui aurait resservi les anciens chiffres, sans
 * qu'il comprenne pourquoi. Dédoublonner ce qui est simultané, oui ; mettre
 * en cache, non — ce n'est pas la même chose.
 */
const EN_VOL = new Map<string, Promise<api.DashboardData>>();
function tableauDeBord(periode: api.DashboardPeriod): Promise<api.DashboardData> {
  const deja = EN_VOL.get(periode);
  if (deja) return deja;
  const promesse = api
    .getDashboard(periode, { topN: TOPS_DEMANDES })
    .finally(() => EN_VOL.delete(periode));
  EN_VOL.set(periode, promesse);
  return promesse;
}

/**
 * Le sous-titre d'un extrait du tableau de bord : le NOMBRE de lectures, seul.
 *
 * 🔴 Pas de mot à côté, et ce n'est pas de la paresse. `sous` est une DONNÉE
 * produite ici, pas du balisage : `check-i18n` ne la lit pas. Y écrire
 * « 12 lectures » mettrait donc du français dans une interface anglaise sans
 * qu'aucune garde ne bronche — c'est très exactement le défaut trouvé le
 * 20/09/2026 sur `channel_layout_status.detail`. Le titre du widget dit déjà
 * de quoi on parle ; le chiffre est formaté dans la langue de l'utilisateur.
 */
function lectures(n: number, langue: string): string {
  try {
    return new Intl.NumberFormat(langue).format(n);
  } catch {
    return String(n);
  }
}

/**
 * 🔴 LES GESTES DES CLASSEMENTS — Bertrand, 22/09/2026, sur le gros widget
 * « Vos tops » : « rien n'est cliquable !! ». Les trois colonnes rendaient
 * des lignes inertes, et la bande « Artistes les plus écoutés » des cartes au
 * titre désactivé.
 *
 * Ce que porte `GET /library/history/dashboard` (serveur, `history_repo.rs`,
 * `TopArtistEntry` / `TopAlbumEntry` / `TopTrackEntry`) décide de ce qu'on
 * peut offrir, et rien d'autre :
 *
 *  - un ARTISTE n'a que son nom → on l'ouvre par `ouvrirArtisteParNom`,
 *    comme le Tableau de bord ;
 *  - un ALBUM a un `album_id` quand le titre se retrouve dans la
 *    bibliothèque → il s'ouvre et se joue comme une vignette locale. Sinon,
 *    son `source_id` est le `MAX(source_id)` des lignes d'historique — celui
 *    d'une PISTE, pas de l'album (même piège que « Récemment écoutés »). On
 *    joue donc cette piste, comme `playTopAlbum` du Tableau de bord, et on
 *    n'offre PAS de fiche : elle demanderait `/albums/<id de piste>`.
 *  - un TITRE se joue : `track_id` local d'abord, sinon la paire service +
 *    identifiant de piste.
 */
function gesteArtisteTop(nom: string | null | undefined): Pick<Element, 'ouvrir' | 'artiste'> {
  return nom ? { ouvrir: 'artiste', artiste: nom } : {};
}

function gestesAlbumTop(a: api.DashboardData['top_albums'][number]): Partial<Element> {
  const local = idLocalValide(a.album_id);
  if (local != null) {
    return {
      jouer: (z: number) => api.play(z, { album_id: local }),
      ouvrir: 'album',
      fiche: {
        id: local,
        source_id: null,
        source: null,
        title: a.album_title ?? '',
        artist_name: a.artist_name ?? '',
        cover_path: a.cover_path ?? null,
        year: null,
        format: null,
        sample_rate: null,
        bit_depth: null,
      },
    };
  }
  const svc = serviceDistant(a.source ?? null);
  const sid = a.source_id;
  return svc && sid ? { jouer: (z: number) => api.play(z, { source: svc as any, source_id: sid }) } : {};
}

function gestePisteTop(t: api.DashboardData['top_tracks'][number]): Element['jouer'] {
  const local = idLocalValide(t.track_id);
  if (local != null) return (z: number) => api.play(z, { track_id: local });
  const svc = serviceDistant(t.source ?? null);
  const sid = t.source_id;
  return svc && sid ? (z: number) => api.play(z, { source: svc as any, source_id: sid }) : undefined;
}

export const WIDGETS: Widget[] = [
  {
    id: 'zones',
    cleTitre: 'v2.home.wZones',
    forme: 'bande',
    // Construit à la main : une zone n'a pas la forme d'un album. Mais elle
    // passe par les MÊMES garde-fous — l'index dans la clé, et le filtre des
    // entrées vides. C'est le seul chargeur qui y échappait, et rien ne
    // justifiait l'exception.
    /**
     * 🔴 La piste est dans `now_playing`, pas au premier niveau.
     *
     * Une zone rend `{zone_id, state, volume, …, now_playing: {title,
     * artist_name, album_id, cover_path, …}}`. Lus au premier niveau, titre et
     * pochette étaient introuvables : le widget se vidait entièrement.
     *
     * Trouvé en vérifiant les quatorze sources d'un coup après que
     * « Nouveautés de vos artistes » eut échoué pour la même raison
     * (02/09/2026) — plutôt que d'attendre le prochain widget vide.
     */
    charger: async (ctx) => {
      const noms = new Map<any, string>();
      for (const z of ctx.zones ?? []) if (z?.id != null && z?.name) noms.set(z.id, z.name);
      return utiles(
        liste(await api.getNowListening()).map((z: any, i: number) => {
          const np = z?.now_playing ?? {};
          return {
            id: `zone${i}-${z?.zone_id ?? ''}`,
            titre: champ(np, 'title', 'album_title') ?? '—',
            // 🔴 Le nom de la ZONE, et rien d'autre. C'est ce que la bande
            // annonce, et la charge utile ne le porte pas : il se retrouve par
            // `zone_id`. On affichait l'artiste à la place — Bertrand,
            // 02/09/2026 : « le nom de la zone n'apparait pas ».
            sous: noms.get(z?.zone_id) ?? champ(z, 'zone_name', 'name'),
            cover: champ(np, 'cover_path', 'cover_url') ?? null,
            source: champ(np, 'source') ?? null,
            jouer: np?.album_id != null ? (zid: number) => api.play(zid, { album_id: np.album_id }) : undefined,
            // Un clic sur la vignette bascule sur CETTE zone et ouvre
            // « Lecture en cours ». L'écran est déjà là ; la bande y mène.
            ouvrir: 'zone' as const,
            zoneId: z?.zone_id ?? null,
            enLecture: z?.state === 'playing',
          };
        }),
      );
    },
  },
  {
    id: 'zones-cartes',
    cleTitre: 'v2.home.wZonesCards',
    forme: 'zones-cartes',
    /**
     * DEUXIÈME widget des zones — « Créé un deuxième widget ! » (Bertrand,
     * 06/09/2026), sur la maquette Figma.
     *
     * Le premier reste tel quel : une bande de vignettes, une par zone. Il ne
     * tient qu'une pochette, un titre et un nom de zone. Celui-ci prend deux
     * fois la place et montre ce qui ne rentrait pas — le format, la
     * fréquence, la profondeur, l'année, et où l'on en est dans le morceau.
     *
     * ## ⚠️ Aucun appel réseau
     *
     * Tout vient de `/zones`, que la coquille tient déjà dans `ctx.zones` :
     * `current_track` y porte `title`, `artist_name`, `cover_path`, `format`,
     * `sample_rate`, `bit_depth`, `year`, `duration_ms` et `album_id`, et la
     * zone porte `name`, `state` et `position_ms` (mesuré sur le .18 le
     * 06/09/2026). Un widget de plus ne coûte donc pas une requête de plus.
     *
     * ## Il ne rend que des IDENTIFIANTS de zone
     *
     * Le rendu relit le magasin VIVANT. `charger` ne s'exécute qu'une fois :
     * en recopiant ici la position et le titre, la barre de progression
     * resterait figée à l'instant du chargement, et la carte continuerait
     * d'annoncer le morceau précédent.
     *
     * ## Qui s'affiche
     *
     * Les zones qui JOUENT ou sont en PAUSE. Pas celles qui sont à l'arrêt :
     * sur le .18, « Cet ordinateur » est `stopped` et porte pourtant un
     * `current_track` à la position 0 — la retenir remplirait le widget de
     * cartes muettes.
     *
     * `utiles()` ne s'applique pas non plus : une radio sans titre donne
     * « — », mais la carte reste utile — c'est la ZONE qu'elle annonce, et son
     * nom est là.
     */
    charger: async (ctx) =>
      (ctx.zones ?? [])
        .filter((z: any) => z?.current_track && (z.state === 'playing' || z.state === 'paused'))
        .map((z: any, i: number) => ({
          id: `zcarte${i}-${z?.id ?? ''}`,
          titre: champ(z?.current_track, 'title') ?? '—',
          sous: z?.name ?? '',
          cover: champ(z?.current_track, 'cover_path', 'cover_url') ?? null,
          source: champ(z?.current_track, 'source') ?? null,
          zoneId: z?.id ?? null,
          enLecture: z?.state === 'playing',
        })),
  },
  {
    id: 'reprendre',
    cleTitre: 'v2.home.wResume',
    forme: 'bande',
    /**
     * Le serveur étiquette chaque ligne `album` ou `track` ; le client jetait
     * l'étiquette, et la bande mélangeait donc albums et morceaux sans le dire
     * (Alex Campbell, 08/09/2026). La règle vit dans `lib/reprendreEcoute`,
     * pour qu'un test l'APPELLE au lieu de relire ce fichier.
     */
    charger: async () =>
      utiles(
        reprisesUtiles(liste(await api.getContinueListening(LIMITE))).map((o, i) => {
          const el = versElement(o, i, 'rep');
          return { ...el, sous: sousTitreReprise(o) || el.sous };
        }),
      ),
  },
  {
    id: 'recemment-ajoutes',
    cleTitre: 'v2.home.wRecentlyAdded',
    forme: 'bande',
    charger: async () =>
      utiles(liste(await api.getRecentAlbums(LIMITE)).map((o, i) => versElement(o, i, 'alb'))),
  },
  {
    id: 'recemment-ecoutes',
    cleTitre: 'v2.home.wRecentlyPlayed',
    forme: 'bande',
    charger: async () =>
      utiles(liste(await api.getPlaybackHistory(LIMITE)).map((o, i) => versElement(o, i, 'hist', { historique: true }))),
  },
  {
    id: 'hasard',
    cleTitre: 'v2.home.wRandom',
    forme: 'bande',
    // 🔴 renesenses/tune-server-rust#4800 — UNE requête de cinquante albums,
    // tirés PAR LE SERVEUR (`sort=random`, #3074 : sans graine, il en tire une
    // et mélange en SQL, sans remise). Ce widget tirait sur place dans
    // `ctx.albums`, « déjà chargée par la coquille » — c'est précisément ce
    // chargement de 3,5 Mo au démarrage qui est retiré : la coquille ne
    // charge plus rien, et un tirage sur une liste vide ne rendait plus
    // rien. Cinquante albums pèsent ~18 Ko.
    charger: async (ctx) => {
      // La liste entière, si un autre écran l'a déjà demandée : le tirage se
      // fait alors sur place, sans requête, comme avant.
      const src = [...(ctx.albums ?? [])];
      if (src.length) {
        const tire: any[] = [];
        // Tirage sans remise : `sort(() => Math.random() - .5)` n'est pas un
        // mélange — il biaise selon l'algorithme de tri du moteur.
        for (let n = 0; n < LIMITE && src.length; n++) {
          tire.push(src.splice(Math.floor(Math.random() * src.length), 1)[0]);
        }
        return utiles(tire.map((o, i) => versElement(o, i, 'alb')));
      }
      const page = await api.getAlbumsPagines({ limit: LIMITE, offset: 0, sort: 'random' });
      return utiles(page.items.map((o, i) => versElement(o, i, 'alb')));
    },
  },
  {
    id: 'nouveautes-artistes',
    cleTitre: 'v2.home.wArtistReleases',
    forme: 'bande',
    /**
     * 🔴 Cette source ne rend PAS des albums.
     *
     * Elle rend des ARTISTES, chacun portant ses parutions :
     * `{artist_name, is_favorite, key, library_albums, releases[]}`. Une
     * parution vaut `{title, year, cover_path, service, source_id}` — la
     * pochette est une URL distante (Tidal, Qobuz), pas un chemin de cache.
     *
     * Passée au convertisseur commun, chaque entrée n'avait ni titre ni
     * pochette : le filtre des entrées vides les retirait TOUTES, et le widget
     * annonçait « rien à montrer » sur vingt artistes. Mesuré sur le serveur de
     * Bertrand le 02/09/2026.
     *
     * On DÉPLIE donc, et l'artiste devient le sous-titre — c'est lui qui donne
     * son sens à la nouveauté.
     */
    charger: async () => {
      const artistes = liste(await api.getArtistReleases(LIMITE));
      const out: Element[] = [];
      for (const a of artistes) {
        for (const r of a?.releases ?? []) {
          if (out.length >= LIMITE) break;
          out.push({
            id: `nar${out.length}-${r?.source_id ?? ''}`,
            titre: champ(r, 'title') ?? '—',
            sous: champ(a, 'artist_name') ?? champ(r, 'service'),
            cover: champ(r, 'cover_path', 'cover_url') ?? null,
            // Une parution porte `service` + `source_id` — mesure sur le .18 :
            // `{cover_path, service, source_id, title, year}`. C'est un album
            // de STREAMING : jouable, a condition d'envoyer le service AVEC
            // l'identifiant (le serveur n'apparie que la paire).
            source: champ(r, 'service') ?? null,
            jouer: geste(r, champ(r, 'service') ?? null, 'album'),
            ...ficheDe(r, champ(r, 'service') ?? null, 'album'),
          });
        }
      }
      return utiles(out);
    },
  },
  {
    id: 'nouveau-bibliotheque',
    cleTitre: 'v2.home.wNewInLibrary',
    forme: 'bande',
    charger: async () =>
      utiles(liste(await api.getNewInLibrary()).slice(0, LIMITE).map((o, i) => versElement(o, i, 'alb'))),
  },
  {
    id: 'autres-versions',
    cleTitre: 'v2.home.wOtherVersions',
    forme: 'bande',
    /**
     * La pochette est portée par la VERSION, pas par l'entrée.
     *
     * Une entrée vaut `{title, artist_name, played_album, versions[]}`, et
     * chaque version `{album_id, album_title, cover_path, track_id}`. Sans
     * descendre d'un cran, la bande s'affichait sans aucune image.
     */
    charger: async () =>
      utiles(
        liste(await api.getOtherVersions(LIMITE)).map((o: any, i: number) => {
          const v = (o?.versions ?? [])[0] ?? {};
          return {
            id: `ver${i}-${v?.album_id ?? ''}`,
            titre: champ(v, 'album_title') ?? champ(o, 'title') ?? '—',
            sous: champ(o, 'artist_name'),
            cover: champ(v, 'cover_path') ?? null,
            jouer: v?.album_id != null ? (z: number) => api.play(z, { album_id: v.album_id }) : undefined,
          };
        }),
      ),
  },
  {
    id: 'favoris',
    cleTitre: 'v2.home.wFavorites',
    forme: 'bande',
    charger: async (ctx) => {
      if (ctx.profileId == null) return [];
      const f = await api.getFavorites(ctx.profileId);
      return utiles((f?.albums ?? []).slice(0, LIMITE).map((o: any, i: number) => versElement(o, i, 'alb')));
    },
  },
  {
    id: 'recommandations',
    cleTitre: 'v2.home.wRecommendations',
    forme: 'bande',
    charger: async () =>
      utiles(liste(await api.getHomeRecommendations()).slice(0, LIMITE).map((o, i) => versElement(o, i, 'rec'))),
  },
  {
    id: 'radios-artistes',
    cleTitre: 'v2.home.wArtistRadios',
    forme: 'bande',
    charger: async () =>
      utiles(
        liste(await api.getRadioPicks())
          .slice(0, LIMITE)
          .map((o, i) => {
            // Une station n'est ni un album ni une playlist : son `id` designe
            // une RADIO, et la lecture passe par sa propre route. Passe au
            // convertisseur commun, cet `id` serait parti en `album_id` et
            // aurait joue un album au hasard.
            const el = versElement(o, i, 'rad', { genre: 'aucun' });
            return o?.id != null
              ? { ...el, jouer: (z: number) => api.playRadio(o.id, z) }
              : el;
          }),
      ),
  },
  {
    id: 'podcasts-abonnements',
    cleTitre: 'v2.home.wPodcasts',
    forme: 'bande',
    charger: async () =>
      utiles(liste(await api.getPodcastSubscriptions()).slice(0, LIMITE).map((o, i) => versElement(o, i, 'pod', { genre: 'aucun' }))),
  },
  {
    id: 'qobuz-selection',
    cleTitre: 'v2.home.wQobuz',
    forme: 'bande',
    charger: async () =>
      utiles(liste(await api.getStreamingFeaturedPlaylists('qobuz')).slice(0, LIMITE).map((o, i) => versElement(o, i, 'qob', { service: 'qobuz', genre: 'playlist' }))),
  },
  // ── ÉDITORIAL QOBUZ ──────────────────────────────────────────────────────
  //
  // Sept sections, mesurées le 02/09/2026 : chacune rend cinquante albums.
  // C'est le contenu que Bertrand jugeait « plus étoffé sur la version
  // actuelle » — il existait côté serveur, aucun écran du nouveau client ne le
  // montrait.
  //
  // Elles sont déclarées d'un bloc plutôt qu'une par une : même route, même
  // forme, seul l'identifiant de section change. En ajouter une le jour où
  // Qobuz en ouvre une nouvelle tient sur une ligne.
  ...(
    [
      ['qobuz-nouveautes', 'new-releases', 'v2.home.wQobuzNew'],
      ['qobuz-ventes', 'best-sellers', 'v2.home.wQobuzBest'],
      ['qobuz-presse', 'press-awards', 'v2.home.wQobuzPress'],
      ['qobuz-choix', 'editor-picks', 'v2.home.wQobuzPicks'],
      ['qobuz-ecoutes', 'most-streamed', 'v2.home.wQobuzStreamed'],
      ['qobuz-discotheque', 'ideal-discography', 'v2.home.wQobuzIdeal'],
      ['qobuz-qobuzissimes', 'qobuzissims', 'v2.home.wQobuzissimes'],
    ] as const
  ).map(([id, section, cleTitre]): Widget => ({
    id,
    cleTitre,
    forme: 'bande',
    charger: async () =>
      utiles(
        liste(await api.getStreamingFeatured('qobuz', section, LIMITE)).map((o, i) =>
          versElement(o, i, id, { service: 'qobuz' }),
        ),
      ),
  })),

  {
    id: 'statistiques',
    cleTitre: 'v2.home.wStats',
    forme: 'chiffres',
    /** #1426 — le SEUL widget qui lise `ctx.chiffresChoisis` : le seul à
     *  offrir le sélecteur de #4527. */
    chiffresComposables: true,
    charger: async () => [],
    /**
     * LA LIGNE DE CHIFFRES, d'après la maquette de Levente et les arbitrages
     * de Bertrand du 19/09/2026 (tune-server-rust#4527).
     *
     * Elle n'impose plus cinq chiffres : chacun compose les siens dans un
     * CATALOGUE (`lib/chiffresAccueil`), bibliothèque et écoute mêlées.
     *
     * 🔴 On n'interroge QUE les sources des chiffres affichés — pas de
     * `/library/genres` (115 lignes) si aucune carte de genre n'est là — et
     * un appel qui échoue n'emporte pas les autres : sa famille de chiffres
     * s'efface, les autres restent.
     */
    chiffres: async (ctx) => {
      const ids = ctx.chiffresChoisis?.length ? ctx.chiffresChoisis : CHOIX_DEFAUT;
      const besoin = sourcesNecessaires(ids);
      const [bibliotheque, ecoute, genres] = await Promise.all([
        besoin.bibliotheque ? api.getLibraryStats().catch(() => null) : Promise.resolve(null),
        besoin.ecoute ? api.getDashboardStats().catch(() => null) : Promise.resolve(null),
        besoin.genres
          ? api.getGenres().then((g: any[]) => g.length).catch(() => null)
          : Promise.resolve(null),
      ]);
      return cartes(ids, { bibliotheque, ecoute, genres }, ctx.langue ?? 'fr').map((c) => ({
        cle: c.cleLibelle,
        valeur: c.texte,
        id: c.id,
        icone: c.icone,
        vue: c.vue,
      }));
    },
  },
  /**
   * ── EXTRAITS DU TABLEAU DE BORD (Bertrand, 20/09/2026) ─────────────────
   *
   * « À partir du tableau de bord, extraire : widget Artistes les plus
   * écoutés, gros widget top Artists / Albums / Tracks, widget Radios les
   * plus écoutées. »
   *
   * Les trois vivent de la MÊME réponse — `GET /library/history/dashboard`
   * porte déjà `top_artists`, `top_albums`, `top_tracks` et `top_radios`.
   * C'est donc un déplacement, pas une réécriture : aucune route nouvelle,
   * aucun travail serveur.
   *
   * 🔴 D'où `tableauDeBord()` juste en dessous : `PageWidgets` charge ses
   * widgets EN PARALLÈLE. Trois widgets qui appellent chacun la route, c'est
   * trois fois la même requête — sur une grosse histoire, elle n'est pas
   * gratuite. La promesse est partagée le temps du chargement.
   */
  {
    id: 'top-artistes',
    cleTitre: 'v2.home.wTopArtists',
    forme: 'bande',
    charger: async (ctx) =>
      utiles(
        (await tableauDeBord(PERIODE_TOPS)).top_artists.slice(0, TOPS_DEMANDES).map((a, i) => ({
          id: `top-art-${i}-${a.artist_name}`,
          titre: a.artist_name,
          sous: lectures(a.plays, ctx.langue ?? 'fr'),
          cover: a.cover_path ?? null,
          ...gesteArtisteTop(a.artist_name),
        })),
      ),
  },
  {
    id: 'top-radios',
    cleTitre: 'v2.home.wTopRadios',
    forme: 'bande',
    charger: async (ctx) =>
      utiles(
        // `top_radios` est ABSENT de la réponse quand la liste est vide
        // (`skip_serializing_if` côté serveur) — pas `[]`, absent.
        ((await tableauDeBord(PERIODE_TOPS)).top_radios ?? []).slice(0, TOPS_DEMANDES).map((r, i) => {
          const el = {
            id: `top-rad-${i}-${r.station_name}`,
            titre: r.station_name,
            sous: lectures(r.plays, ctx.langue ?? 'fr'),
            cover: r.cover_path ?? r.cover_url ?? null,
          };
          // Même piège que `radios-artistes` : une station se joue par SA
          // route, sinon son identifiant partirait en `album_id`.
          return r.radio_id != null
            ? { ...el, jouer: (z: number) => api.playRadio(r.radio_id as number, z) }
            : el;
        }),
      ),
  },
  /**
   * LA SEMAINE ÉCOULÉE — « Widget Stats de la semaine ».
   *
   * Rien de neuf côté serveur : `getDashboard` accepte déjà `'7d'`, et ses
   * totaux ont la même forme que ceux de `/dashboard/stats`. On les y ramène
   * pour réutiliser le catalogue `chiffresAccueil` — mêmes libellés, mêmes
   * icônes, même formatage des heures et des nombres que la ligne de chiffres
   * de la bibliothèque. Un second formateur aurait divergé.
   */
  {
    id: 'stats-semaine',
    cleTitre: 'v2.home.wWeekStats',
    forme: 'chiffres',
    charger: async () => [],
    chiffres: async (ctx) => {
      const t = (await tableauDeBord(PERIODE_TOPS)).totals;
      const ecoute = {
        total_listens: t.plays,
        total_duration_ms: t.listening_ms,
        unique_tracks: t.unique_tracks,
        unique_artists: t.unique_artists,
      };
      return cartes(CHIFFRES_SEMAINE, { ecoute }, ctx.langue ?? 'fr').map((c) => ({
        cle: c.cleLibelle,
        valeur: c.texte,
        id: c.id,
        icone: c.icone,
        vue: c.vue,
      }));
    },
  },
  /**
   * LE GROS WIDGET DES TOPS — artistes, albums et titres côte à côte.
   *
   * Bertrand, 20/09/2026 : « gros widget top Artists / Albums / Tracks ». Il
   * ne remplace PAS `top-artistes` : « en complément », dit-il — un petit
   * widget pour qui ne veut que les artistes, un gros pour qui veut les trois.
   *
   * Une seule requête pour les trois colonnes, partagée avec les deux autres
   * extraits par `tableauDeBord()`. Les trois listes sont aplaties en une, et
   * `colonne` dit à laquelle chaque élément appartient : le registre des
   * widgets reste plat, c'est la FORME qui range.
   */
  {
    id: 'tops',
    cleTitre: 'v2.home.wTops',
    forme: 'tops',
    charger: async (ctx) => {
      const d = await tableauDeBord(PERIODE_TOPS);
      const n = (v: number) => lectures(v, ctx.langue ?? 'fr');
      const artistes: Element[] = d.top_artists.slice(0, RANG_TOPS).map((a, i) => ({
        id: `tops-art-${i}-${a.artist_name}`,
        titre: a.artist_name,
        sous: n(a.plays),
        cover: a.cover_path ?? null,
        colonne: 'artistes' as const,
        ...gesteArtisteTop(a.artist_name),
      }));
      const albums: Element[] = d.top_albums.slice(0, RANG_TOPS).map((a, i) => ({
        id: `tops-alb-${i}-${a.album_title}`,
        titre: a.album_title,
        sous: a.artist_name,
        cover: a.cover_path,
        colonne: 'albums' as const,
        ...gestesAlbumTop(a),
      }));
      const titres: Element[] = d.top_tracks.slice(0, RANG_TOPS).map((t, i) => ({
        id: `tops-tit-${i}-${t.title}`,
        titre: t.title,
        sous: t.artist_name,
        cover: t.cover_path ?? null,
        colonne: 'titres' as const,
        jouer: gestePisteTop(t),
      }));
      return utiles([...artistes, ...albums, ...titres]);
    },
  },
];

/**
 * Disposition par DÉFAUT — celle de l'accueil actuel.
 *
 * Choix de Bertrand : personne ne doit voir son écran changer sans l'avoir
 * demandé. Ce sont exactement les quatre sections que `HomeV2` affichait.
 */
/**
 * ⚠️ `zones-cartes` n'y figure PAS, et c'est délibéré.
 *
 * J'avais commencé par l'y mettre. La garde d'`accueilConfigurable` me l'a
 * refusé, avec sa raison écrite noir sur blanc : « personne ne doit voir son
 * écran changer sans l'avoir demandé ». C'est la règle de Bertrand, et elle
 * vaut aussi quand c'est lui qui demande le widget : il a demandé qu'il
 * EXISTE, pas qu'il s'impose sur l'accueil de tout le monde.
 *
 * Il s'ajoute depuis le mode édition, comme les dix-neuf autres.
 */
/**
 * 🔴 #1426 — les DEUX exceptions, et pourquoi elles n'en sont pas vraiment.
 *
 * La 0.9.161 a retiré l'entrée « Tableau de bord » de la barre (PR #1415,
 * `121bb1ba`, décision du 20/09) et porté ses widgets vers l'accueil
 * (PR #1416) — mais hors du défaut, au nom de la règle ci-dessus. Solde vu
 * du siège du testeur : l'entrée disparaît, et rien n'apparaît. C'est ce que
 * FabienM signale (fil 1870), ce que Jean Valjean confirme, et ce que
 * FabienM précise le 22/09 : « pour ceux qui ne l'ajoute pas à leur écran
 * d'accueil et qui souhaiteraient tout de même consulter quelques
 * statistiques ».
 *
 * Arbitrage de Bertrand du 22/09/2026 : `top-artistes` et `stats-semaine`
 * entrent dans le défaut. La règle n'est pas abandonnée — elle cédait ici
 * devant une PERTE d'accès créée dans la même version, pas devant l'envie
 * d'ajouter un widget.
 *
 * Ils entrent EN QUEUE : le haut de page d'un accueil existant ne bouge pas.
 * Et ils n'entrent que pour qui n'a RIEN enregistré : `PageWidgets.charger()`
 * remplace la disposition dès que les préférences du profil en portent une.
 *
 * `top-radios` et le gros widget `tops` restent hors du défaut : ils ne
 * remplacent aucun accès perdu.
 */
export const DISPOSITION_DEFAUT = [
  'reprendre',
  'nouveautes-artistes',
  'recemment-ajoutes',
  'statistiques',
  'top-artistes',
  'stats-semaine',
];

export function widgetParId(id: string): Widget | undefined {
  return WIDGETS.find((w) => w.id === id);
}
