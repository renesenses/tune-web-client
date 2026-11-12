/**
 * tune-server-rust#7617 — les versions d'un même album (remasters, Hi-Res ou
 * CD, éditions) regroupées sous UNE fiche, l'« œuvre ».
 *
 * Le serveur regroupe (groupe MusicBrainz, sinon artiste + titre sans
 * mentions d'édition) et nomme chaque version (étiquette VERSION, sinon la
 * mention retirée du titre). Ce module :
 * - lit les œuvres de plusieurs versions pour que la grille n'en montre
 *   qu'une carte (`regrouperAlbums`) ;
 * - lit l'œuvre d'un album pour le sélecteur de version de la fiche ;
 * - mémorise la version préférée.
 *
 * Un serveur qui ne connaît pas ces routes rend une erreur : on revient alors
 * à la grille d'avant, un album par carte, sans rien signaler.
 */
import { BASE, fetchJSON } from './api';
import { libelleNombreCanaux } from './utils';

/** Une œuvre de plusieurs versions, forme compacte (`/albums/works/members`). */
export interface MembresOeuvre {
  work_id: string;
  preferred_id: number;
  ids: number[];
}

/** Une version, telle que le sélecteur la montre. */
export interface VersionAlbum {
  id: number;
  title: string;
  version_name: string | null;
  year: number | null;
  original_year?: number | null;
  label: string | null;
  format: string | null;
  sample_rate: number | null;
  bit_depth: number | null;
  source: string;
  cover_path?: string | null;
  track_count?: number | null;
  /** tune-web-client#2731 — le plus grand nombre de canaux des pistes de la
   *  version ; absent d'un serveur antérieur ou quand il est inconnu. */
  max_channels?: number | null;
}

/** L'œuvre d'un album (`/albums/{id}/versions`). */
export interface OeuvreAlbum {
  enabled: boolean;
  album_id: number;
  work_id: string;
  method: 'musicbrainz' | 'artist_title' | 'single';
  count: number;
  preferred_id: number;
  versions: VersionAlbum[];
}

/** Les œuvres de plusieurs versions ; `[]` si le regroupement est désactivé
 *  ou si le serveur ne le connaît pas. */
export async function chargerMembresOeuvres(): Promise<MembresOeuvre[]> {
  try {
    const r = await fetchJSON<{ enabled?: boolean; works?: MembresOeuvre[] }>(
      `${BASE}/library/albums/works/members`, undefined, undefined, true,
    );
    return r?.enabled === false || !Array.isArray(r?.works) ? [] : r.works;
  } catch {
    return [];
  }
}

/** L'œuvre d'un album ; `null` si le serveur ne la connaît pas. */
export async function chargerOeuvreAlbum(albumId: number): Promise<OeuvreAlbum | null> {
  try {
    const r = await fetchJSON<OeuvreAlbum>(
      `${BASE}/library/albums/${albumId}/versions`, undefined, undefined, true,
    );
    return r && Array.isArray(r.versions) ? r : null;
  } catch {
    return null;
  }
}

/** Mémorise la version préférée d'une œuvre (`null` : revenir au défaut). */
export async function choisirVersionPreferee(workId: string, albumId: number | null): Promise<void> {
  await fetchJSON(`${BASE}/library/albums/works/preferred`, {
    method: 'PUT',
    body: JSON.stringify({ work_id: workId, album_id: albumId }),
  });
}

/**
 * Une carte par œuvre : des albums d'une œuvre présents dans la liste, on
 * garde la version préférée si elle y est, sinon le premier présent (un
 * filtre a pu l'écarter). La carte gardée reste à SA place dans l'ordre
 * reçu : le tri de la grille vaut pour l'album qu'elle montre. Les autres
 * versions disparaissent de la liste.
 *
 * `versions` : pour chaque album gardé d'une œuvre, son nombre de versions
 * dans la bibliothèque — ce qu'affiche le badge « N versions ».
 *
 * `canaux` (#2731) : pour chaque album gardé d'une œuvre, les nombres de
 * canaux connus de ses versions présentes — une carte qui regroupe l'édition
 * stéréo et la multicanale dit « 2.0/5.1 », pas seulement le maximum.
 */
export function regrouperAlbums<A extends { id?: number | null; max_channels?: number | null }>(
  albums: A[],
  membres: MembresOeuvre[],
): { albums: A[]; versions: Map<number, number>; canaux: Map<number, number[]> } {
  const versions = new Map<number, number>();
  const canaux = new Map<number, number[]>();
  if (!membres.length) return { albums, versions, canaux };
  const oeuvreDe = new Map<number, MembresOeuvre>();
  for (const m of membres) for (const id of m.ids) oeuvreDe.set(id, m);
  const presents = new Set<number>();
  for (const a of albums) if (a.id != null) presents.add(a.id);
  const garde = new Map<string, number>();
  for (const a of albums) {
    if (a.id == null) continue;
    const m = oeuvreDe.get(a.id);
    if (!m || garde.has(m.work_id)) continue;
    garde.set(m.work_id, presents.has(m.preferred_id) ? m.preferred_id : a.id);
  }
  // #2690 — la carte porte le canal MAXIMUM de toutes les versions présentes :
  // sans lui, une œuvre stéréo (préférée) + 5.1 sortait du filtre Multicanal.
  const canauxMax = new Map<string, number>();
  const canauxDe = new Map<string, number[]>();
  for (const a of albums) {
    const m = a.id == null ? undefined : oeuvreDe.get(a.id);
    if (!m || a.max_channels == null) continue;
    canauxMax.set(m.work_id, Math.max(canauxMax.get(m.work_id) ?? 0, Number(a.max_channels)));
    canauxDe.set(m.work_id, [...(canauxDe.get(m.work_id) ?? []), Number(a.max_channels)]);
  }
  const sortie: A[] = [];
  for (const a of albums) {
    if (a.id == null) { sortie.push(a); continue; }
    const m = oeuvreDe.get(a.id);
    if (!m) { sortie.push(a); continue; }
    if (garde.get(m.work_id) !== a.id) continue;
    versions.set(a.id, m.ids.length);
    const c = canauxDe.get(m.work_id);
    if (c) canaux.set(a.id, c);
    const max = canauxMax.get(m.work_id);
    sortie.push(max != null && max !== a.max_channels ? { ...a, max_channels: max } : a);
  }
  return { albums: sortie, versions, canaux };
}

/** La résolution lisible : « 24/96 », « 16/44.1 », ou rien. */
export function resolution(v: Pick<VersionAlbum, 'sample_rate' | 'bit_depth'>): string {
  if (!v.sample_rate) return '';
  const khz = v.sample_rate / 1000;
  const f = Number.isInteger(khz) ? String(khz) : khz.toFixed(1);
  return v.bit_depth ? `${v.bit_depth}/${f}` : `${f} kHz`;
}

/**
 * Le libellé d'une version dans le sélecteur : son nom, puis année, label,
 * format et résolution, ce qui est connu seulement.
 */
export function libelleVersion(v: VersionAlbum): string {
  const parties = [
    v.version_name || '',
    v.year ? String(v.year) : '',
    v.label || '',
    v.format ? v.format.toUpperCase() : '',
    resolution(v),
    // #2731 — « 2.0 », « 5.1 » : laquelle lancer sur une zone multicanale.
    libelleNombreCanaux(v.max_channels) ?? '',
  ].filter(Boolean);
  return parties.length ? parties.join(' · ') : v.title;
}
