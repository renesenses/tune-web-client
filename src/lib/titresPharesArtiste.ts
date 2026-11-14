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
import { estDeBibliotheque } from './provenanceBibliotheque';

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
 * Les sources qui désignent un titre d'un CATALOGUE — le pendant de
 * `SOURCES_DE_CATALOGUE` du serveur (`titres_phares_ecoutes.rs`).
 *
 * 🔴 Recette de Bertrand, .18, rc12 (13/11/2026) : fiche Genesis › Titres
 * phares › « Dance on a Volcano » → « Erreur de lecture — HTTP 500 — aucun
 * disque dans le lecteur ». Le serveur ajoute aux titres du service ceux de
 * l'artiste les plus écoutés ici (#7416), et celui-là désignait le CD
 * (`source: "cd"`), éjecté depuis l'extraction. Un CD, un serveur UPnP, une
 * radio, un fichier glissé ne rejouent pas forcément ce qu'ils ont joué : un
 * titre phare ne se désigne que par un service ou par la bibliothèque.
 */
export const SOURCES_DE_CATALOGUE: readonly string[] = [
  'qobuz', 'tidal', 'deezer', 'spotify', 'youtube', 'amazon', 'bandcamp',
];

/**
 * Les titres d'un service, prêts à jouer : chacun TAMPONNÉ de sa source (la
 * charge de `top-tracks` ne porte pas celle des titres du service, et une
 * piste sans source n'est désignable par aucun corps de lecture), sans
 * écraser celle que le serveur a posée (un fichier de la bibliothèque, un
 * autre service) ; et sans ceux qu'un appareil désigne (voir
 * `SOURCES_DE_CATALOGUE`) — un serveur d'avant le correctif en rend encore.
 */
export function titresPharesJouables(titres: readonly Track[] | null | undefined, service: string): Track[] {
  return (titres ?? [])
    .filter((t) => {
      if (estDeBibliotheque(t)) return true;
      const s = String(t.source ?? '').trim().toLowerCase();
      return s === '' || s === service || SOURCES_DE_CATALOGUE.includes(s);
    })
    .map((t) => ({ ...t, source: (t.source ?? service) as Track['source'] }));
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
      const titres = titresPharesJouables(await charger(service, artistId), service);
      if (titres.length) return titres.slice(0, max);
    } catch {
      /* service suivant */
    }
  }
  return [];
}
