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
import type { FluxRadio, RadioPlayResult, RadioStation } from '../types';

/** Une fiche de l'annuaire, telle que la rend `GET /radios/directory`. */
export interface FicheAnnuaireRadio {
  external_id: string;
  name: string;
  description?: string | null;
  /** URL absolue (le serveur résout les chemins `/storage/…` du site). */
  logo_url?: string | null;
  /** Code ISO 3166-1 alpha-2. */
  country_code?: string | null;
  /** Genre de l'annuaire, en minuscules (`eclectic`, `news`…) : le PREMIER
   *  genre de la fiche. */
  genre?: string | null;
  /** Tous les genres de la fiche, dans l'ordre (tune-server-rust#7215 :
   *  « OuiFM Blues & Rock » est blues ET rock). Absent d'un serveur plus
   *  ancien : lire `genresDeLaFiche`, qui se replie sur `genre`. */
  genres?: string[];
  categories?: string[];
  /** Mots-clés de la fiche : le diffuseur (NPR, BBC, Radio France…), dont la
   *  carte fait ses réseaux (tune-server-rust#7194). Absent d'un serveur plus
   *  ancien. */
  keywords?: string[];
  quality?: string | null;
  codec?: string | null;
  bitrate?: number | null;
  website_url?: string | null;
  stream_url: string;
  radio_metadata_key?: string | null;
  /** Les flux publiés de la fiche, le principal d'abord (tune-server-rust#7177).
   *  Absent sur un serveur antérieur : seul `stream_url` est connu. */
  streams?: FluxRadio[];
  /** radio-metadata.fr publie le titre en cours de cette station. */
  now_playing: boolean;
  /** La station de « Mes radios » rapprochée de cette fiche, s'il y en a une. */
  my_radio_id?: number | null;
  my_radio_favorite?: boolean | null;
}

/**
 * Les genres d'une fiche (tune-server-rust#7215) : `genres`, en minuscules,
 * sans vide ni doublon ; à défaut (serveur plus ancien), le seul `genre`.
 * Une fiche sans genre rend une liste vide.
 */
export function genresDeLaFiche(f: Pick<FicheAnnuaireRadio, 'genre' | 'genres'>): string[] {
  const out: string[] = [];
  const source = f.genres?.length ? f.genres : [f.genre];
  for (const g of source) {
    const cle = (g ?? '').trim().toLowerCase();
    if (cle && !out.includes(cle)) out.push(cle);
  }
  if (!out.length && f.genres?.length) {
    const cle = (f.genre ?? '').trim().toLowerCase();
    if (cle) out.push(cle);
  }
  return out;
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
  /** Critères de tune-server-rust#7466 (`codec`, `bitrate_min`, `lossless`,
   *  `hires`, `metadata_plus`, `favorites_only`) : voir `lib/radioFiltres`. */
  criteres?: Record<string, string>;
}

/** `GET /radios/directory` — l'annuaire filtré, depuis le cache du serveur. */
export function getAnnuaireRadios(f: FiltresAnnuaireRadios = {}) {
  const q = new URLSearchParams();
  if (f.q?.trim()) q.set('q', f.q.trim());
  if (f.country) q.set('country', f.country);
  if (f.genre) q.set('genre', f.genre);
  if (f.offset) q.set('offset', String(f.offset));
  if (f.limit) q.set('limit', String(f.limit));
  for (const [k, v] of Object.entries(f.criteres ?? {})) q.set(k, v);
  const qs = q.toString();
  return fetchJSON<AnnuaireRadios>(`${BASE}/radios/directory${qs ? '?' + qs : ''}`);
}

/** Ce que rend `GET /radios/search` (le seul volet utile ici : `items`). */
export interface RechercheRadiosParCriteres {
  statut?: string;
  count: number;
  items: RadioStation[];
}

/**
 * `GET /radios/search` avec les critères de tune-server-rust#7466 : les
 * stations de « Mes radios » qui y répondent. Sans texte, le serveur parcourt
 * tout « Mes radios ».
 */
export function rechercherRadiosParCriteres(
  texte: string,
  criteres: Record<string, string>,
  country?: string | null,
) {
  const q = new URLSearchParams();
  q.set('q', texte.trim());
  if (country) q.set('country', country);
  for (const [k, v] of Object.entries(criteres)) q.set(k, v);
  return fetchJSON<RechercheRadiosParCriteres>(`${BASE}/radios/search?${q.toString()}`);
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

/**
 * `POST /radios/directory/preferred-stream/{radio}` — la station de « Mes
 * radios » liée à sa fiche écoute désormais ce flux, choisi parmi ceux que la
 * fiche publie (tune-server-rust#7177, web#2443). 422 pour une adresse qui
 * n'est pas de la fiche, 409 pour une station sans fiche liée.
 */
export function choisirFluxPrefere(radioId: number, streamUrl: string) {
  return fetchJSON<RadioStation>(
    `${BASE}/radios/directory/preferred-stream/${radioId}`,
    { method: 'POST', body: JSON.stringify({ stream_url: streamUrl }) },
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
