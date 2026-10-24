/**
 * tune-server-rust#4201 — l'état de la bibliothèque UPnP unifiée, lu dans
 * `GET /library/stats` (champ additif `upnp_import`, PR serveur #4944).
 *
 * Le serveur porte depuis la v0.9.165 le dernier bilan PERSISTÉ de chaque
 * source synchronisée : complet ou non, pourquoi, compteurs. Aucun écran ne
 * le lisait, si bien que le critère « état consultable après navigation ou
 * redémarrage : dernier bilan, erreur et comptes » restait ouvert pour
 * l'utilisateur. Rien n'est recalculé ici : on lit le bilan tel quel.
 *
 * Un serveur plus ancien n'envoie pas le champ, une erreur de lecture côté
 * serveur l'envoie à `null`, et sans source synchronisée il n'y a rien à
 * dire : dans ces trois cas, `etatImportUpnpDe` rend `null` et l'écran ne
 * montre rien.
 */

export interface SourceImportUpnp {
  key: string;
  name: string;
  status?: string;
  last_attempt?: number | null;
  last_success?: number | null;
  complet: boolean;
  raison?: string | null;
  erreurs?: number;
  paginations_interrompues?: number;
  pistes_distinctes?: number | null;
}

export interface EtatImportUpnp {
  sources: number;
  complet: boolean | null;
  sources_incompletes?: number;
  erreurs?: number;
  pistes_distinctes?: number;
  par_source: SourceImportUpnp[];
}

/** Le champ `upnp_import` de `/library/stats`, s'il y a quelque chose à montrer. */
export function etatImportUpnpDe(stats: unknown): EtatImportUpnp | null {
  const brut = (stats as { upnp_import?: unknown } | null | undefined)?.upnp_import;
  if (!brut || typeof brut !== 'object') return null;
  const e = brut as Partial<EtatImportUpnp>;
  if (!Array.isArray(e.par_source) || !e.par_source.length) return null;
  return {
    sources: typeof e.sources === 'number' ? e.sources : e.par_source.length,
    complet: typeof e.complet === 'boolean' ? e.complet : null,
    sources_incompletes: e.sources_incompletes ?? 0,
    erreurs: e.erreurs ?? 0,
    pistes_distinctes: e.pistes_distinctes ?? 0,
    par_source: e.par_source,
  };
}

/** La date d'une synchronisation (secondes Unix), ou `null` si jamais réussie. */
export function dateDeSynchro(secondes: number | null | undefined, langue?: string): string | null {
  if (typeof secondes !== 'number' || !Number.isFinite(secondes) || secondes <= 0) return null;
  return new Date(secondes * 1000).toLocaleString(langue, { dateStyle: 'medium', timeStyle: 'short' });
}
