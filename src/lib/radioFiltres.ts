// Recherche de radios par critères (tune-server-rust#7466).
//
// Les critères de recherche de l'écran Radio (RadioFiltresAvances), envoyés au
// serveur, sur l'annuaire (`GET /radios/directory`) comme sur « Mes radios »
// (`GET /radios/search`). Le serveur les combine en ET ; un critère absent ne
// filtre rien. Le choix est retenu dans les préférences (`radioFiltres`),
// comme les autres choix d'affichage de l'application.

/** Les critères de la barre. `null` / `false` : critère inactif. */
export interface FiltresRadio {
  /** Famille de format : `flac`, `aac`, `mp3`, `opus`… */
  codec: string | null;
  /**
   * Qualité de flux minimale, sans distinction de format
   * (tune-server-rust#7718) : un débit en kbit/s (`'128'`) ou un niveau sans
   * perte (`'flac_24_96'`). La station passe si l'un de ses flux l'atteint.
   */
  qualiteMin: string | null;
  /** Un flux sans perte (FLAC, ALAC…). */
  lossless: boolean;
  /** Un flux SANS PERTE au-delà de 48 kHz (jugé au serveur, flux par flux). */
  hires: boolean;
  /** Le titre en cours est publié par radio-metadata.fr (badge Metadata+). */
  metadataPlus: boolean;
  /** Seulement les stations en favori dans « Mes radios ». */
  favoris: boolean;
}

export const FILTRES_RADIO_VIDES: FiltresRadio = Object.freeze({
  codec: null,
  qualiteMin: null,
  lossless: false,
  hires: false,
  metadataPlus: false,
  favoris: false,
});

/** Les formats proposés, dans l'ordre de la liste. */
export const FORMATS_RADIO = ['flac', 'aac', 'mp3', 'opus'] as const;

/** Les débits minimaux proposés (kbit/s). */
export const DEBITS_RADIO = [48, 96, 128, 192, 256, 320] as const;

/**
 * Les niveaux sans perte proposés, au-delà de tout débit : `[valeur, libellé]`.
 * La profondeur en bits n'est publiée par aucun annuaire : le serveur juge
 * « 24/96 » sur la fréquence (96 kHz) du flux sans perte.
 */
export const NIVEAUX_SANS_PERTE_RADIO = [
  ['flac_16_44', '16/44'],
  ['flac_24_48', '24/48'],
  ['flac_24_96', '24/96'],
  ['flac_24_192', '24/192'],
] as const;

/** Toutes les qualités minimales proposées, de la plus faible à la plus haute. */
export const QUALITES_RADIO: readonly string[] = [
  ...DEBITS_RADIO.map(String),
  ...NIVEAUX_SANS_PERTE_RADIO.map(([v]) => v),
];

function qualiteLue(o: Record<string, unknown>): string | null {
  if (typeof o.qualiteMin === 'string') {
    const q = o.qualiteMin.trim().toLowerCase();
    if (NIVEAUX_SANS_PERTE_RADIO.some(([v]) => v === q)) return q;
    const n = Number(q);
    return q && Number.isFinite(n) && n > 0 ? String(Math.round(n)) : null;
  }
  // Une préférence d'avant #7718 : le débit minimal devient le même niveau.
  return typeof o.bitrateMin === 'number' && Number.isFinite(o.bitrateMin) && o.bitrateMin > 0
    ? String(Math.round(o.bitrateMin)) : null;
}

/**
 * Une valeur lue des préférences (éventuellement ancienne, partielle ou
 * abîmée) ramenée à des critères valides. Rien de lisible : aucun critère.
 */
export function normaliserFiltresRadio(v: unknown): FiltresRadio {
  if (!v || typeof v !== 'object') return { ...FILTRES_RADIO_VIDES };
  const o = v as Record<string, unknown>;
  const codec = typeof o.codec === 'string' && o.codec.trim() ? o.codec.trim().toLowerCase() : null;
  return {
    codec,
    qualiteMin: qualiteLue(o),
    lossless: o.lossless === true,
    hires: o.hires === true,
    metadataPlus: o.metadataPlus === true,
    favoris: o.favoris === true,
  };
}

/** Combien de critères sont actifs (pour le bouton replié). */
export function nombreDeFiltresActifs(f: FiltresRadio): number {
  return [f.codec != null, f.qualiteMin != null, f.lossless, f.hires, f.metadataPlus, f.favoris]
    .filter(Boolean).length;
}

/** Les paramètres de requête des critères actifs, et d'eux seuls. */
export function parametresDesFiltres(f: FiltresRadio): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.codec) p.codec = f.codec;
  if (f.qualiteMin) p.quality_min = f.qualiteMin;
  if (f.lossless) p.lossless = 'true';
  if (f.hires) p.hires = 'true';
  if (f.metadataPlus) p.metadata_plus = 'true';
  if (f.favoris) p.favorites_only = 'true';
  return p;
}
