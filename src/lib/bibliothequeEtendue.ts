/**
 * tune-server-rust#6482 (DidLyon, fils forum 2320 et 2321) — « une gestion de
 * bibliothèque qui adresse tant les fichiers locaux que les distants ».
 *
 * Périmètre rc7 (note de conception de l'issue) : dans Bibliothèque › Albums,
 * une bascule « Bibliothèque + favoris » ajoute à la grille les albums FAVORIS
 * des services (Qobuz, Tidal…), avec leur pastille de provenance. Ils passent
 * par la même recherche, le même tri et le même menu « Source » que les albums
 * locaux ; une carte ouvre la fiche de l'album du service.
 *
 * Les favoris de service sont le MIROIR du service (décision du 08/10) : ce
 * que l'écran montre est ce que le service tient en favori, rien de plus.
 *
 * Un album de service n'a pas d'`id` de bibliothèque : `id: null`, et sa
 * provenance est la paire `source` + `source_id`, comme partout ailleurs
 * (`cleDetailAlbum`, `objetAlbum`). La clé de carte n'est donc plus `a.id`
 * seul — deux albums de service la partageraient (`null`).
 */
import { get, writable } from 'svelte/store';
import * as api from './api';
import type { Album, Artist, Source, Track } from './types';

/** Ce que rend `GET /profiles/{id}/favorites/streaming?item_type=album`. */
export interface FavoriAlbumDeService {
  item_type: string;
  service: string;
  service_id: string;
  title?: string | null;
  artist?: string | null;
  cover_url?: string | null;
  created_at?: string | null;
  first_seen_at?: string | null;
}

/** Les sources qui ne sont PAS un service : leurs albums sont déjà dans la bibliothèque. */
const SOURCES_DE_BIBLIOTHEQUE = new Set(['local', 'upnp']);

function secondes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * Les albums favoris des services, en forme d'`Album` de grille. Dédoublonnés
 * par paire service + identifiant ; la date d'ajout est celle où TUNE a vu le
 * favori (`first_seen_at`), à défaut celle du service (web#1060).
 */
export function albumsDesFavorisDeService(favoris: readonly FavoriAlbumDeService[] | null | undefined): Album[] {
  const vus = new Set<string>();
  const albums: Album[] = [];
  for (const f of favoris ?? []) {
    if (f?.item_type !== 'album') continue;
    const service = (f.service ?? '').trim();
    const sid = (f.service_id ?? '').trim();
    if (!service || !sid || SOURCES_DE_BIBLIOTHEQUE.has(service)) continue;
    const cle = `${service}:${sid}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    albums.push({
      id: null,
      title: f.title ?? '',
      artist_name: f.artist ?? null,
      cover_path: f.cover_url ?? null,
      source: service as Source,
      source_id: sid,
      added_at: secondes(f.first_seen_at) ?? secondes(f.created_at),
    });
  }
  return albums;
}

/** Un album de SERVICE ajouté par la bascule (pas un album de bibliothèque). */
export function estAlbumDeServiceEtendu(a: Pick<Album, 'id' | 'source' | 'source_id'>): boolean {
  const s = (a.source ?? '').trim();
  return a.id == null && !!s && !SOURCES_DE_BIBLIOTHEQUE.has(s) && !!(a.source_id ?? '').toString().trim();
}

/** La clé de carte : l'`id` d'un album de bibliothèque, la paire d'un album de service. */
export function cleCarteAlbum(a: Pick<Album, 'id' | 'source' | 'source_id' | 'title'>): string | number {
  if (a.id != null) return a.id;
  return `svc:${a.source ?? ''}:${a.source_id ?? a.title ?? ''}`;
}

/** La grille : la bibliothèque, puis les favoris de service si la bascule est mise. */
export function albumsEtendus(bibliotheque: readonly Album[], favoris: readonly Album[], etendue: boolean): Album[] {
  return etendue && favoris.length ? [...bibliotheque, ...favoris] : (bibliotheque as Album[]);
}

/**
 * tune-server-rust#7780 (fil 2635) — le bouton « Bibliothèque + favoris »
 * devient le réglage « Bibliothèque élargie aux favoris des services » de
 * Paramètres › Bibliothèque, tenu par le serveur pour chaque profil et
 * ACTIVÉ par défaut. Un serveur qui ne connaît pas encore le réglage (route
 * absente) ou injoignable laisse la valeur par défaut.
 */
export const bibliothequeEtendueActive = writable<boolean>(true);
/** Le réglage a été lu (ou le serveur n'en sait rien) : la Bibliothèque attend ce moment pour ne pas demander des favoris qu'elle n'affichera pas. */
export const reglageEtendueLu = writable<boolean>(false);

export async function chargerReglageEtendue(profileId: number): Promise<boolean> {
  let actif = true;
  try {
    actif = (await api.getBibliothequeEtendue(profileId))?.enabled !== false;
  } catch {
    /* serveur ancien : la valeur par défaut tient */
  }
  bibliothequeEtendueActive.set(actif);
  reglageEtendueLu.set(true);
  return actif;
}

/** Écrit le réglage ; rend la valeur d'avant si le serveur refuse. */
export async function changerReglageEtendue(profileId: number, actif: boolean): Promise<void> {
  const avant = get(bibliothequeEtendueActive);
  bibliothequeEtendueActive.set(actif);
  try {
    const r = await api.setBibliothequeEtendue(profileId, actif);
    bibliothequeEtendueActive.set(r?.enabled ?? actif);
  } catch (e) {
    bibliothequeEtendueActive.set(avant);
    throw e;
  }
}

/**
 * Fil 3009, point 6 (FabienM, rc13) — « Menu bibliothèque : onglets Titres et
 * Artistes : la source Qobuz est absente (alors que j'ai des titres et
 * artistes favoris Qobuz). Le paramètre "Bibliothèque élargie aux favoris des
 * services" est activé. »
 *
 * Le réglage n'élargissait que l'onglet ALBUMS (#6482, #7780). Les onglets
 * Titres et Artistes reçoivent désormais, de la même façon, les titres et les
 * artistes favoris des services (`GET /profiles/{id}/favorites/streaming?
 * item_type=track|artist&pour=bibliotheque`), chacun sous sa provenance : le
 * menu « Source » les propose, et choisir le service les montre.
 */
export interface FavoriDeService {
  item_type: string;
  service: string;
  service_id: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  album_id_service?: string | null;
  cover_url?: string | null;
}

/** La paire service + identifiant d'un favori de service, ou `null`. */
function paireDeService(f: FavoriDeService | null | undefined, type: string): { service: string; sid: string } | null {
  if (f?.item_type !== type) return null;
  const service = (f.service ?? '').trim();
  const sid = String(f.service_id ?? '').trim();
  if (!service || !sid || SOURCES_DE_BIBLIOTHEQUE.has(service)) return null;
  return { service, sid };
}

/** Les TITRES favoris des services, en forme de `Track`, dédoublonnés par paire. */
export function pistesDesFavorisDeService(favoris: readonly FavoriDeService[] | null | undefined): Track[] {
  const vus = new Set<string>();
  const pistes: Track[] = [];
  for (const f of favoris ?? []) {
    const p = paireDeService(f, 'track');
    if (!p || vus.has(`${p.service}:${p.sid}`)) continue;
    vus.add(`${p.service}:${p.sid}`);
    pistes.push({
      id: null,
      title: f.title ?? '',
      artist_name: f.artist ?? null,
      album_title: f.album ?? null,
      cover_path: f.cover_url ?? null,
      source: p.service as Source,
      source_id: p.sid,
      album_id_service: (f.album_id_service ?? '').toString().trim() || null,
    } as Track);
  }
  return pistes;
}

/** Un artiste favori d'un service : pas d'`id` de bibliothèque, sa paire service + identifiant. */
export type ArtisteDeService = Artist & { source: string; source_id: string };

/** Les ARTISTES favoris des services, dédoublonnés par paire. */
export function artistesDesFavorisDeService(favoris: readonly FavoriDeService[] | null | undefined): ArtisteDeService[] {
  const vus = new Set<string>();
  const artistes: ArtisteDeService[] = [];
  for (const f of favoris ?? []) {
    const p = paireDeService(f, 'artist');
    if (!p || vus.has(`${p.service}:${p.sid}`)) continue;
    vus.add(`${p.service}:${p.sid}`);
    artistes.push({ id: null, name: (f.title ?? f.artist ?? '').trim(), image_path: f.cover_url ?? null, source: p.service, source_id: p.sid } as ArtisteDeService);
  }
  return artistes;
}

/** La source choisie désigne-t-elle un SERVICE (et non la bibliothèque) ? */
export function estSourceDeService(source: string | null | undefined): boolean {
  const s = (source ?? '').trim();
  return !!s && !SOURCES_DE_BIBLIOTHEQUE.has(s) && !s.startsWith('upnp:');
}

/** Ajoute aux comptes du menu « Source » ceux des favoris de service (chacun sous son service). */
export function comptesAvecFavoris(
  comptes: ReadonlyMap<string, number>,
  favoris: readonly { source?: string | null }[],
): Map<string, number> {
  const out = new Map(comptes);
  for (const f of favoris) {
    const s = (f.source ?? '').trim();
    if (!estSourceDeService(s)) continue;
    out.set(s, (out.get(s) ?? 0) + 1);
  }
  return out;
}

/* ── Fil 3009, point 6, suite (décision de Bertrand du 23/11) ─────────────
 * Les favoris des services s'affichent AUSSI sous « Toutes les sources »,
 * dans Titres et dans Artistes, comme dans l'onglet Albums — SANS DOUBLON :
 * un titre ou un artiste déjà présent dans la bibliothèque, ou déjà apporté
 * par un autre service, n'apparaît qu'une fois. La bibliothèque l'emporte,
 * puis le premier service rencontré. L'onglet Albums n'avait pas de règle de
 * dédoublonnage à reprendre (`albumsEtendus` concatène) : celle-ci compare
 * le titre et l'interprète (artiste : le nom), sans casse, accents ni
 * espaces superflus. */

/** Un texte comparable : sans casse, accents ni espaces superflus. */
export function plierTexte(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** La clé « même titre » : titre et interprète pliés. */
export function cleDeTitre(t: { title?: string | null; artist_name?: string | null }): string {
  return `${plierTexte(t.title)}|${plierTexte(t.artist_name)}`;
}

/** Les titres favoris qui n'existent ni dans `locaux`, ni plus tôt dans la liste (autre service). */
export function titresSansDoublon<T extends { title?: string | null; artist_name?: string | null }>(
  locaux: readonly { title?: string | null; artist_name?: string | null }[],
  favoris: readonly T[],
): T[] {
  const vus = new Set(locaux.map(cleDeTitre));
  return favoris.filter((f) => {
    const k = cleDeTitre(f);
    if (!plierTexte(f.title) || vus.has(k)) return false;
    vus.add(k);
    return true;
  });
}

/** Les artistes favoris qui n'existent ni dans `locaux`, ni plus tôt dans la liste (autre service). */
export function artistesSansDoublon<T extends { name?: string | null }>(
  locaux: readonly { name?: string | null }[],
  favoris: readonly T[],
): T[] {
  const vus = new Set(locaux.map((a) => plierTexte(a.name)));
  return favoris.filter((f) => {
    const k = plierTexte(f.name);
    if (!k || vus.has(k)) return false;
    vus.add(k);
    return true;
  });
}

/**
 * Onglet Titres PAGINÉ : la bibliothèque n'est pas en mémoire, seule sa
 * fenêtre l'est. Pour savoir si un titre favori y est déjà, on la demande au
 * serveur par une recherche sur son titre (`chercher`, sous la provenance
 * affichée : toute ligne de la bibliothèque qu'elle rend compte), au plus `concurrence`
 * à la fois, et chaque réponse est retenue dans `cache` (clé de titre →
 * présent) : la liste des favoris n'est chargée qu'une fois, la bibliothèque
 * jamais en entier. Une recherche qui échoue compte comme « présent » : on
 * préfère taire un favori que montrer un doublon.
 */
export async function titresAbsentsDeLaBibliotheque<T extends { title?: string | null; artist_name?: string | null }>(
  favoris: readonly T[],
  chercher: (titre: string) => Promise<readonly { id?: unknown; source?: unknown; title?: string | null; artist_name?: string | null }[]>,
  cache: Map<string, boolean>,
  concurrence = 4,
): Promise<T[]> {
  const uniques = titresSansDoublon([], favoris);
  const aVerifier = uniques.filter((f) => !cache.has(cleDeTitre(f)));
  let i = 0;
  const ouvrier = async () => {
    while (i < aVerifier.length) {
      const f = aVerifier[i++];
      const k = cleDeTitre(f);
      try {
        const trouves = await chercher(String(f.title ?? ''));
        cache.set(k, trouves.some((t) => t.id != null && cleDeTitre(t) === k));
      } catch {
        cache.set(k, true);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrence, aVerifier.length)) }, ouvrier));
  return uniques.filter((f) => cache.get(cleDeTitre(f)) === false);
}
