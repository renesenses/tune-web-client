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
  ouvrir?: 'album' | 'zone' | null;
  /** Album normalisé pour la fiche, quand `ouvrir` vaut `album`. */
  fiche?: any;
  /** Zone suivie par la vignette — bande « Zones d'écoute actives ». */
  zoneId?: number | null;
  /** Cette zone joue-t-elle ? Pilote le mini-analyseur sous la vignette. */
  enLecture?: boolean;
}

export type Forme = 'bande' | 'chiffres';

export interface Widget {
  id: string;
  /** Clé de traduction du titre. Jamais une chaîne en dur. */
  cleTitre: string;
  forme: Forme;
  /** Rend les éléments à afficher. Peut lever : l'appelant l'attrape. */
  charger: (ctx: Contexte) => Promise<Element[]>;
  /** Chiffres d'un widget de statistiques. */
  chiffres?: (ctx: Contexte) => Promise<{ cle: string; valeur: string }[]>;
}

export interface Contexte {
  profileId: number | null;
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
}

function versElement(o: any, i: number, prefixe: string, opts: OptsElement = {}): Element {
  const id = champ(o, 'id', 'album_id', 'track_id', 'source_id', 'feed_url', 'uri') ?? '';
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
    jouer: geste(o, service, opts.genre ?? 'album'),
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
  if (genre !== 'album') return {};
  const sid = champ(o, 'source_id');
  const idLocal = o?.album_id ?? (sid ? null : o?.id);
  if (idLocal == null && !(service && sid)) return {};
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
export function geste(o: any, service: string | null, genre: 'album' | 'playlist' | 'aucun') {
  if (genre === 'aucun') return undefined;
  if (o?.album_id != null) return (z: number) => api.play(z, { album_id: o.album_id });
  if (o?.track_id != null) return (z: number) => api.play(z, { track_id: o.track_id });
  const sid = champ(o, 'source_id');
  if (service && sid) {
    return genre === 'playlist'
      ? (z: number) => api.play(z, { streaming_playlist_id: sid, source: service as any })
      : (z: number) => api.play(z, { streaming_album_id: sid, source: service as any });
  }
  // Un identifiant NU n'est un album que si l'appelant le dit. Sinon on ne
  // prétend pas savoir ce qu'il désigne.
  if (o?.id != null && genre === 'album' && !sid) {
    return (z: number) => api.play(z, { album_id: o.id });
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
    id: 'reprendre',
    cleTitre: 'v2.home.wResume',
    forme: 'bande',
    charger: async () =>
      utiles(liste(await api.getContinueListening(LIMITE)).map((o, i) => versElement(o, i, 'rep'))),
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
      utiles(liste(await api.getPlaybackHistory(LIMITE)).map((o, i) => versElement(o, i, 'hist'))),
  },
  {
    id: 'hasard',
    cleTitre: 'v2.home.wRandom',
    forme: 'bande',
    // AUCUN appel : la bibliothèque est déjà chargée par la coquille. Une route
    // « au hasard » ferait payer un aller-retour pour un tirage qu'on peut faire
    // sur place.
    charger: async (ctx) => {
      const src = [...(ctx.albums ?? [])];
      const tire: any[] = [];
      // Tirage sans remise : `sort(() => Math.random() - .5)` n'est pas un
      // mélange — il biaise selon l'algorithme de tri du moteur.
      for (let n = 0; n < LIMITE && src.length; n++) {
        tire.push(src.splice(Math.floor(Math.random() * src.length), 1)[0]);
      }
      return utiles(tire.map((o, i) => versElement(o, i, 'alb')));
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
    charger: async () => [],
    chiffres: async () => {
      const s: any = await api.getLibraryStats();
      const heures = Math.round((s?.total_duration_ms ?? 0) / 3_600_000);
      const gio = (s?.total_size_bytes ?? 0) / 1024 ** 3;
      return [
        { cle: 'v2.home.sAlbums', valeur: String(s?.albums ?? 0) },
        { cle: 'v2.home.sArtists', valeur: String(s?.artists ?? 0) },
        { cle: 'v2.home.sListens', valeur: String(s?.listens ?? 0) },
        { cle: 'v2.home.sHours', valeur: String(heures) },
        { cle: 'v2.home.sSize', valeur: `${gio.toFixed(1)} Gio` },
      ];
    },
  },
];

/**
 * Disposition par DÉFAUT — celle de l'accueil actuel.
 *
 * Choix de Bertrand : personne ne doit voir son écran changer sans l'avoir
 * demandé. Ce sont exactement les quatre sections que `HomeV2` affichait.
 */
export const DISPOSITION_DEFAUT = [
  'reprendre',
  'nouveautes-artistes',
  'recemment-ajoutes',
  'statistiques',
];

export function widgetParId(id: string): Widget | undefined {
  return WIDGETS.find((w) => w.id === id);
}
