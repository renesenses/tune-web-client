/**
 * Rangées de voisinage des pages album et artiste (Nocturne, itération 6),
 * calculées sur les données de Tune déjà chargées (bibliothèque, crédits) :
 *   - « Du même artiste » : les autres albums de l'artiste, du plus récent au
 *     plus ancien ;
 *   - « Albums proches » : même genre principal, autres artistes, rangés par
 *     écart d'année puis par date d'ajout ;
 *   - « Les musiciens » : les personnes des crédits, chacune avec ses rôles ;
 *   - genres d'un artiste : les genres principaux de ses albums, du plus
 *     fréquent au plus rare.
 */
import type { Album } from '../../lib/types';
import { genrePrincipal } from './triNocturne';

const PLAFOND = 12;

export function albumsDuMemeArtiste(liste: readonly Album[], album: Pick<Album, 'id' | 'artist_id'>, plafond = PLAFOND): Album[] {
  if (album.artist_id == null) return [];
  return liste
    .filter((a) => a.artist_id === album.artist_id && a.id !== album.id)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    .slice(0, plafond);
}

export function albumsProches(liste: readonly Album[], album: Album, plafond = PLAFOND): Album[] {
  const genre = genrePrincipal(album);
  if (!genre) return [];
  const annee = album.year ?? null;
  return liste
    .filter((a) => a.id !== album.id && a.artist_id !== album.artist_id && genrePrincipal(a) === genre)
    .map((a) => ({ a, ecart: annee != null && a.year != null ? Math.abs(a.year - annee) : 1000, ajout: Number(a.added_at ?? 0) }))
    .sort((x, y) => x.ecart - y.ecart || y.ajout - x.ajout)
    .slice(0, plafond)
    .map((x) => x.a);
}

export interface Musicien { nom: string; roles: string[]; artisteId: number | null }

/** Les crédits bruts d'un album → une entrée par personne (ordre d'apparition gardé). */
export function musiciensDesCredits(credits: readonly { artist_name?: string | null; artist_id?: number | null; role?: string | null; instrument?: string | null }[]): Musicien[] {
  const parNom = new Map<string, Musicien>();
  for (const c of credits) {
    const nom = c.artist_name?.trim();
    if (!nom) continue;
    const m = parNom.get(nom) ?? { nom, roles: [], artisteId: c.artist_id ?? null };
    const role = c.instrument ? `${c.role ?? ''} · ${c.instrument}`.replace(/^ · /, '') : (c.role ?? '');
    if (role && !m.roles.includes(role)) m.roles.push(role);
    if (m.artisteId == null && c.artist_id != null) m.artisteId = c.artist_id;
    parNom.set(nom, m);
  }
  return [...parNom.values()];
}

export function genresDeLArtiste(albums: readonly Album[], plafond = 6): string[] {
  const compte = new Map<string, number>();
  for (const a of albums) {
    const g = genrePrincipal(a);
    if (g) compte.set(g, (compte.get(g) ?? 0) + 1);
  }
  return [...compte.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, plafond).map(([g]) => g);
}
