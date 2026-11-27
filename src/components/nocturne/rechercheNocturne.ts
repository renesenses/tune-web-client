/** Filtres en pastilles du panneau de recherche de Nocturne (itération 6). */
import type { Album, Artist, Track } from '../../lib/types';

export const FILTRES_RECHERCHE = ['tout', 'albums', 'artistes', 'titres'] as const;
export type FiltreRecherche = (typeof FILTRES_RECHERCHE)[number];

export interface ResultatsRecherche { albums: Album[]; artists: Artist[]; tracks: Track[] }

const VIDE: ResultatsRecherche = { albums: [], artists: [], tracks: [] };

/** Ce que le filtre laisse voir ; « Tout » garde les trois familles. */
export function filtrerResultats(r: ResultatsRecherche | null, f: FiltreRecherche): ResultatsRecherche {
  if (!r) return VIDE;
  return {
    albums: f === 'tout' || f === 'albums' ? r.albums : [],
    artists: f === 'tout' || f === 'artistes' ? r.artists : [],
    tracks: f === 'tout' || f === 'titres' ? r.tracks : [],
  };
}
