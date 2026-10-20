/**
 * tune-server-rust#6481 (cpadiou77 et Patatorz, fil forum 2326) — « Dans
 * Audirvana il est possible d'accéder aux PDF des albums stockés dans la
 * bibliothèque ou pour les albums Qobuz disposant de ce PDF. Pourrait-on
 * ajouter cette fonctionnalité sur la page de l'album ? »
 *
 * Deux sources, une même liste pour la fiche :
 *  - album de la BIBLIOTHÈQUE : les PDF rangés dans son dossier,
 *    `GET /library/albums/{id}/booklets` → `{ booklets: [{ name, size }] }`,
 *    chaque fichier servi par `GET /library/albums/{id}/booklets/{name}` (le
 *    serveur ne sert QUE les PDF de ce dossier) ;
 *  - album QOBUZ : le livret numérique que Qobuz publie,
 *    `GET /streaming/qobuz/albums/{id}/booklets` → `[{ name, url }]`, une
 *    adresse `https` chez Qobuz.
 *
 * Le livret s'ouvre dans un NOUVEL ONGLET (`target="_blank"`,
 * `rel="noopener noreferrer"`). Un album d'un dépôt Tune distant ou de
 * Bandcamp n'en a pas : son `id` n'est pas celui de ce serveur.
 */
export const SERVICES_AVEC_LIVRETS: ReadonlySet<string> = new Set(['qobuz']);

export type CibleLivrets =
  | { kind: 'local'; albumId: number }
  | { kind: 'service'; service: string; albumId: string };

export interface Livret {
  nom: string;
  url: string;
}

export function cibleLivrets(
  album: { id?: number | null; source_id?: unknown } | null | undefined,
  o: { service?: string | null; depot?: unknown; bandcamp?: unknown },
): CibleLivrets | null {
  if (!album || o.depot || o.bandcamp) return null;
  if (album.id != null) return Number.isInteger(album.id) && album.id > 0 ? { kind: 'local', albumId: album.id } : null;
  const sid = album.source_id == null ? '' : String(album.source_id).trim();
  if (!sid || !o.service || !SERVICES_AVEC_LIVRETS.has(o.service)) return null;
  return { kind: 'service', service: o.service, albumId: sid };
}

/** L'adresse d'un livret de la bibliothèque (avant `urlNavigateur`). */
export function urlLivretLocal(base: string, albumId: number, nom: string): string {
  return `${base}/library/albums/${albumId}/booklets/${encodeURIComponent(nom)}`;
}

/** Une adresse de service n'est proposée qu'en `https` : jamais de `javascript:`. */
function adresseSure(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface LecteursLivrets {
  base: string;
  locaux: (albumId: number) => Promise<{ booklets?: Array<{ name?: unknown }> } | null | undefined>;
  deService: (service: string, albumId: string) => Promise<Array<{ name?: unknown; url?: unknown }> | null | undefined>;
  /** `urlNavigateur` — le jeton du pont pour une navigation. */
  navigateur: (url: string) => string;
}

/** Les livrets à proposer ; une erreur (serveur ancien, panne) n'en propose aucun. */
export async function chargerLivrets(cible: CibleLivrets, l: LecteursLivrets): Promise<Livret[]> {
  try {
    if (cible.kind === 'local') {
      const r = await l.locaux(cible.albumId);
      return (r?.booklets ?? [])
        .map((b) => (typeof b?.name === 'string' ? b.name : ''))
        .filter((nom) => nom && !nom.includes('/') && !nom.includes('\\'))
        .map((nom) => ({ nom, url: l.navigateur(urlLivretLocal(l.base, cible.albumId, nom)) }));
    }
    const r = await l.deService(cible.service, cible.albumId);
    return (Array.isArray(r) ? r : [])
      .filter((b) => adresseSure(b?.url))
      .map((b) => ({ nom: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : '', url: b.url as string }));
  } catch {
    return [];
  }
}
