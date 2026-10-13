/**
 * web#1755 — OÙ l'on habite et JUSQU'OÙ l'on va, retenus PAR PROFIL.
 *
 * Le fil 2028 : « Concerts ne m'a pas demandé où j'habitais à quelle distance
 * j'acceptais d'aller ». L'écran s'ouvrait sur le pays (ou Partout) et la
 * commune ne se saisissait qu'après un clic sur « Autour de moi ».
 *
 * Le serveur garde UNE localisation pour toute l'installation
 * (`plugin_concerts_localisation`), et le nuage applique la dernière reçue.
 * Le choix de chaque profil est donc retenu ICI, dans les préférences
 * synchronisées (`ui_preferences`, sous l'en-tête `X-Profile-Id`), et rejoué
 * vers le serveur à l'ouverture de l'écran quand celui-ci en garde un autre.
 *
 * `null` = ce profil n'a encore rien dit : l'écran pose la question (commune,
 * code postal, pays, rayon). `'plus-tard'` = « Pas maintenant » : l'écran
 * garde le comportement d'avant (pays ou Partout, ce que le serveur applique),
 * ne rejoue rien et ne redemande pas. Le premier choix explicite d'un cran le
 * remplace par un lieu.
 */
import type { PerimetreConcerts } from './api';

export interface LieuConcerts {
  scope: PerimetreConcerts;
  /** Vide quand le profil n'a pas donné de commune. */
  city: string;
  postal_code: string | null;
  country: string;
  radius_km: number;
}

const PERIMETRES: readonly PerimetreConcerts[] = ['radius', 'country', 'world'];
const RAYONS = [50, 100, 200];

export const PLUS_TARD = 'plus-tard' as const;
export type ChoixLieuConcerts = LieuConcerts | typeof PLUS_TARD;

/** Une préférence relue (serveur, ancienne version, saisie à la main) : un
 *  choix valable ou `null`. Une valeur douteuse vaut « rien dit ». */
export function normaliserChoixLieu(v: unknown): ChoixLieuConcerts | null {
  return v === PLUS_TARD ? PLUS_TARD : normaliserLieuConcerts(v);
}

/** Un LIEU valable ou `null`. */
export function normaliserLieuConcerts(v: unknown): LieuConcerts | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!PERIMETRES.includes(o.scope as PerimetreConcerts)) return null;
  const city = typeof o.city === 'string' ? o.city.trim() : '';
  const scope = o.scope as PerimetreConcerts;
  // Un rayon sans commune ne s'applique pas : ce n'est pas un choix complet.
  if (scope === 'radius' && !city) return null;
  return {
    scope,
    city,
    postal_code: typeof o.postal_code === 'string' && o.postal_code.trim() ? o.postal_code.trim() : null,
    country: typeof o.country === 'string' ? o.country.trim().toUpperCase() : '',
    radius_km: RAYONS.includes(Number(o.radius_km)) ? Number(o.radius_km) : 100,
  };
}

/** Une commune réellement enregistrée côté serveur (`'—'` est le bouche-trou
 *  envoyé pour « pays » et « partout »). */
export function communeEnregistree(city: unknown): string {
  const c = typeof city === 'string' ? city.trim() : '';
  return c === '—' ? '' : c;
}

/**
 * Le serveur applique-t-il déjà le choix de ce profil ? Seuls les champs qui
 * comptent pour le périmètre sont comparés : la commune et le rayon ne
 * comptent que pour « Autour de moi », le pays pour « Dans mon pays ».
 */
export function lieuDejaApplique(
  profil: LieuConcerts,
  serveur: { scope?: unknown; city?: unknown; postal_code?: unknown; country?: unknown; radius_km?: unknown },
): boolean {
  if (serveur.scope !== profil.scope) return false;
  const pays = typeof serveur.country === 'string' ? serveur.country.trim().toUpperCase() : '';
  if (profil.scope === 'world') return true;
  if (profil.scope === 'country') return pays === profil.country;
  const cp = typeof serveur.postal_code === 'string' && serveur.postal_code.trim() ? serveur.postal_code.trim() : null;
  return communeEnregistree(serveur.city).toLowerCase() === profil.city.toLowerCase()
    && cp === profil.postal_code
    && pays === profil.country
    && Number(serveur.radius_km) === profil.radius_km;
}
