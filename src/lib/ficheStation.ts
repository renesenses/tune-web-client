// La fiche d'une station : celle qui joue (rapport de Rémi, RC7, #2398) et,
// depuis #2443, la fiche « Voir » des stations de l'annuaire — la MÊME, qu'on
// l'ouvre depuis « Mes radios », l'annuaire ou « En cours de lecture ».
import type { FluxRadio, RadioStation } from './types';
import type { FicheAnnuaireRadio } from './api/annuaireRadios';
import { estDeLAnnuaire } from './mesRadios';
import * as api from './api';
import { fold } from './utils';

/** Ce qu'il faut savoir d'une station pour l'afficher dans sa fiche. */
export interface FicheStation {
  nom: string;
  logo: string | null;
  genre: string | null;
  /** Le pays tel que la station l'écrit (repli quand le code manque). */
  pays: string | null;
  /** Code ISO 3166-1 alpha-2, rendu dans la langue du lecteur. */
  paysCode?: string | null;
  description: string | null;
  site: string | null;
  /** Catégories de la fiche d'annuaire (leurs `slug`). */
  categories?: string[];
  /** La station a une `radio_metadata_key` : titre et artiste augmentés. */
  metadataPlus?: boolean;
  /** Les flux publiés de la fiche d'annuaire, le principal d'abord. */
  flux?: FluxRadio[];
  /** L'adresse que la station lit aujourd'hui. */
  fluxActuel?: string | null;
  /**
   * La station de « Mes radios » dont on peut choisir le flux : liée à sa
   * fiche par son lien enregistré (`estDeLAnnuaire`). Absente : la liste des
   * flux se lit, sans choix.
   */
  radioId?: number | null;
}

const normaliser = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Le badge « Metadata+ » : la station a une clé radio-metadata.fr. Pure. */
export function aMetadataPlus(
  r: Pick<RadioStation, 'annuaire'> | Pick<FicheAnnuaireRadio, 'radio_metadata_key'> | null | undefined,
): boolean {
  if (!r) return false;
  if ('radio_metadata_key' in r && r.radio_metadata_key) return true;
  return !!(r as Pick<RadioStation, 'annuaire'>).annuaire?.radio_metadata_key;
}

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
  const a = r.annuaire;
  return {
    nom: r.name,
    logo: r.logo_url || a?.logo_url || null,
    genre: r.genre ?? null,
    pays: r.country ?? null,
    paysCode: r.country_code ?? null,
    description: a?.description ?? null,
    site: r.homepage_url || a?.website_url || null,
    categories: a?.categories ?? [],
    metadataPlus: aMetadataPlus(r),
    flux: a?.streams ?? [],
    fluxActuel: r.stream_url ?? null,
    radioId: r.id != null && estDeLAnnuaire(r) ? r.id : null,
  };
}

/** La fiche d'une entrée de l'annuaire qui n'est pas (encore) dans « Mes radios ». */
export function ficheDeAnnuaire(f: FicheAnnuaireRadio): FicheStation {
  return {
    nom: f.name,
    logo: f.logo_url ?? null,
    genre: f.genre ?? null,
    pays: f.country_code ?? null,
    paysCode: f.country_code ?? null,
    description: f.description ?? null,
    site: f.website_url ?? null,
    categories: f.categories ?? [],
    metadataPlus: aMetadataPlus(f),
    flux: f.streams?.length ? f.streams : f.stream_url ? [{ url: f.stream_url, codec: f.codec, bitrate: f.bitrate, primary: true }] : [],
    fluxActuel: null,
    radioId: null,
  };
}

/** « AAC · 192 kbit/s · 48 kHz » — le libellé d'un flux, sans son adresse. Pure. */
export function libelleFlux(f: FluxRadio): string {
  return [
    f.codec?.toUpperCase() || null,
    f.bitrate ? `${f.bitrate} kbit/s` : null,
    f.sample_rate ? `${Math.round(f.sample_rate / 100) / 10} kHz` : null,
    f.hls ? 'HLS' : null,
  ].filter(Boolean).join(' · ');
}

type Lecture = { source_id?: string | null; album_title?: string | null } | null | undefined;

/**
 * La fiche de la station qui joue : dans « Mes radios » d'abord (par flux,
 * puis par nom), sinon dans l'annuaire par son nom exact. `null` : inconnue.
 */
export async function ficheDeLecture(np: Lecture): Promise<FicheStation | null> {
  const miennes = (await api.getRadios({ limit: 500 })) ?? [];
  const r = trouverStation(miennes, np);
  if (r) return ficheDeStation(r);
  const nom = np?.album_title ?? '';
  if (!nom) return null;
  const a = await api.getAnnuaireRadios({ q: nom, limit: 20 });
  const f = a.items.find((x) => fold(x.name) === fold(nom));
  return f ? ficheDeAnnuaire(f) : null;
}

const badges = new Map<string, Promise<boolean>>();

/**
 * Le badge « Metadata+ » de « En cours de lecture » : retenu par station
 * (flux + nom) pour la session, la barre de lecture se redessinant souvent.
 * Un échec ne se retient pas.
 */
export function metadataPlusDeLecture(np: Lecture): Promise<boolean> {
  const cle = `${np?.source_id ?? ''}|${np?.album_title ?? ''}`;
  if (cle === '|') return Promise.resolve(false);
  let p = badges.get(cle);
  if (!p) {
    p = ficheDeLecture(np).then((f) => !!f?.metadataPlus, () => { badges.delete(cle); return false; });
    badges.set(cle, p);
  }
  return p;
}

/** Pour les tests : oublie les badges retenus. */
export function oublierBadgesDeLecture(): void {
  badges.clear();
}
