// Recherche de radios par critères (tune-server-rust#7466).
//
// Les critères que la barre « Plus de filtres » de l'écran Radio envoie au
// serveur, sur l'annuaire (`GET /radios/directory`) comme sur « Mes radios »
// (`GET /radios/search`). Le serveur les combine en ET ; un critère absent ne
// filtre rien. Le choix est retenu dans les préférences (`radioFiltres`),
// comme les autres choix d'affichage de l'application.

/** Les critères de la barre. `null` / `false` : critère inactif. */
export interface FiltresRadio {
  /** Famille de format : `flac`, `aac`, `mp3`, `opus`… */
  codec: string | null;
  /** Débit minimal, en kbit/s. */
  bitrateMin: number | null;
  /** Un flux sans perte (FLAC, ALAC…). */
  lossless: boolean;
  /** Un flux au-delà de 48 kHz. */
  hires: boolean;
  /** Le titre en cours est publié par radio-metadata.fr (badge Metadata+). */
  metadataPlus: boolean;
  /** Seulement les stations en favori dans « Mes radios ». */
  favoris: boolean;
}

export const FILTRES_RADIO_VIDES: FiltresRadio = Object.freeze({
  codec: null,
  bitrateMin: null,
  lossless: false,
  hires: false,
  metadataPlus: false,
  favoris: false,
});

/** Les formats proposés, dans l'ordre de la liste. */
export const FORMATS_RADIO = ['flac', 'aac', 'mp3', 'opus'] as const;

/** Les débits minimaux proposés (kbit/s). */
export const DEBITS_RADIO = [128, 192, 256, 320] as const;

/**
 * Une valeur lue des préférences (éventuellement ancienne, partielle ou
 * abîmée) ramenée à des critères valides. Rien de lisible : aucun critère.
 */
export function normaliserFiltresRadio(v: unknown): FiltresRadio {
  if (!v || typeof v !== 'object') return { ...FILTRES_RADIO_VIDES };
  const o = v as Record<string, unknown>;
  const codec = typeof o.codec === 'string' && o.codec.trim() ? o.codec.trim().toLowerCase() : null;
  const debit = typeof o.bitrateMin === 'number' && Number.isFinite(o.bitrateMin) && o.bitrateMin > 0
    ? Math.round(o.bitrateMin) : null;
  return {
    codec,
    bitrateMin: debit,
    lossless: o.lossless === true,
    hires: o.hires === true,
    metadataPlus: o.metadataPlus === true,
    favoris: o.favoris === true,
  };
}

/** Combien de critères sont actifs (pour le bouton replié). */
export function nombreDeFiltresActifs(f: FiltresRadio): number {
  return [f.codec != null, f.bitrateMin != null, f.lossless, f.hires, f.metadataPlus, f.favoris]
    .filter(Boolean).length;
}

/** Les paramètres de requête des critères actifs, et d'eux seuls. */
export function parametresDesFiltres(f: FiltresRadio): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.codec) p.codec = f.codec;
  if (f.bitrateMin) p.bitrate_min = String(f.bitrateMin);
  if (f.lossless) p.lossless = 'true';
  if (f.hires) p.hires = 'true';
  if (f.metadataPlus) p.metadata_plus = 'true';
  if (f.favoris) p.favorites_only = 'true';
  return p;
}
