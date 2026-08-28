/**
 * Lire la bibliothèque d'un AUTRE serveur Tune comme la sienne.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * L'écran « Serveurs multimédia » parcourait les serveurs distants en UPnP.
 * Le protocole marche, mais il ne transporte presque rien : un conteneur
 * DIDL-Lite donne un titre, un artiste, un nombre d'enfants et une pochette.
 * Ni année, ni fréquence, ni profondeur, ni format. Une vue « iso
 * bibliothèque » y est donc IMPOSSIBLE : la frise n'aurait aucune année à
 * tracer et les filtres Qualité / Fréquence / Format / Profondeur n'auraient
 * rien à filtrer.
 *
 * Mais un serveur Tune n'est pas qu'un serveur UPnP : c'est aussi une API REST
 * complète, sur le même hôte et le même port. Mesuré le 28/08 sur 192.168.1.18 :
 *
 *   GET /api/v1/library/albums        -> `access-control-allow-origin: *`,
 *                                        et la charge utile est EXACTEMENT la
 *                                        forme `Album` que consomme déjà la
 *                                        Bibliothèque locale (year, sample_rate,
 *                                        bit_depth, format, quality, added_at…)
 *   GET /api/v1/library/albums/{id}/tracks  -> pistes complètes
 *   GET /api/v1/library/tracks/{id}/audio   -> le flux ; c'est d'ailleurs
 *                                        l'URL exacte que l'UPnP annonce en
 *                                        `res_url`, donc un chemin de lecture
 *                                        DÉJÀ éprouvé par cet écran.
 *
 * D'où la règle de cet écran : le CATALOGUE vient du REST distant (métadonnées
 * riches), la LECTURE passe par l'URL de flux distante jouée en `source: upnp`
 * par le serveur local. Les serveurs tiers, eux, gardent l'explorateur UPnP :
 * on ne peut pas leur inventer des métadonnées qu'ils n'émettent pas.
 */
import type { Album, MediaServer, Track } from './types';

export interface DepotDistant {
  /** Racine de l'API du serveur distant, sans barre finale. */
  base: string;
  nom: string;
  hote: string;
}

export function depotDistant(s: MediaServer): DepotDistant {
  return {
    base: `http://${s.host}:${s.port}/api/v1`,
    nom: s.name,
    hote: `${s.host}:${s.port}`,
  };
}

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

/** Le serveur rend soit un tableau, soit `{items}` — comme l'API locale. */
function lot<T>(brut: any): T[] {
  return Array.isArray(brut) ? brut : (brut?.items ?? []);
}

/**
 * L'URL absolue d'une pochette distante.
 *
 * `AlbumArt` fait passer toute URL `http://` par le proxy d'artwork du serveur
 * LOCAL. C'est ce qu'on veut : on n'a rien à modifier dans `AlbumArt`, et le
 * chemin est le même que pour les pochettes de streaming.
 */
export function pochetteDistante(d: DepotDistant, cover: string | null | undefined): string | null {
  if (!cover) return null;
  if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
  const nom = cover.split('/').pop() ?? cover;
  return `${d.base}/library/artwork/${encodeURIComponent(nom)}`;
}

/** L'URL de flux d'une piste distante — la même que le `res_url` UPnP. */
export function audioDistant(d: DepotDistant, trackId: number): string {
  return `${d.base}/library/tracks/${trackId}/audio`;
}

/**
 * Normalise un album distant pour que la Bibliothèque n'ait RIEN à savoir de
 * son origine : la pochette devient absolue, et c'est tout — le reste de la
 * charge utile a déjà la bonne forme.
 */
function normaliserAlbum(d: DepotDistant, a: any): Album {
  return { ...a, cover_path: pochetteDistante(d, a?.cover_path) } as Album;
}

/**
 * Tous les albums du serveur distant, par lots.
 *
 * `onLot` reçoit le premier paquet dès son arrivée : sur une discothèque de
 * plusieurs milliers d'albums, attendre le tout ferait un écran vide pendant
 * plusieurs secondes alors que la première page suffit à commencer à lire.
 */
export async function albumsDistants(
  d: DepotDistant,
  onLot?: (partiel: Album[]) => void,
  signal?: AbortSignal,
  taille = 1000,
): Promise<Album[]> {
  const tout: Album[] = [];
  let offset = 0;
  for (;;) {
    const brut = await json<any>(
      `${d.base}/library/albums?limit=${taille}&offset=${offset}&sort=title&order=asc`, signal);
    const paquet = lot<any>(brut).map((a) => normaliserAlbum(d, a));
    tout.push(...paquet);
    onLot?.([...tout]);
    if (paquet.length < taille) break;
    offset += taille;
  }
  return tout;
}

/** Les pistes du serveur distant. Plafonné : l'onglet « Titres » n'en affiche
 *  que les premières centaines, et rapatrier 100 000 lignes pour en montrer
 *  500 serait payer le réseau pour rien. */
export async function pistesDistantes(d: DepotDistant, max = 2000, signal?: AbortSignal): Promise<Track[]> {
  const brut = await json<any>(`${d.base}/library/tracks?limit=${max}&offset=0`, signal);
  return lot<Track>(brut).map((t) => ({ ...t, cover_path: pochetteDistante(d, (t as any).cover_path) }));
}

export async function pistesAlbumDistant(d: DepotDistant, albumId: number, signal?: AbortSignal): Promise<Track[]> {
  const brut = await json<any>(`${d.base}/library/albums/${albumId}/tracks`, signal);
  return lot<Track>(brut).map((t) => ({ ...t, cover_path: pochetteDistante(d, (t as any).cover_path) }));
}

/**
 * Le corps à passer à `api.play` / `api.addToQueue` du serveur LOCAL pour lire
 * une piste distante.
 *
 * `source: 'upnp'` et `source_id` = l'URL de flux : c'est le chemin qu'emprunte
 * déjà la lecture depuis l'explorateur UPnP de cet écran. On joint les
 * métadonnées pour que la barre de transport affiche autre chose qu'une URL.
 */
export function corpsLecture(d: DepotDistant, t: Track): Record<string, unknown> {
  const b: Record<string, unknown> = { source: 'upnp', source_id: audioDistant(d, t.id as number) };
  if (t.title) b.title = t.title;
  if (t.artist_name) b.artist_name = t.artist_name;
  if ((t as any).album_title) b.album_title = (t as any).album_title;
  if ((t as any).cover_path) b.cover_path = (t as any).cover_path;
  if (t.duration_ms) b.duration_ms = t.duration_ms;
  return b;
}
