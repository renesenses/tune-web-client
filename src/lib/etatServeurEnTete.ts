/**
 * État du serveur — le bandeau de tête de la maquette de Levente (15/11/2026,
 * « image 5 ») : serveur joignable, albums, titres, taille de la bibliothèque.
 *
 * RÈGLE 1 du brief : aucune donnée inventée. Chaque tuile ne s'affiche que si
 * le serveur a RÉELLEMENT servi son chiffre :
 *
 *   - `GET /system/health` répond → « en ligne » (+ la version, si envoyée) ;
 *     il échoue → « injoignable », jamais un « en ligne » par défaut ;
 *   - `GET /library/stats` → `albums`, `tracks` et `total_size_bytes`
 *     (somme des `file_size` connus, tune-server-rust `routes/library/stats.rs`).
 *     Une taille à 0 veut dire « aucune taille connue » (bibliothèque de
 *     flux seulement, ou serveur qui ne l'envoie pas) : la tuile se tait
 *     plutôt que d'afficher « 0 Go ».
 */

export interface EnTeteEtatServeur {
  /** `true` : la route de santé a répondu ; `false` : elle a échoué ;
   *  `null` : pas encore lue. */
  enLigne: boolean | null;
  version: string | null;
  albums: number | null;
  pistes: number | null;
  /** Octets, strictement positifs, ou `null` (tuile masquée). */
  octets: number | null;
}

const compte = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

export function lireEnTete(
  sante: { ok: true; valeur: unknown } | { ok: false } | null,
  stats: unknown,
): EnTeteEtatServeur {
  const s = stats && typeof stats === 'object' ? (stats as Record<string, unknown>) : null;
  const octets = compte(s?.total_size_bytes);
  let version: string | null = null;
  if (sante?.ok && sante.valeur && typeof sante.valeur === 'object') {
    const v = (sante.valeur as Record<string, unknown>).version;
    if (typeof v === 'string' && v.trim() !== '') version = v.trim();
  }
  return {
    enLigne: sante === null ? null : sante.ok,
    version,
    albums: compte(s?.albums),
    pistes: compte(s?.tracks),
    octets: octets !== null && octets > 0 ? octets : null,
  };
}

/**
 * Octets → « 1,8 To » / « 1.8 TB » / « 640 Go ». Unités DÉCIMALES (celles des
 * fabricants de disques, comme `chiffresAccueil.formaterOctets`), écrites par
 * `Intl` dans la langue de l'interface — « To » en français, « TB » en
 * anglais, pas un « To » figé pour tout le monde.
 */
export function tailleBibliotheque(octets: number, langue: string): string {
  const unites = ['megabyte', 'gigabyte', 'terabyte', 'petabyte'] as const;
  let v = octets / 1_000_000;
  let i = 0;
  while (v >= 1000 && i < unites.length - 1) { v /= 1000; i += 1; }
  try {
    return new Intl.NumberFormat(langue, {
      style: 'unit', unit: unites[i], unitDisplay: 'short', maximumFractionDigits: 1,
    }).format(v);
  } catch {
    return `${v.toFixed(1)} ${['MB', 'GB', 'TB', 'PB'][i]}`;
  }
}
