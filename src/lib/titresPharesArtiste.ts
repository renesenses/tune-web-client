/**
 * Les TITRES PHARES d'un artiste de la bibliothèque — étape 2 de la page
 * artiste commune (renesenses/tune-server-rust#4330).
 *
 * FabienM, 17/09/2026 : « Cette page artiste pourrait être complétée avec la
 * bio de l'artiste, ses titres phares, sa tournée concerts ».
 *
 * Une bibliothèque ne sait pas quels titres d'un artiste sont « phares » : ce
 * classement vient des SERVICES (`/streaming/{service}/artists/{id}/top-tracks`,
 * dans l'ordre du service, qu'on ne retrie pas). La fiche d'un artiste de
 * service les montrait déjà ; celle d'un artiste de la bibliothèque, non.
 *
 * L'identifiant de l'artiste chez chaque service est DÉJÀ résolu par la
 * discographie commune (`albumsDeStreamingPourArtiste`, par le nom) : on le
 * réemploie au lieu de relancer une recherche.
 *
 * Le service interrogé suit l'ordre de préférence de la page artiste commune —
 * Qobuz, Tidal, YouTube, Bandcamp, puis les autres — et on passe au suivant si
 * le premier ne rend rien.
 */
import type { Track } from './types';
import type { AlbumsDeService } from './albumsArtisteStreaming';
import { ORDRE_SOURCES } from './discographieCommune';

/** Nombre de titres montrés — celui de la fiche d'un artiste de service. */
export const TITRES_PHARES_MAX = 10;

const rang = (s: string) => {
  const i = ORDRE_SOURCES.indexOf(s);
  return i === -1 ? ORDRE_SOURCES.length : i;
};

/** Les services à interroger, dans l'ordre, avec l'identifiant déjà résolu. */
export function servicesPourTitresPhares(
  sections: readonly AlbumsDeService[] | null | undefined,
): { service: string; artistId: string }[] {
  return (sections ?? [])
    .filter((s): s is AlbumsDeService & { artistId: string } => !!s.artistId)
    .map((s) => ({ service: s.service, artistId: s.artistId }))
    .sort((a, b) => rang(a.service) - rang(b.service));
}

/**
 * Les titres phares : le premier service qui en rend. Chaque piste est
 * TAMPONNÉE de sa source (la charge de `top-tracks` ne la porte pas, et une
 * piste sans source n'est désignable par aucun corps de lecture). Un service
 * qui échoue est simplement passé.
 */
export async function chargerTitresPhares(
  sections: readonly AlbumsDeService[] | null | undefined,
  charger: (service: string, artistId: string) => Promise<Track[] | null | undefined>,
  max = TITRES_PHARES_MAX,
): Promise<Track[]> {
  for (const { service, artistId } of servicesPourTitresPhares(sections)) {
    try {
      const titres = (await charger(service, artistId)) ?? [];
      if (titres.length) {
        return titres.slice(0, max).map((t) => ({ ...t, source: (t.source ?? service) as Track['source'] }));
      }
    } catch {
      /* service suivant */
    }
  }
  return [];
}
