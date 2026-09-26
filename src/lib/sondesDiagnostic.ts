/**
 * Sondes de Support › Diagnostic — ce qu'on a VRAIMENT observé (#5086).
 *
 * Sevy (0.9.163, macOS, fil 1911) lit « Serveur : injoignable » et « Base de
 * données : injoignable » pendant que le serveur sert. L'écran rabattait
 * TOUT échec sur `null`, puis `null` sur « injoignable » : une sonde qui
 * dépasse ses 8 s, un 500 et une connexion refusée disaient la même chose,
 * et seule la dernière est vraiment « injoignable ». Côté serveur, les quatre
 * routes attendaient l'écrivain SQLite (corrigé dans le lot
 * `batch/diagnostic-support-faux-negatif-20260926`) : c'est précisément le
 * cas « délai dépassé », que l'écran travestissait en panne réseau.
 *
 * Module PUR : il reçoit la promesse, rend une issue nommée.
 */

export type IssueSonde<T> =
  | { etat: 'ok'; valeur: T }
  /** Aucune réponse dans le délai : le serveur peut très bien être là. */
  | { etat: 'delai' }
  /** Le serveur a RÉPONDU, par un statut d'erreur. */
  | { etat: 'http'; statut: number }
  /** Pas de réponse HTTP du tout : réseau, connexion refusée. */
  | { etat: 'injoignable' };

export async function sonder<T>(promesse: Promise<T>, ms: number): Promise<IssueSonde<T>> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<IssueSonde<T>>((r) => {
    minuterie = setTimeout(() => r({ etat: 'delai' }), ms);
  });
  // Le rejet est traité ICI, même s'il arrive après le délai : sinon il
  // remonterait en « unhandled rejection ».
  const reponse = promesse.then(
    (valeur): IssueSonde<T> => ({ etat: 'ok', valeur }),
    (e: unknown): IssueSonde<T> => {
      const statut = (e as { status?: unknown } | null)?.status;
      return typeof statut === 'number' && statut > 0
        ? { etat: 'http', statut }
        : { etat: 'injoignable' };
    },
  );
  try {
    return await Promise.race([reponse, delai]);
  } finally {
    clearTimeout(minuterie);
  }
}

/** La valeur d'une sonde réussie, `null` sinon. */
export function valeurDe<T>(issue: IssueSonde<T> | null): T | null {
  return issue?.etat === 'ok' ? issue.valeur : null;
}

/**
 * Clé i18n et variables du libellé d'une sonde en ÉCHEC, `null` si elle a
 * réussi. Une seule table pour les deux lignes qui en ont besoin.
 */
export function libelleEchec(
  issue: IssueSonde<unknown> | null,
): { cle: string; vars?: Record<string, number> } | null {
  switch (issue?.etat) {
    case 'ok':
      return null;
    case 'delai':
      return { cle: 'v2.sup.diagTimeout' };
    case 'http':
      return { cle: 'v2.sup.diagHttpError', vars: { status: issue.statut } };
    default:
      return { cle: 'v2.sup.diagUnreachable' };
  }
}

/**
 * Espace disque libre lu dans `GET /system/admin/health`.
 *
 * Le serveur rend `disk_free_gb` (un nombre, ou `null` quand il ne sait pas
 * mesurer) — c'est aussi ce que déclare `AdminHealth`. L'écran lisait
 * `disk.free_human` puis `disk_free`, deux champs que le serveur n'a jamais
 * servis : la ligne affichait « — » sur TOUS les serveurs.
 */
export function espaceLibre(sante: { disk_free_gb?: number | null } | null, langue: string): string | null {
  const go = sante?.disk_free_gb;
  if (typeof go !== 'number' || !Number.isFinite(go)) return null;
  // L'unité suit la langue : « 12,3 Go » en français, « 12.3 GB » en anglais.
  return new Intl.NumberFormat(langue, { style: 'unit', unit: 'gigabyte', maximumFractionDigits: 1 }).format(go);
}
