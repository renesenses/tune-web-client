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

/**
 * « AAC · 192 kbit/s · 48 kHz » — le libellé d'un flux, sans son adresse. Pure.
 * HLS est un protocole de transport, pas un format : il n'y figure jamais
 * (même si un annuaire plus ancien le sert encore comme codec).
 */
export function libelleFlux(f: FluxRadio): string {
  const codec = f.codec?.toUpperCase();
  return [
    codec && codec !== 'HLS' ? codec : null,
    f.bitrate ? `${f.bitrate} kbit/s` : null,
    f.sample_rate ? `${Math.round(f.sample_rate / 100) / 10} kHz` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Les flux d'une station, du meilleur au moins bon. Pure.
 *
 * web#2552 (alec_eiffel, fil 2556 ; go de Bertrand le 30/10/2026) : la fiche
 * de BBC Radio 6 Music listait « HLS 320, HLS 96, HLS 320 » dans l'ordre de
 * l'annuaire. Ordre retenu, du plus au moins décisif :
 *   1. un codec SANS PERTE (FLAC, ALAC, WAV…) d'abord : son débit est parfois
 *      absent de la fiche, et il ne doit pas tomber derrière un MP3 à 320 ;
 *   2. le débit, décroissant (absent : en dernier) ;
 *   3. la fréquence d'échantillonnage, décroissante ;
 *   4. à qualité égale, le flux principal d'abord, puis l'ordre de la fiche.
 * Le flux principal ne change pas : seul l'affichage est rangé.
 */
const CODECS_SANS_PERTE = new Set(['FLAC', 'ALAC', 'WAV', 'AIFF', 'PCM', 'WAVPACK', 'APE']);
export function ordonnerFluxParQualite(flux: readonly FluxRadio[]): FluxRadio[] {
  const sansPerte = (f: FluxRadio) => (CODECS_SANS_PERTE.has((f.codec ?? '').trim().toUpperCase()) ? 1 : 0);
  const nombre = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : -1);
  return flux
    .map((f, i) => ({ f, i }))
    .sort((a, b) =>
      sansPerte(b.f) - sansPerte(a.f)
      || nombre(b.f.bitrate) - nombre(a.f.bitrate)
      || nombre(b.f.sample_rate) - nombre(a.f.sample_rate)
      || Number(!!b.f.primary) - Number(!!a.f.primary)
      || a.i - b.i)
    .map(({ f }) => f);
}

type Lecture = { source_id?: string | null; album_title?: string | null } | null | undefined;

/**
 * La station qui joue, telle que Tune la connaît : la fiche à montrer, et
 * d'où elle vient — « Mes radios » (`mienne`) ou l'annuaire seul (`annuaire`).
 * Une entrée d'annuaire peut déjà être dans « Mes radios » sous une autre
 * adresse de flux : elle le dit par `my_radio_id`.
 */
export interface StationDeLecture {
  fiche: FicheStation | null;
  mienne: RadioStation | null;
  annuaire: FicheAnnuaireRadio | null;
}
const AUCUNE: StationDeLecture = { fiche: null, mienne: null, annuaire: null };

/**
 * Dans « Mes radios » d'abord (par flux, puis par nom), sinon dans l'annuaire
 * par son nom exact.
 */
export async function stationDeLecture(np: Lecture): Promise<StationDeLecture> {
  const miennes = (await api.getRadios({ limit: 500 })) ?? [];
  const r = trouverStation(miennes, np);
  if (r) return { fiche: ficheDeStation(r), mienne: r, annuaire: null };
  const nom = np?.album_title ?? '';
  if (!nom) return AUCUNE;
  const a = await api.getAnnuaireRadios({ q: nom, limit: 20 });
  const f = a.items.find((x) => fold(x.name) === fold(nom)) ?? null;
  return { fiche: f ? ficheDeAnnuaire(f) : null, mienne: null, annuaire: f };
}

/** La fiche de la station qui joue. `null` : inconnue. */
export async function ficheDeLecture(np: Lecture): Promise<FicheStation | null> {
  return (await stationDeLecture(np)).fiche;
}

const stations = new Map<string, Promise<StationDeLecture>>();
const cleDeLecture = (np: Lecture) => `${np?.source_id ?? ''}|${np?.album_title ?? ''}`;

/**
 * `stationDeLecture`, retenue par station (flux + nom) pour la session : la
 * barre de lecture se redessine souvent, et le badge, le logo et le bouton
 * « Mes radios » de « En cours de lecture » la lisent tous. Un échec ne se
 * retient pas.
 */
export function stationDeLectureRetenue(np: Lecture): Promise<StationDeLecture> {
  const cle = cleDeLecture(np);
  if (cle === '|') return Promise.resolve(AUCUNE);
  let p = stations.get(cle);
  if (!p) {
    p = stationDeLecture(np).catch(() => { stations.delete(cle); return AUCUNE; });
    stations.set(cle, p);
  }
  return p;
}

/** La station a changé (ajoutée à « Mes radios », retirée) : la relire. */
export function oublierStationDeLecture(np: Lecture): void {
  stations.delete(cleDeLecture(np));
}

/** Le badge « Metadata+ » de « En cours de lecture ». */
export function metadataPlusDeLecture(np: Lecture): Promise<boolean> {
  return stationDeLectureRetenue(np).then((s) => !!s.fiche?.metadataPlus);
}

/** Pour les tests : oublie les stations retenues. */
export function oublierBadgesDeLecture(): void {
  stations.clear();
}

/**
 * Le logo de la station à montrer À CÔTÉ de son nom, ou `null`. Pure.
 *
 * web#2550 (alec_eiffel, fil 2560 ; go de Bertrand le 30/10/2026) : quand la
 * pochette du morceau est connue (Metadata+), elle remplace le logo, qui
 * n'apparaissait plus nulle part. Quand la pochette affichée EST le logo, on
 * ne le montre pas deux fois.
 */
export function logoAuNomDeLaStation(logo: string | null | undefined, pochette: string | null | undefined): string | null {
  const l = (logo ?? '').trim();
  if (!l) return null;
  return l === (pochette ?? '').trim() ? null : l;
}
