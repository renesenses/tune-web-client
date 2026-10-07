/**
 * La jauge « pistes TRAITÉES sur le TOTAL » des cartes Plage dynamique et
 * ReplayGain de l'écran Santé — décision du 06/10.
 *
 * Avant, la jauge retirait du DÉNOMINATEUR les pistes qu'aucune passe ne
 * mesurera (tune-server-rust#5834, fil 2157) : elle valait
 * `mesurées / (total − écartées)`. La règle est désormais :
 *
 *   pourcentage = (mesurées + déclarées non gérables) / total des pistes
 *
 * Le serveur compte lui-même les traitées, en une passe sur `tracks` :
 * chaque piste une seule fois, jamais au-dessus du total. Le client ne fait
 * donc pas la somme de compteurs qui peuvent se recouper.
 *
 * Non gérable : sans fichier propre (images CUE), mesure impossible (format
 * illisible, échec définitif), trop longue pour l'analyse, racine exclue des
 * analyses (tune-server-rust#5593).
 *
 * 🔴 Une piste REPORTÉE (fichier qui ne répond pas, report de six heures)
 * n'est PAS traitée : le serveur ne la compte pas, et elle reste dans ce qui
 * manque jusqu'à être mesurée ou déclarée non gérable. À l'expiration du
 * report, la passe la reprend.
 *
 * Face à un serveur qui ne publie pas le compteur des traitées, ces fonctions
 * rendent `null` et la carte garde son calcul d'avant.
 */

/** Les causes de non-gestion, dans l'ordre où la ligne les cite. */
export const CAUSES_NON_GEREES = ['withoutFile', 'unmeasurable', 'failed', 'oversized', 'outOfScope'] as const;
export type CauseNonGeree = (typeof CAUSES_NON_GEREES)[number];

export interface JaugeTraitees {
  /** Pistes traitées : mesurées, ou déclarées non gérables. */
  fait: number;
  /** Toutes les pistes de la bibliothèque. */
  total: number;
  /** Somme des causes citées. */
  nonGerees: number;
  /** Les causes non nulles, dans l'ordre de `CAUSES_NON_GEREES`. */
  causes: { cause: CauseNonGeree; n: number }[];
}

const entier = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null;

/** La jauge, ou `null` quand le serveur ne dit pas le total ou les traitées. */
export function jaugeTraitees(p: {
  total: unknown;
  traitees: unknown;
  causes: Partial<Record<CauseNonGeree, unknown>>;
}): JaugeTraitees | null {
  const total = entier(p.total);
  const traitees = entier(p.traitees);
  if (total === null || traitees === null) return null;
  const causes = CAUSES_NON_GEREES
    .map((cause) => ({ cause, n: entier(p.causes[cause]) ?? 0 }))
    .filter((c) => c.n > 0);
  return {
    fait: Math.min(traitees, total),
    total,
    nonGerees: causes.reduce((s, c) => s + c.n, 0),
    causes,
  };
}

/** Ce que publie `GET /library/stats/completeness` pour la plage dynamique. */
export function jaugeTraiteesPlageDynamique(c: {
  total_tracks?: unknown;
  dynamic_range_processed?: unknown;
  dynamic_range_unmeasurable?: unknown;
  dynamic_range_oversized?: unknown;
  dynamic_range_without_file?: unknown;
  dynamic_range_out_of_scope?: unknown;
} | null | undefined): JaugeTraitees | null {
  if (!c) return null;
  return jaugeTraitees({
    total: c.total_tracks,
    traitees: c.dynamic_range_processed,
    causes: {
      withoutFile: c.dynamic_range_without_file,
      unmeasurable: c.dynamic_range_unmeasurable,
      oversized: c.dynamic_range_oversized,
      outOfScope: c.dynamic_range_out_of_scope,
    },
  });
}

/** Ce que publie `GET /system/replaygain/progress` pour la bibliothèque. */
export function jaugeTraiteesReplayGain(a: {
  library_total?: unknown;
  library_processed?: unknown;
  library_without_file?: unknown;
  library_out_of_scope?: unknown;
  library_failed?: unknown;
} | null | undefined): JaugeTraitees | null {
  if (!a) return null;
  return jaugeTraitees({
    total: a.library_total,
    traitees: a.library_processed,
    causes: {
      withoutFile: a.library_without_file,
      failed: a.library_failed,
      outOfScope: a.library_out_of_scope,
    },
  });
}

/**
 * La ligne affichée à côté de la jauge, ou `undefined` quand rien n'est non
 * géré. Exemple : « 42 pistes non gérées : 30 sans fichier propre (images
 * CUE), 12 illisibles ou en échec de mesure. »
 *
 * @param t la fonction de traduction ; `nombre` formate un entier.
 */
export function ligneNonGerees(
  j: JaugeTraitees | null,
  t: (cle: string) => string,
  nombre: (n: number) => string,
): string | undefined {
  if (!j || j.nonGerees === 0) return undefined;
  const causes = j.causes
    .map((c) => t(`v2.health.unmanaged.${c.cause}`).replace('{n}', nombre(c.n)))
    .join(', ');
  return t('v2.health.unmanagedLine').replace('{n}', nombre(j.nonGerees)).replace('{causes}', causes);
}
