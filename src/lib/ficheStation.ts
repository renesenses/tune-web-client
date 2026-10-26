// La fiche de la station qui joue (rapport de Rémi, RC7, #2398).
import type { RadioStation } from './types';

/** Ce qu'il faut savoir d'une station pour l'afficher dans sa fiche. */
export interface FicheStation {
  nom: string;
  logo: string | null;
  genre: string | null;
  pays: string | null;
  description: string | null;
  site: string | null;
}

const normaliser = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * La station de « Mes radios » que joue la zone : par adresse de flux
 * (`source_id` du now-playing), à défaut par nom (`album_title`). Pure.
 */
export function trouverStation(
  radios: RadioStation[],
  np: { source_id?: string | null; album_title?: string | null } | null | undefined,
): RadioStation | null {
  if (!np) return null;
  if (np.source_id) {
    const parFlux = radios.find((r) => r.stream_url === np.source_id);
    if (parFlux) return parFlux;
  }
  const nom = normaliser(np.album_title);
  return nom ? radios.find((r) => normaliser(r.name) === nom) ?? null : null;
}

/** La fiche d'une station de « Mes radios », complétée par sa fiche d'annuaire. */
export function ficheDeStation(r: RadioStation): FicheStation {
  return {
    nom: r.name,
    logo: r.logo_url || r.annuaire?.logo_url || null,
    genre: r.genre ?? null,
    pays: r.country ?? null,
    description: r.annuaire?.description ?? null,
    site: r.homepage_url || r.annuaire?.website_url || null,
  };
}
