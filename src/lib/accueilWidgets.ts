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
}

const LIMITE = 20;

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
function versElement(o: any, i: number, prefixe: string): Element {
  const id =
    champ(o, 'id', 'album_id', 'track_id', 'source_id', 'feed_url', 'uri') ?? `${prefixe}${i}`;
  return {
    id: `${prefixe}${id}`,
    titre: champ(o, 'title', 'name', 'album_title', 'album') ?? '—',
    sous: champ(o, 'artist_name', 'artist', 'author', 'artistName', 'station'),
    cover: champ(o, 'cover_path', 'cover_url', 'image_url', 'image_path', 'logo_url') ?? null,
    jouer: o?.album_id != null || (o?.id != null && prefixe.startsWith('alb'))
      ? (z: number) => api.play(z, { album_id: o.album_id ?? o.id })
      : o?.track_id != null
        ? (z: number) => api.play(z, { track_id: o.track_id })
        : undefined,
  };
}

const liste = (r: any): any[] =>
  Array.isArray(r) ? r : (r?.items ?? r?.albums ?? r?.tracks ?? r?.results ?? []);

export const WIDGETS: Widget[] = [
  {
    id: 'zones',
    cleTitre: 'v2.home.wZones',
    forme: 'bande',
    charger: async () =>
      liste(await api.getNowListening()).map((z: any, i: number) => ({
        id: `zone${z?.zone_id ?? z?.id ?? i}`,
        titre: champ(z, 'title', 'track_title') ?? champ(z, 'zone_name', 'name') ?? '—',
        sous: champ(z, 'artist_name', 'artist') ?? champ(z, 'zone_name', 'name'),
        cover: champ(z, 'cover_path', 'cover_url') ?? null,
      })),
  },
  {
    id: 'reprendre',
    cleTitre: 'v2.home.wResume',
    forme: 'bande',
    charger: async () =>
      liste(await api.getContinueListening(LIMITE)).map((o, i) => versElement(o, i, 'rep')),
  },
  {
    id: 'recemment-ajoutes',
    cleTitre: 'v2.home.wRecentlyAdded',
    forme: 'bande',
    charger: async () =>
      liste(await api.getRecentAlbums(LIMITE)).map((o, i) => versElement(o, i, 'alb')),
  },
  {
    id: 'recemment-ecoutes',
    cleTitre: 'v2.home.wRecentlyPlayed',
    forme: 'bande',
    charger: async () =>
      liste(await api.getPlaybackHistory(LIMITE)).map((o, i) => versElement(o, i, 'hist')),
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
      return tire.map((o, i) => versElement(o, i, 'alb'));
    },
  },
  {
    id: 'nouveautes-artistes',
    cleTitre: 'v2.home.wArtistReleases',
    forme: 'bande',
    charger: async () =>
      liste(await api.getArtistReleases(LIMITE)).map((o, i) => versElement(o, i, 'nar')),
  },
  {
    id: 'nouveau-bibliotheque',
    cleTitre: 'v2.home.wNewInLibrary',
    forme: 'bande',
    charger: async () =>
      liste(await api.getNewInLibrary()).slice(0, LIMITE).map((o, i) => versElement(o, i, 'alb')),
  },
  {
    id: 'autres-versions',
    cleTitre: 'v2.home.wOtherVersions',
    forme: 'bande',
    charger: async () =>
      liste(await api.getOtherVersions(LIMITE)).map((o, i) => versElement(o, i, 'ver')),
  },
  {
    id: 'favoris',
    cleTitre: 'v2.home.wFavorites',
    forme: 'bande',
    charger: async (ctx) => {
      if (ctx.profileId == null) return [];
      const f = await api.getFavorites(ctx.profileId);
      return (f?.albums ?? []).slice(0, LIMITE).map((o: any, i: number) => versElement(o, i, 'alb'));
    },
  },
  {
    id: 'recommandations',
    cleTitre: 'v2.home.wRecommendations',
    forme: 'bande',
    charger: async () =>
      liste(await api.getHomeRecommendations()).slice(0, LIMITE).map((o, i) => versElement(o, i, 'rec')),
  },
  {
    id: 'radios-artistes',
    cleTitre: 'v2.home.wArtistRadios',
    forme: 'bande',
    charger: async () =>
      liste(await api.getRadioPicks()).slice(0, LIMITE).map((o, i) => versElement(o, i, 'rad')),
  },
  {
    id: 'podcasts-abonnements',
    cleTitre: 'v2.home.wPodcasts',
    forme: 'bande',
    charger: async () =>
      liste(await api.getPodcastSubscriptions()).slice(0, LIMITE).map((o, i) => versElement(o, i, 'pod')),
  },
  {
    id: 'qobuz-selection',
    cleTitre: 'v2.home.wQobuz',
    forme: 'bande',
    charger: async () =>
      liste(await api.getStreamingFeaturedPlaylists('qobuz')).slice(0, LIMITE).map((o, i) => versElement(o, i, 'qob')),
  },
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
