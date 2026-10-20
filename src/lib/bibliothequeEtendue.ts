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
import type { Album, Source } from './types';

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

const CLE_BASCULE = 'tune.bibliotheque.etendue';

/** La bascule, retenue sur cet appareil. Éteinte par défaut. */
export function lireBasculeEtendue(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLE_BASCULE) === '1';
  } catch {
    return false;
  }
}

export function ecrireBasculeEtendue(v: boolean): void {
  try {
    globalThis.localStorage?.setItem(CLE_BASCULE, v ? '1' : '0');
  } catch {
    /* stockage refusé : la bascule vaut pour la session */
  }
}
