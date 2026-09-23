/**
 * Favoris d'un objet de service (Qobuz, Tidal, …) — le SEUL chemin.
 *
 * Signalé par Didier (forum #1478) : mettre une piste Qobuz en favori depuis
 * la barre de lecture ne cochait pas le cœur de la même piste dans la liste de
 * l'album. Deux boutons, deux vérités.
 *
 * La cause n'était pas un défaut de rafraîchissement mais **deux chemins
 * différents** :
 *
 * - `HeartButton` écrivait dans `favoriteStreamingKeys` (les favoris de Tune,
 *   rattachés au profil) *et* recopiait vers le service ;
 * - la barre de lecture n'appelait que le service, et lisait son état par un
 *   aller-retour réseau au lieu du magasin.
 *
 * Le cœur de la barre pouvait donc être plein pendant que celui de la liste
 * restait vide : ils ne parlaient pas de la même chose. Cette divergence-là ne
 * se corrige pas en synchronisant deux implémentations — elle se corrige en
 * n'en gardant qu'une, d'où ce module.
 */
import { get } from 'svelte/store';
import {
  favoriteStreamingKeys,
  streamingFavKey,
  currentProfileId,
  loadProfiles,
} from './stores/profile';
import * as api from './api';
import { notifications } from './stores/notifications';
import { t } from './i18n';
import { BANDCAMP_SVC, cleServeur } from './ongletsStreaming';
import { streamingServices } from './stores/streaming';

/**
 * `playlist` a rejoint la liste pour #2370 (Didier, fil 1541) : on pouvait
 * favoriser un album Qobuz, jamais une playlist Qobuz.
 *
 * Rien n'a eu à changer dans le mécanisme ci-dessous — il ne regarde le type
 * que pour fabriquer une clé et un pluriel. Ce qui manquait était le TYPE au
 * sens TypeScript (le compilateur refusait l'appel), le BOUTON sur la fiche
 * playlist, et surtout la RELECTURE (voir `fusionnerPlaylistsFavorites`).
 */
export type StreamingItemType = 'track' | 'album' | 'artist' | 'playlist';

export interface StreamingRef {
  itemType: StreamingItemType;
  service: string;
  serviceId: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
}

/**
 * Les services dont l'identifiant de PISTE ne désigne pas une piste.
 *
 * `radio` : le `source_id` d'un titre entendu à la radio est l'URL du FLUX, pas
 * celle du morceau. Le serveur republie le MÊME `source_id` à chaque changement
 * de morceau — `tune-core/src/poller/radio.rs`, où le `NowPlaying` reconstruit
 * porte un titre neuf et `source_id: np.source_id.clone()`. Tous les titres
 * entendus sur une station partagent donc une seule clé
 * `track:radio:<url du flux>` : un favori posé sur l'un remplissait le cœur de
 * TOUS les autres.
 *
 * Signalé par Reivax66 le 09/09/2026 (ticket support 104, fil 1729, #3729) :
 * « lors d'un clic pour ajouter un titre radio live aux favoris dans
 * l'historique tous les titres radio live sont sélectionnés ».
 *
 * ⚠️ Le garde de l'identifiant VIDE, juste en dessous, ne mordait pas ici :
 * l'identifiant n'est pas vide, il est partagé par nature.
 *
 * Conséquence assumée : une ligne de radio n'a plus de cœur de service. Ce
 * n'est pas une perte — un titre de radio se met en favori par
 * `/radio-favorites`, qui l'indexe par (titre, artiste, station) et donne donc
 * bien UNE clé par titre. C'est le cœur que l'écran Historique pose déjà dans
 * sa colonne suffixe (`HistoriqueV2.svelte`), et les deux cœurs voisins qui
 * disaient deux choses différentes sur la même ligne disparaissent avec
 * celui-ci. Un cœur absent vaut mieux qu'un cœur qui ment — c'est la règle que
 * `PisteActions` s'était déjà donnée : « ce qui ne s'applique pas est ABSENT ».
 */
const SERVICES_SANS_IDENTIFIANT_DE_PISTE: ReadonlySet<string> = new Set(['radio']);

/** Clé d'appartenance, ou `null` quand l'objet n'est pas identifiable.
 *
 *  Un identifiant vide n'est pas une clé : il ferait cocher le cœur de tous
 *  les objets sans identifiant du même service. Un identifiant PARTAGÉ non
 *  plus — voir `SERVICES_SANS_IDENTIFIANT_DE_PISTE` juste au-dessus. */
/** L'hôte des flux Bandcamp. Les CDN se numérotent (`t4`, `t5`…) : on
 *  reconnaît le DOMAINE, pas un sous-domaine précis. */
const DOMAINE_FLUX_BANDCAMP = 'bcbits.com';

/** Une URL de flux Bandcamp, telle que `data-tralbum` la sert.
 *
 *  Les deux conditions comptent. L'hôte seul attraperait les pochettes
 *  (`f4.bcbits.com/img/…`), dont l'URL est stable et sert d'identité ailleurs ;
 *  `/stream/` seul attraperait les flux d'un autre service.
 *
 *  🔴 Le domaine se compare par COMPOSANT, jamais par fin de chaîne :
 *  `evilbcbits.com` se termine par `bcbits.com`, et une garde en `endsWith`
 *  lui laisserait tronquer nos identifiants. */
function estUnFluxBandcamp(id: string): boolean {
  const reste = id.startsWith('https://')
    ? id.slice(8)
    : id.startsWith('http://')
      ? id.slice(7)
      : null;
  if (reste == null) return false;
  const finHote = reste.indexOf('/');
  if (finHote < 0) return false;
  const hote = reste.slice(0, finHote);
  const bonDomaine =
    hote === DOMAINE_FLUX_BANDCAMP || hote.endsWith(`.${DOMAINE_FLUX_BANDCAMP}`);
  return bonDomaine && reste.slice(finHote).startsWith('/stream/');
}

/** L'identité durable d'un favori de service — le PENDANT EXACT de
 *  `tune_core::streaming::favorites_identity::identite_de_favori`.
 *
 *  Bandcamp **resigne** l'URL de flux d'une piste à chaque lecture de page :
 *  mesuré le 20/09/2026 à trois secondes d'écart, même chemin, jetons neufs.
 *  Le serveur range donc le favori sous l'URL privée de sa requête ; sans la
 *  même coupe ici, le cœur reste ÉTEINT sur un favori pourtant conservé
 *  (FabienM, 0.9.158, fil forum 1862 point 4).
 *
 *  Volontairement tolérante : un identifiant vide, un identifiant qui n'est
 *  pas une URL, une page d'album ou une pochette ressortent tels quels. Ce
 *  n'est pas une validation, c'est une normalisation. */
export function identiteDeFavori(serviceId: string): string {
  if (!estUnFluxBandcamp(serviceId)) return serviceId;
  // Couper au PREMIER des deux séparateurs : une URL peut porter un fragment
  // sans requête, et un `?` après `#` appartiendrait alors au fragment.
  const i = serviceId.search(/[?#]/);
  return i < 0 ? serviceId : serviceId.slice(0, i);
}

/**
 * La référence de favori d'une VIGNETTE de service, telle que les écrans
 * tiennent leurs articles — #1400, moitié client de
 * `tune-server-rust#4577` point 3 (FabienM, 0.9.158, fil 1862 point 4 :
 * « on ne peut pas mettre un artiste ou un album issus de Bandcamp en favori,
 * pas d'icône cœur »).
 *
 * Deux écarts séparaient un article Bandcamp du reste, et les deux se
 * corrigent ici plutôt que dans chaque écran :
 *
 * 1. 🔴 **La clé d'ONGLET n'est pas la clé du SERVEUR.** L'onglet Bandcamp
 *    du client s'appelle `__bandcamp__` (`BANDCAMP_EXT`) parce que le service
 *    générique et l'extension se disputaient la rangée (#860). Cette clé est
 *    LOCALE : `streaming_favorites` range `bandcamp`. Un cœur posé sous
 *    `__bandcamp__` n'aurait jamais retrouvé le favori rendu par le serveur.
 *    On repasse donc par `cleServeur`, la traduction qui existe déjà — pas
 *    une seconde.
 * 2. 🔴 **Bandcamp ne numérote pas ses albums.** Les articles viennent de
 *    `/ext/bandcamp/…` et portent `url`, jamais `source_id` : `favKeyOf`
 *    rendait `null`, et `PochetteActions` n'affiche aucun cœur quand la
 *    référence est nulle. L'identité d'un album Bandcamp EST l'adresse
 *    publique de sa page — celle que `ouvrirFiche`, `playAlbum` et le
 *    serveur (`album_depuis_url`) emploient déjà.
 *
 * ⭐ **L'ARTISTE a rejoint l'album le 23/09/2026** — `tune-server-rust#4577`,
 * la moitié du point 4 de FabienM que #1400 avait laissée : « on ne peut pas
 * mettre un ARTISTE ou un album issus de Bandcamp en favori ». L'album fut
 * traité, l'artiste ne le fut nulle part. Son identité est la même chose que
 * celle de l'album — l'adresse publique de sa page, `https://<lui>.bandcamp.com`
 * — et c'est déjà la clé que `bandcampArtist(url)` et `/ext/bandcamp/artist`
 * emploient tous les deux. Bandcamp ne numérote pas plus ses artistes que ses
 * albums : sans ce repli, `favKeyOf` rendait `null` et aucun écran ne pouvait
 * dessiner le cœur.
 *
 * ⚠️ **Le repli sur `url` ne vaut QUE pour un album ou un artiste.** Une PISTE
 * Bandcamp est identifiée par son URL de flux mp3-128 (`resolve_direct_url`,
 * et c'est ce que la barre de lecture met en favori) ; la lui remplacer par
 * l'adresse de sa page fabriquerait une SECONDE vérité à côté de la première —
 * deux cœurs qui ne parlent pas du même objet, exactement le défaut de Didier
 * (#1478) que ce module existe pour avoir refermé. Une piste sans `source_id`
 * reste donc sans cœur, comme aujourd'hui. Une PLAYLIST non plus : Bandcamp
 * n'en publie pas, et ouvrir le repli à un type qui n'existe pas ne se
 * mesurerait nulle part.
 *
 * Ne normalise RIEN d'autre : la coupe de la signature resignée appartient à
 * `identiteDeFavori`, que `favKeyOf` applique juste après.
 */
export function refFavoriDeVignette(
  itemType: StreamingItemType,
  objet: { source?: unknown; source_id?: unknown; url?: unknown } | null | undefined,
  ongletActif: string | null | undefined,
): Pick<StreamingRef, 'itemType' | 'service' | 'serviceId'> {
  const onglet = (objet?.source as string | null | undefined) ?? ongletActif;
  const service = cleServeur(onglet) ?? '';
  const brut = objet?.source_id;
  const serviceId = brut == null ? '' : String(brut);
  if (serviceId.trim()) return { itemType, service, serviceId };
  if (
    service === BANDCAMP_SVC &&
    (itemType === 'album' || itemType === 'artist') &&
    objet?.url
  ) {
    return { itemType, service, serviceId: String(objet.url) };
  }
  return { itemType, service, serviceId: '' };
}

/**
 * La référence de favori de la FICHE d'un album de service — #1409.
 *
 * Depuis #1400 la VIGNETTE d'un album Bandcamp porte son cœur ; la fiche du
 * même album n'en avait aucun. `AlbumDetailV2` ne composait la référence que
 * pour un album de SERVICE (`service` + `source_id`), et un album Bandcamp y
 * arrive par une autre porte — la propriété `bandcamp` (l'URL de sa page),
 * `service` restant `null`. Le cœur n'était donc jamais dessiné.
 *
 * On ne pose pas une troisième règle : la fiche repasse par
 * `refFavoriDeVignette`, donc par `cleServeur` (`__bandcamp__` → `bandcamp`)
 * et par le repli sur l'URL de page propre à l'album Bandcamp. Vignette et
 * fiche composent ainsi la MÊME clé, et montrent le même état.
 *
 * `null` quand l'album n'est pas désignable par une paire service +
 * identifiant : un album de la bibliothèque (son `id` le désigne), ou un objet
 * sans identifiant exploitable.
 */
export function refFavoriDeFiche(
  album: { id?: unknown; source?: unknown; source_id?: unknown; url?: unknown } | null | undefined,
  service: string | null | undefined,
  bandcamp: string | null | undefined,
): Pick<StreamingRef, 'itemType' | 'service' | 'serviceId'> | null {
  if (!album || album.id != null) return null;
  let objet: { source?: unknown; source_id?: unknown; url?: unknown };
  if (service) objet = { source: service, source_id: album.source_id };
  else if (bandcamp) objet = { source: BANDCAMP_SVC, source_id: album.source_id ?? bandcamp, url: album.url ?? bandcamp };
  else return null;
  const ref = refFavoriDeVignette('album', objet, null);
  return favKeyOf(ref) ? ref : null;
}

export function favKeyOf(ref: Pick<StreamingRef, 'itemType' | 'service' | 'serviceId'> | null | undefined): string | null {
  if (!ref) return null;
  const id = identiteDeFavori((ref.serviceId ?? '').trim());
  const svc = (ref.service ?? '').trim();
  if (!id || !svc) return null;
  if (ref.itemType === 'track' && SERVICES_SANS_IDENTIFIANT_DE_PISTE.has(svc)) return null;
  return streamingFavKey(ref.itemType, svc, id);
}

/** L'objet est-il en favori, d'après le jeu de clés donné ? */
export function isStreamingFavorite(
  keys: ReadonlySet<string>,
  ref: Pick<StreamingRef, 'itemType' | 'service' | 'serviceId'> | null | undefined,
): boolean {
  const k = favKeyOf(ref);
  return k != null && keys.has(k);
}

/** Le type au pluriel qu'attend l'API du service (`track` → `tracks`). */
export function serviceFavType(t: StreamingItemType): ServiceFavType {
  return `${t}s` as ServiceFavType;
}

export type ServiceFavType = 'tracks' | 'albums' | 'artists' | 'playlists';

/** Une playlist en favori, telle que l'écran Favoris la rend — locale OU de
 *  service. Les deux vivent dans le même onglet et dans la même liste. */
export interface PlaylistFavorite {
  /** `playlists.id` pour une locale ; `null` pour une playlist de service, qui
   *  n'existe pas dans notre base et n'a donc aucun identifiant entier. */
  id: number | null;
  name: string;
  track_count?: number;
  cover_path?: string | null;
  /** `local`, `qobuz`, `tidal`… Lu par la pastille de source et par le filtre. */
  source: string;
  /** Identifiant chez le service ; absent pour une playlist locale. */
  source_id?: string;
  /**
   * Date de la mise en favori — la clé du tri « date d'ajout » (#2001).
   *
   * Deux noms parce que deux origines, exactement comme pour les quatre autres
   * onglets : `favorite_added_at` pour une playlist LOCALE (le `created_at` de
   * la ligne de favori, reporté par `getFavorites`), `created_at` pour une
   * playlist de SERVICE, qui arrive telle quelle. `dateDeTri` lit l'un puis
   * l'autre ; les fondre en un seul champ ici ferait perdre au lecteur
   * l'origine de la valeur, et rien ne l'imposerait au tri.
   *
   * Absentes toutes deux pour une playlist prise chez le service : Tune ne sait
   * pas quand elle y a été mise en favori. `trier` la renvoie en fin de liste.
   */
  favorite_added_at?: string | null;
  created_at?: string | null;
  /**
   * Date de PREMIÈRE VUE par Tune (#1060), jamais réécrite par une
   * resynchronisation. Absente d'un serveur d'avant le lot
   * `batch/favoris-date-locale-20260920` ; `dateDe` retombe alors sur
   * `created_at`.
   */
  first_seen_at?: string | null;
}

/** Forme minimale d'une ligne de `streaming_favorites`, tous types confondus. */
interface FavoriDeService {
  item_type: string;
  service: string;
  service_id: string;
  title?: string | null;
  cover_url?: string | null;
  /** #2715 : la date manquait à cette forme étroite. `StreamingFavorite` la
   *  déclare depuis #2001 et le serveur la rend — elle se perdait au passage
   *  de type, avant même d'atteindre la fusion. */
  created_at?: string | null;
  /** #1060 : la date locale, même chemin et même piège que ci-dessus. */
  first_seen_at?: string | null;
}

/**
 * Les playlists en favori d'un profil : les locales ET celles des services.
 *
 * #2370. L'onglet Playlists ne lisait que `local.playlists`. Une playlist
 * Qobuz mise en favori était donc bien écrite dans `streaming_favorites` —
 * la route `/profiles/{id}/favorites/streaming/add` ne valide pas
 * `item_type` — mais AUCUN écran ne la relisait. C'est le piège que le ticket
 * nomme explicitement : « ajouter le type en écriture seule laisserait un
 * favori qu'aucun écran ne peut relire ».
 *
 * Une entrée sans service ou sans identifiant est écartée : la ligne
 * s'afficherait, et ne s'ouvrirait sur rien.
 *
 * ⚠️ Cette fonction RECOPIE champ par champ, elle ne propage pas l'objet
 * d'entrée. Tout champ oublié ici est silencieusement perdu : c'est ainsi que
 * la date d'ajout a disparu des deux côtés à la fois (#2715), rendant le tri
 * « date d'ajout » inerte sur le seul onglet Playlists — sans erreur, sans
 * valeur fausse, donc sans rien pour l'annoncer.
 */
export function fusionnerPlaylistsFavorites(
  locales: ReadonlyArray<{
    id: number | null;
    name: string;
    track_count?: number;
    favorite_added_at?: string | null;
  }>,
  streaming: ReadonlyArray<FavoriDeService>,
): PlaylistFavorite[] {
  const out: PlaylistFavorite[] = locales.map((p) => ({
    id: p.id,
    name: p.name,
    track_count: p.track_count,
    source: 'local',
    favorite_added_at: p.favorite_added_at ?? null,
  }));

  // Deux services numérotent leurs playlists chacun de leur côté : la clé de
  // dédoublonnage porte le service, sinon `qobuz:77` cacherait `tidal:77`.
  const vus = new Set<string>();
  for (const f of streaming) {
    if (f.item_type !== 'playlist') continue;
    const service = (f.service ?? '').trim();
    const serviceId = (f.service_id ?? '').trim();
    if (!service || !serviceId) continue;
    const cle = `${service}:${serviceId}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push({
      id: null,
      name: f.title ?? '',
      cover_path: f.cover_url ?? null,
      source: service,
      source_id: serviceId,
      created_at: f.created_at ?? null,
      first_seen_at: f.first_seen_at ?? null,
    });
  }
  return out;
}

/**
 * Bascule le favori d'un objet de service.
 *
 * Met à jour le magasin d'abord — le cœur doit répondre au doigt, pas au
 * réseau — puis écrit côté profil, et **revient en arrière si cet appel
 * échoue**. La recopie vers les favoris propres du service (Qobuz, Tidal) est
 * au mieux : un service sans API de favoris (YouTube) ou une panne passagère
 * ne doit pas défaire le cœur de Tune.
 *
 * Renvoie le nouvel état, ou `null` si rien n'a pu être fait.
 */
export async function toggleStreamingFavorite(ref: StreamingRef): Promise<boolean | null> {
  const key = favKeyOf(ref);
  if (!key) return null;

  let pid = get(currentProfileId);
  if (!pid) {
    // Aucun profil chargé : `loadProfiles` en crée un par défaut, sinon le
    // cœur serait un bouton sans effet et sans message (Elie).
    try { await loadProfiles(); } catch { /* le test ci-dessous tranche */ }
    pid = get(currentProfileId);
  }
  if (!pid) return null;

  const wasFav = get(favoriteStreamingKeys).has(key);
  favoriteStreamingKeys.update((s) => { wasFav ? s.delete(key) : s.add(key); return s; });

  try {
    if (wasFav) {
      await api.removeProfileStreamingFavorite(pid, {
        item_type: ref.itemType,
        service: ref.service,
        service_id: ref.serviceId,
      });
    } else {
      await api.addProfileStreamingFavorite(pid, {
        item_type: ref.itemType,
        service: ref.service,
        service_id: ref.serviceId,
        title: ref.title,
        artist: ref.artist,
        album: ref.album,
        cover_url: ref.coverUrl,
      });
    }
  } catch (e) {
    favoriteStreamingKeys.update((s) => { wasFav ? s.add(key) : s.delete(key); return s; });
    console.error('Toggle streaming favorite error:', e);
    return wasFav;
  }

  // 🔴 #4577 point 3 — on n'écrit plus chez un service qui a DIT qu'il
  // refuserait. Le cœur de Tune, lui, vient d'être posé : il vit dans
  // `streaming_favorites`, pas chez le service.
  if (favorisRecopiablesVers(ref.service)) {
    const svcType = serviceFavType(ref.itemType);
    const recopie = wasFav
      ? api.removeStreamingFavorite(ref.service, svcType, ref.serviceId)
      : api.addStreamingFavorite(ref.service, svcType, ref.serviceId);
    recopie.catch((e) => signalerRecopieManquee(ref.service, e));
  }
  return !wasFav;
}

/**
 * Ce service accepte-t-il qu'on écrive ses favoris ? — `tune-server-rust#4577`.
 *
 * Le serveur le DIT depuis la v0.9.159 : `GET /api/v1/streaming/services`
 * porte `favoris_ecrivables` par service (`registry.rs::status_all`), et
 * Bandcamp y répond `false` — « ajouter un favori demande une session d'achat,
 * que Tune n'a pas ; la liste de souhaits se modifie sur bandcamp.com ». Le
 * client ne lisait pas ce champ : dans le journal de FabienM (0.9.158, fil
 * 1862), **seize** `POST`/`DELETE` sont partis vers
 * `/streaming/bandcamp/favorites/…` pour y récolter seize 501, dont huit
 * `DELETE` en dix secondes — quelqu'un qui reclique parce que rien ne se passe.
 *
 * 🔴 **L'absence n'est pas un refus.** Un serveur d'avant la v0.9.159 ne
 * publie pas le champ, et un magasin pas encore rempli ne publie rien du tout :
 * les deux valent `true`, c'est-à-dire le comportement d'avant. Répondre
 * `false` sur un silence couperait la recopie chez Qobuz et Tidal, là où elle
 * fonctionne, dès qu'un client neuf parlerait à un serveur ancien.
 *
 * ⚠️ Ce n'est PAS la question du 501 : `signalerRecopieManquee` l'ignore déjà
 * et le cœur de Tune tient. Ce qu'on retire ici, c'est l'appel lui-même —
 * un aller-retour par clic dont on sait d'avance qu'il échouera.
 */
export function favorisRecopiablesVers(service: string | null | undefined): boolean {
  const nom = (service ?? '').trim();
  if (!nom) return true;
  return get(streamingServices)[nom]?.favoris_ecrivables !== false;
}

/**
 * #1070 — la recopie vers le service ne se tait plus.
 *
 * Elle était avalée (`.catch(() => {})`) : quand Qobuz refusait, le cœur de
 * Tune et les favoris du service divergeaient sans un mot. Le cœur de Tune
 * reste posé (il vit dans sa propre table, la règle ci-dessus tient), mais
 * l'utilisateur apprend que le service n'a pas suivi, avec le motif du
 * serveur. Un 501 n'est pas un échec : le service n'a pas d'API de favoris
 * (YouTube), il n'y avait rien à recopier.
 */
export function signalerRecopieManquee(service: string, e: unknown): void {
  const status = (e as { status?: number } | null)?.status;
  if (status === 501) return;
  const motif = e instanceof Error && e.message ? e.message : String(e ?? '');
  notifications.error(
    get(t)('favorites.serviceSyncFailed').replace('{service}', service).replace('{motif}', motif),
  );
}

/**
 * Le cœur d'un objet de service, prêt pour `favoriExterne` de `PochetteActions`.
 *
 * Les vignettes de service — Qobuz, Tidal, et tout ce qui suit — n'avaient ni
 * cœur ni étiquettes : les deux s'adossaient à un identifiant de la
 * bibliothèque, qu'un album distant n'a pas. C'était vrai des étiquettes, ça ne
 * l'était PAS du favori, qui a sa propre table (`streaming_favorites`, clef
 * `service` + `service_id` en TEXTE). Bertrand, 03/09/2026 : « il manque des
 * boutons sur les covers Qobuz […] et de mise en favoris ! sur la homepage
 * […] idem Tidal ».
 *
 * `null` quand l'objet n'est pas identifiable — pas de cœur plutôt qu'un cœur
 * qui cocherait tous ses semblables, la garde déjà posée par `favKeyOf`.
 */
export function favoriExterneService(
  keys: ReadonlySet<string>,
  ref: StreamingRef | null | undefined,
): { actif: boolean; basculer: () => Promise<void> } | null {
  if (!ref || !favKeyOf(ref)) return null;
  return {
    actif: isStreamingFavorite(keys, ref),
    basculer: async () => {
      await toggleStreamingFavorite(ref);
    },
  };
}
