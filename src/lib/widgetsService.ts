/**
 * Le catalogue de widgets d'un service de streaming.
 *
 * Bertrand, 02/09/2026 : « je voudrais que les écrans éditorial Qobuz et Tidal
 * soient paramétrables avec des widgets Qobuz et Tidal ». Même mécanisme que
 * l'accueil — `PageWidgets` ne connaît que des identifiants et un catalogue.
 *
 * ## Pourquoi ce catalogue est CONSTRUIT, et non déclaré
 *
 * Les deux services n'offrent pas la même chose, et ce qu'ils offrent se
 * découvre à l'exécution. Mesuré sur le .18 le 02/09/2026 :
 *
 * ```text
 *                        Qobuz                    Tidal
 * featured/sections      7 sections × 50 albums   VIDE
 * featured (playlists)   500                      VIDE
 * new-releases           200                      50
 * genres                 13                       20
 * playlists (les vôtres) 283                      279
 * ```
 *
 * Déclarer en dur les sept sections de Qobuz pour Tidal aurait donné sept
 * bandes vides. Les genres, eux, ne sont connaissables qu'après un appel :
 * treize d'un côté, vingt de l'autre, avec des identifiants qui n'ont rien à
 * voir (`112` chez Qobuz, `Pop` chez Tidal).
 *
 * Le catalogue est donc demandé au service, une fois, à l'ouverture de
 * l'écran.
 */
import * as api from './api';
import type { Element, Widget } from './accueilWidgets';

/** Combien d'éléments par bande. Voir `accueilWidgets` : on ne borne pas. */
const LIMITE = 50;

const liste = (r: any): any[] =>
  Array.isArray(r) ? r : (r?.items ?? r?.albums ?? r?.playlists ?? r?.results ?? []);

const texte = (o: any, ...noms: string[]): string | undefined => {
  for (const n of noms) {
    const v = o?.[n];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
};

/** Écarte ce qui n'a rien à montrer — même garde que sur l'accueil. */
const utiles = (els: Element[]): Element[] => els.filter((e) => e.titre !== '—' || e.cover);

/**
 * Un album de service en `Element`.
 *
 * 🔴 `source` va TOUJOURS avec `streaming_album_id`. Le serveur n'apparie que
 * la paire ; un identifiant seul le fait retomber sur « reprendre la lecture
 * en cours ». C'est le défaut relevé sur les playlists Qobuz le 02/09/2026.
 *
 * 🔴 L'INDEX fait toujours partie de la clé : deux entrées de même identifiant
 * arrêteraient Svelte sur `each_key_duplicate`, et l'écran entier disparaît.
 */
function albumDistant(o: any, i: number, prefixe: string, service: string): Element {
  const sid = texte(o, 'source_id', 'id');
  const titre = texte(o, 'title', 'name') ?? '—';
  const cover = texte(o, 'cover_path', 'cover_url', 'image_url') ?? null;
  return {
    id: `${prefixe}${i}-${sid ?? ''}`,
    titre,
    sous: texte(o, 'artist_name', 'artist', 'owner'),
    cover,
    source: service,
    jouer: sid
      ? (z: number) => api.play(z, { streaming_album_id: sid, source: service as any })
      : undefined,
    ouvrir: sid ? 'album' : null,
    fiche: sid
      ? {
          id: null,
          source_id: sid,
          source: service,
          title: titre,
          artist_name: texte(o, 'artist_name', 'artist') ?? '',
          cover_path: cover,
          year: o?.year ?? null,
          format: o?.quality?.codec ?? o?.format ?? null,
          sample_rate: o?.quality?.sample_rate ?? o?.sample_rate ?? null,
          bit_depth: o?.quality?.bit_depth ?? o?.bit_depth ?? null,
        }
      : undefined,
  };
}

/** Une playlist de service en `Element`. Même exigence sur la paire. */
function playlistDistante(o: any, i: number, prefixe: string, service: string): Element {
  const sid = texte(o, 'source_id', 'id');
  return {
    id: `${prefixe}${i}-${sid ?? ''}`,
    titre: texte(o, 'name', 'title') ?? '—',
    sous: texte(o, 'owner', 'description'),
    cover: texte(o, 'cover_path', 'image_url') ?? null,
    source: service,
    jouer: sid
      ? (z: number) => api.play(z, { streaming_playlist_id: sid, source: service as any })
      : undefined,
  };
}

/** Le libellé d'un service, tel qu'il s'écrit. */
const nom = (s: string) => (s === 'qobuz' ? 'Qobuz' : s === 'tidal' ? 'Tidal' : s);

/**
 * Le catalogue d'un service, mesuré à l'ouverture.
 *
 * Les sections éditoriales et les genres sont demandés au service ; une
 * requête qui échoue ne rend rien plutôt que de faire échouer tout l'écran —
 * un service peut très bien servir ses nouveautés et pas ses genres.
 */
export async function catalogueService(service: string): Promise<Widget[]> {
  const [sections, genres] = await Promise.all([
    api.getStreamingFeaturedSections(service).catch(() => []),
    api.getStreamingGenres(service).catch(() => []),
  ]);

  const w: Widget[] = [];

  // Les nouveautés : les deux services les servent.
  w.push({
    id: `${service}-nouveautes`,
    cleTitre: 'v2.svc.wNew',
    forme: 'bande',
    charger: async () =>
      utiles(
        liste(await api.getStreamingNewReleases(service)).map((o, i) =>
          albumDistant(o, i, `${service}nv`, service),
        ),
      ),
  });

  // Les sections ÉDITORIALES, telles que le service les nomme. Aucune n'est
  // écrite en dur : Qobuz en rend sept, Tidal aucune, et la liste peut bouger
  // sans qu'on ait à toucher ce fichier.
  for (const s of liste(sections)) {
    const sid = texte(s, 'id');
    if (!sid) continue;
    w.push({
      id: `${service}-sec-${sid}`,
      // Le nom vient du SERVICE : pas de clé de traduction pour un libellé
      // qu'on ne connaît qu'à l'exécution. `PageWidgets` rend la clé telle
      // quelle quand elle n'en est pas une.
      cleTitre: texte(s, 'name') ?? sid,
      forme: 'bande',
      charger: async () =>
        utiles(
          liste(await api.getStreamingFeatured(service, sid, LIMITE)).map((o, i) =>
            albumDistant(o, i, `${service}${sid}`, service),
          ),
        ),
    });
  }

  // Les playlists mises en avant par le service.
  w.push({
    id: `${service}-playlists-editoriales`,
    cleTitre: 'v2.svc.wFeatured',
    forme: 'bande',
    charger: async () =>
      utiles(
        liste(await api.getStreamingFeaturedPlaylists(service))
          .slice(0, LIMITE)
          .map((o, i) => playlistDistante(o, i, `${service}fp`, service)),
      ),
  });

  // Les vôtres.
  w.push({
    id: `${service}-mes-playlists`,
    cleTitre: 'v2.svc.wMine',
    forme: 'bande',
    charger: async () =>
      utiles(
        liste(await api.getStreamingPlaylists(service))
          .slice(0, LIMITE)
          .map((o, i) => playlistDistante(o, i, `${service}mp`, service)),
      ),
  });

  // Un widget par GENRE. C'est ce qui rend l'écran Tidal digne d'être composé :
  // sans sections éditoriales, ses vingt genres sont sa matière.
  for (const g of liste(genres)) {
    const gid = texte(g, 'id');
    const label = texte(g, 'name');
    if (!gid || !label) continue;
    w.push({
      id: `${service}-genre-${gid}`,
      cleTitre: label,
      forme: 'bande',
      charger: async () =>
        utiles(
          liste(await api.getStreamingGenreAlbums(service, gid, LIMITE)).map((o, i) =>
            albumDistant(o, i, `${service}g${gid}`, service),
          ),
        ),
    });
  }

  return w;
}

/**
 * Ce qu'on montre à qui n'a rien encore choisi.
 *
 * Les nouveautés, puis les trois premières bandes que le service offre
 * réellement — sections éditoriales chez Qobuz, genres chez Tidal. On ne cite
 * aucun identifiant en dur : une disposition par défaut qui nommerait
 * `qobuz-sec-new-releases` serait vide sur Tidal.
 */
export function dispositionDefautService(catalogue: Widget[]): string[] {
  return catalogue.slice(0, 4).map((w) => w.id);
}

/** Clé de rangement de la disposition, une par service. */
export const cleService = (service: string) => `editorial_${service}_widgets`;

/** Libellé de l'écran, pour l'en-tête de `PageWidgets`. */
export const titreService = (service: string) => nom(service);
