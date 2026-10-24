/**
 * web#2305 (suite de tune-server-rust#6729, PR #6744) — QUEL scan tient le droit.
 *
 * Le serveur ne laisse tourner qu'un scan à la fois : scan de démarrage,
 * bouton « Scanner », horaire programmé, remontage tardif d'un partage
 * réseau, ajout de dossier, import, extraction de CD. Tades (fil 2368) voyait
 * « analyse en cours » rester allumé après un scan ciblé fini à 100 %, sans
 * savoir qu'un AUTRE scan était reparti derrière. Depuis #6744, le serveur dit
 * lequel :
 *
 *   GET /system/scan/status → `current` :
 *     { origin, path, started_at, stale: false }  pendant un scan annoncé
 *     { origin: null, path: null, stale: false }  droit tenu, pas encore annoncé
 *     { origin: null, path: null, stale: true }   statut résiduel (aucun scan)
 *     null                                         au repos
 *   POST /system/scan → 409 `already_scanning`, avec le même `current`.
 *
 * Ce module traduit ce champ en une ligne lisible, et le refus 409 en une
 * phrase qui nomme le scan détenteur. Un serveur plus ancien n'envoie pas
 * `current` : les deux fonctions rendent alors `null`, et l'écran garde son
 * texte d'avant.
 */

export interface ScanCourant {
  origin: string | null;
  path: string | null;
  /** Secondes Unix du départ, en chaîne (`chrono_now` côté serveur). */
  started_at?: string | null;
  stale: boolean;
}

/** Les origines que le serveur publie (`ORIGINE_*`, `routes/system/scan.rs`). */
export const ORIGINES_DE_SCAN = [
  'startup',
  'manual',
  'scheduled',
  'late_network_mount',
  'music_dir_added',
  'import',
  'cd_rip',
] as const;

type Tr = (cle: string) => string;
type Heure = (secondesUnix: number) => string;

/** Lit `current` sans faire confiance à sa forme : tout écart rend `null`. */
export function lireScanCourant(brut: unknown): ScanCourant | null {
  if (!brut || typeof brut !== 'object') return null;
  const c = brut as Record<string, unknown>;
  const texte = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    origin: texte(c.origin),
    path: texte(c.path),
    started_at: texte(c.started_at),
    stale: c.stale === true,
  };
}

/** L'heure locale du départ, « 21:14 ». */
export function heureLocale(secondesUnix: number): string {
  return new Date(secondesUnix * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * « Scan de démarrage · toute la bibliothèque · depuis 21:14 », ou la phrase
 * du statut résiduel. `null` quand le serveur ne dit rien de plus que
 * « scanning » (champ absent, ou droit pas encore annoncé).
 */
export function decrireScanCourant(
  brut: unknown,
  tr: Tr,
  heure: Heure = heureLocale,
): string | null {
  const c = lireScanCourant(brut);
  if (!c) return null;
  if (c.stale) return tr('scanDetenteur.residuel');
  if (!c.origin) return null;
  const origine = (ORIGINES_DE_SCAN as readonly string[]).includes(c.origin)
    ? tr(`scanDetenteur.origine.${c.origin}`)
    : tr('scanDetenteur.origine.inconnue');
  const portee = c.path
    ? tr('scanDetenteur.dossier').replace('{chemin}', c.path)
    : tr('scanDetenteur.toute');
  const secondes = Number(c.started_at);
  const morceaux = [origine, portee];
  if (c.started_at && Number.isFinite(secondes) && secondes > 0) {
    morceaux.push(tr('scanDetenteur.depuis').replace('{heure}', heure(secondes)));
  }
  return morceaux.join(' · ');
}

/**
 * Le refus 409 `already_scanning` d'un `POST /system/scan`, nommant le scan
 * qui tient le droit. `null` si l'erreur n'est pas ce refus, ou si le serveur
 * ne nomme personne (serveur plus ancien) : l'appelant garde alors sa phrase
 * générique.
 */
export function refusScanConcurrent(
  err: unknown,
  tr: Tr,
  heure: Heure = heureLocale,
): string | null {
  const e = err as { status?: number; corps?: Record<string, unknown> } | null;
  if (!e || e.status !== 409) return null;
  const corps = e.corps;
  if (!corps || corps.status !== 'already_scanning') return null;
  const scan = decrireScanCourant(corps.current, tr, heure);
  if (!scan) return null;
  return tr('scanDetenteur.refus409').replace('{scan}', scan);
}
