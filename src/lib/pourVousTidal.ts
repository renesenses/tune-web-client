/**
 * tune-server-rust#8935 — TIDAL « Pour vous » et titres recommandés sous une
 * playlist.
 *
 * Le serveur sert :
 * - `/streaming/{service}/for-you` : `{ source, rows }`, chaque rangée avec
 *   son titre et ses `albums`, `playlists` (mixes compris, `mix:<id>`),
 *   `artists` et `tracks` ;
 * - `/streaming/{service}/playlists/{id}/recommendations?limit=&offset=` :
 *   `{ tracks, total, offset }`.
 *
 * Les éléments reçoivent ici leur `source` (le service) : la lecture, la file
 * et les pochettes passent ensuite par les chemins de tout service.
 */
import type { StreamingPlaylist } from './types';
import { estUnMix } from './mixesTidal';

/** Les services dont l'écran montre l'onglet « Pour vous » et les titres recommandés. */
export const SERVICES_POUR_VOUS: readonly string[] = ['tidal'];

export function proposePourVous(service: string | null | undefined): boolean {
  return !!service && SERVICES_POUR_VOUS.includes(service);
}

export interface RangeePourVous {
  id: string;
  title: string;
  subtitle?: string | null;
  albums: any[];
  playlists: StreamingPlaylist[];
  artists: any[];
  tracks: any[];
}

export interface PagePourVous {
  source: string;
  rows: RangeePourVous[];
}

export interface PageRecommandes {
  tracks: any[];
  total: number;
  offset: number;
}

const aUnId = (x: any): boolean =>
  (typeof x?.source_id === 'string' && x.source_id !== '') ||
  (typeof x?.id === 'string' && x.id !== '');

function avecSource<T>(liste: unknown, service: string): T[] {
  return (Array.isArray(liste) ? liste : [])
    .filter(aUnId)
    .map((x: any) => ({ ...x, source: x?.source ?? service }));
}

/**
 * La page « Pour vous » prête à afficher : rangées sans titre ou sans rien
 * écartées, éléments sans identifiant retirés. `null` : la page n'a pas pu se
 * lire (route absente, refus, panne) — à distinguer d'une page vide.
 */
export async function chargerPourVous(
  service: string | null | undefined,
  lire: (service: string) => Promise<any>,
): Promise<PagePourVous | null> {
  if (!proposePourVous(service)) return { source: '', rows: [] };
  const svc = service as string;
  let brut: any;
  try {
    brut = await lire(svc);
  } catch {
    return null;
  }
  const rows: RangeePourVous[] = (Array.isArray(brut?.rows) ? brut.rows : [])
    .map((r: any, i: number) => ({
      id: typeof r?.id === 'string' && r.id ? r.id : `rangee-${i}`,
      title: typeof r?.title === 'string' ? r.title.trim() : '',
      subtitle: typeof r?.subtitle === 'string' ? r.subtitle.trim() : null,
      albums: avecSource(r?.albums, svc),
      playlists: avecSource<StreamingPlaylist>(r?.playlists, svc),
      artists: avecSource(r?.artists, svc),
      tracks: avecSource(r?.tracks, svc),
    }))
    .filter((r: RangeePourVous) =>
      r.title !== '' && (r.albums.length || r.playlists.length || r.artists.length || r.tracks.length));
  return { source: typeof brut?.source === 'string' ? brut.source : '', rows };
}

/** Les titres recommandés se demandent pour une playlist du service, pas pour un mix. */
export function proposeDesRecommandations(
  service: string | null | undefined,
  playlist: { source_id?: unknown } | null | undefined,
): boolean {
  return proposePourVous(service)
    && typeof playlist?.source_id === 'string' && playlist.source_id !== ''
    && !estUnMix(playlist);
}

/** Titres recommandés par page. */
export const RECOMMANDES_PAR_PAGE = 10;

/**
 * Une page de titres recommandés. Une route absente, un refus ou une panne
 * rendent une page vide : la section ne s'affiche pas, sans message.
 */
export async function chargerRecommandations(
  service: string | null | undefined,
  playlist: { source_id?: unknown } | null | undefined,
  offset: number,
  lire: (service: string, playlistId: string, limit: number, offset: number) => Promise<any>,
): Promise<PageRecommandes> {
  const vide = { tracks: [], total: 0, offset };
  if (!proposeDesRecommandations(service, playlist)) return vide;
  try {
    const r = await lire(service as string, String(playlist!.source_id), RECOMMANDES_PAR_PAGE, offset);
    const tracks = avecSource(r?.tracks, service as string);
    const total = typeof r?.total === 'number' ? r.total : offset + tracks.length;
    return { tracks, total, offset };
  } catch {
    return vide;
  }
}

/**
 * Le décalage de la page suivante (« Autres suggestions »), qui reprend au
 * début une fois la liste de TIDAL parcourue. `null` : une seule page, rien à
 * proposer de plus.
 */
export function decalageSuivant(page: PageRecommandes): number | null {
  if (page.total <= RECOMMANDES_PAR_PAGE) return null;
  const suivant = page.offset + RECOMMANDES_PAR_PAGE;
  return suivant >= page.total ? 0 : suivant;
}
