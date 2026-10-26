// L'annuaire radio-metadata.fr complet dans « Radio en direct »
// (tune-server-rust#6516).
//
// Le serveur Tune garde un cache local de l'annuaire de mozaiklabs.fr (relevé
// chaque jour, servi hors ligne) et l'expose ici, filtré et paginé. Le client
// ne parle JAMAIS directement à mozaiklabs.fr ni à radio-metadata.fr.
//
// Routes serveur : `/api/v1/radios/directory…` (`routes/radios_annuaire.rs`).
// Importé via la barrel `lib/api`.
import { BASE, fetchJSON } from './_client';
import type { RadioPlayResult, RadioStation } from '../types';

/** Une fiche de l'annuaire, telle que la rend `GET /radios/directory`. */
export interface FicheAnnuaireRadio {
  external_id: string;
  name: string;
  description?: string | null;
  /** URL absolue (le serveur résout les chemins `/storage/…` du site). */
  logo_url?: string | null;
  /** Code ISO 3166-1 alpha-2. */
  country_code?: string | null;
  /** Genre de l'annuaire, en minuscules (`eclectic`, `news`…). */
  genre?: string | null;
  categories?: string[];
  quality?: string | null;
  codec?: string | null;
  bitrate?: number | null;
  website_url?: string | null;
  stream_url: string;
  radio_metadata_key?: string | null;
  /** radio-metadata.fr publie le titre en cours de cette station. */
  now_playing: boolean;
  /** La station de « Mes radios » rapprochée de cette fiche, s'il y en a une. */
  my_radio_id?: number | null;
  my_radio_favorite?: boolean | null;
}

export interface FacetteAnnuaire {
  code?: string;
  key?: string;
  count: number;
}

export interface AnnuaireRadios {
  total: number;
  offset: number;
  limit: number;
  count: number;
  items: FicheAnnuaireRadio[];
  countries: FacetteAnnuaire[];
  genres: FacetteAnnuaire[];
  /** Nombre de stations du relevé, tous filtres levés. */
  stations: number;
  /** `reseau`, `cache` (copie locale, hors ligne) ou `aucun`. */
  origine: 'reseau' | 'cache' | 'aucun' | string;
  releve_le?: string | null;
  attribution: { name: string; url: string; support_url: string };
}

export interface FiltresAnnuaireRadios {
  q?: string;
  country?: string | null;
  genre?: string | null;
  offset?: number;
  limit?: number;
}

/** `GET /radios/directory` — l'annuaire filtré, depuis le cache du serveur. */
export function getAnnuaireRadios(f: FiltresAnnuaireRadios = {}) {
  const q = new URLSearchParams();
  if (f.q?.trim()) q.set('q', f.q.trim());
  if (f.country) q.set('country', f.country);
  if (f.genre) q.set('genre', f.genre);
  if (f.offset) q.set('offset', String(f.offset));
  if (f.limit) q.set('limit', String(f.limit));
  const qs = q.toString();
  return fetchJSON<AnnuaireRadios>(`${BASE}/radios/directory${qs ? '?' + qs : ''}`);
}

/** `POST /radios/directory/{id}/add` — dans « Mes radios », sans doublon. */
export function ajouterDepuisAnnuaire(externalId: string, favori = false) {
  return fetchJSON<RadioStation>(
    `${BASE}/radios/directory/${encodeURIComponent(externalId)}/add`,
    { method: 'POST', body: JSON.stringify({ favorite: favori }) },
  );
}

/** `POST /radios/directory/update-stream/{radio}` — « Mettre à jour l'adresse
 *  du flux » : la station liée prend l'adresse que publie sa fiche. */
export function mettreAJourLeFluxDepuisAnnuaire(radioId: number) {
  return fetchJSON<RadioStation>(
    `${BASE}/radios/directory/update-stream/${radioId}`,
    { method: 'POST' },
  );
}

/** `POST /radios/directory/{id}/play/{zone}` — écoute sans rien ajouter. */
export function jouerDepuisAnnuaire(externalId: string, zoneId: number) {
  return fetchJSON<RadioPlayResult>(
    `${BASE}/radios/directory/${encodeURIComponent(externalId)}/play/${zoneId}`,
    { method: 'POST' },
  );
}

/**
 * Ce que la recherche globale sait des radios (tune-server-rust#7045).
 *
 * `miennes` : « Mes radios » qui répondent. `annuaire` : les fiches de
 * l'annuaire qui répondent, dont certaines sont déjà dans « Mes radios »
 * (`my_radio_id`). `reste` : combien de fiches l'aperçu ne montre pas.
 */
export interface RadiosTrouvees {
  miennes: RadioStation[];
  annuaire: FicheAnnuaireRadio[];
  reste: number;
}

/**
 * Lit les radios d'une réponse de `GET /search`. Pure.
 *
 * 🔴 Chaque champ est facultatif : un serveur antérieur à la rc9 n'a pas
 * `radios_annuaire` (et, avec `sources=radios`, qu'il ne connaît pas, il rend
 * des tableaux vides). Absent n'est pas une erreur : l'écran n'a simplement
 * rien à montrer de ce côté.
 */
export function lireRadiosTrouvees(r: {
  radios?: RadioStation[] | null;
  radios_annuaire?: { total?: number; items?: FicheAnnuaireRadio[] | null } | null;
} | null | undefined): RadiosTrouvees {
  const miennes = Array.isArray(r?.radios) ? r!.radios! : [];
  const annuaire = Array.isArray(r?.radios_annuaire?.items) ? r!.radios_annuaire!.items! : [];
  const total = Number(r?.radios_annuaire?.total ?? annuaire.length);
  return { miennes, annuaire, reste: Math.max(0, (Number.isFinite(total) ? total : annuaire.length) - annuaire.length) };
}

/**
 * `GET /search?sources=radios` — « Mes radios » ET l'annuaire, sans la
 * bibliothèque ni les services : l'écran de recherche tient déjà son local de
 * `/library/search`.
 */
export function chercherRadios(q: string) {
  return fetchJSON<Parameters<typeof lireRadiosTrouvees>[0]>(
    `${BASE}/search?q=${encodeURIComponent(q)}&sources=radios`,
  ).then(lireRadiosTrouvees);
}
