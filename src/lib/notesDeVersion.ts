/**
 * « Quoi de neuf » — lecture de `GET /system/changelog`, sans composant.
 *
 * Reprise telle quelle de l'ancien `WhatsNew.svelte` (que la phase 5
 * supprime), sortie en module PUR pour que la v2 l'affiche et qu'un témoin
 * puisse la vérifier sans monter d'écran.
 *
 * Contrat serveur (`routes/system/update.rs`, `changelog`) :
 * `{ version, lang, fallback, entries: [{ version, date, sections|features… , fallback }] }`,
 * ou le jeu de SECOURS figé avec `offline: true` quand la source des notes est
 * injoignable.
 */

export interface NoteDeVersion {
  version: string;
  date: string;
  features: string[];
  fixes: string[];
  improvements: string[];
}

export interface NotesDeVersion {
  entrees: NoteDeVersion[];
  /**
   * Jeu de secours, figé et ancien : aucune entrée ne doit alors être
   * présentée comme « récente » ni comme la version qui tourne.
   */
  horsLigne: boolean;
  /** Le serveur n'avait pas les notes dans la langue demandée (#906). */
  nonTraduites: boolean;
  /** Version du serveur, quand la réponse la porte. */
  versionServeur: string | null;
}

function chaines(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function lireNotesDeVersion(data: unknown): NotesDeVersion {
  const d = (data ?? {}) as Record<string, unknown>;
  const horsLigne = d.offline === true;
  const brutes = Array.isArray(d.entries) ? d.entries : Array.isArray(data) ? (data as unknown[]) : [];
  const nonTraduites = d.fallback === true || brutes.some((e) => (e as { fallback?: unknown })?.fallback === true);
  const entrees = brutes
    .map((brute): NoteDeVersion => {
      const e = (brute ?? {}) as Record<string, unknown>;
      if (e.features || e.fixes || e.improvements) {
        return {
          version: String(e.version ?? ''),
          date: String(e.date ?? ''),
          features: chaines(e.features),
          fixes: chaines(e.fixes),
          improvements: chaines(e.improvements),
        };
      }
      const sections = Array.isArray(e.sections) ? (e.sections as { title?: unknown; items?: unknown }[]) : [];
      const trouver = (titres: string[]) =>
        chaines(sections.find((s) => titres.some((t) => String(s?.title ?? '').toLowerCase().includes(t)))?.items);
      return {
        version: String(e.version ?? ''),
        date: String(e.date ?? ''),
        features: trouver(['nouveaut', 'feature', 'new']),
        fixes: trouver(['correction', 'fix', 'bug']),
        improvements: trouver(['amélioration', 'improvement', 'perf', 'optim']),
      };
    })
    .filter((e) => e.version);
  return {
    entrees,
    horsLigne,
    nonTraduites,
    versionServeur: typeof d.version === 'string' && d.version ? d.version : null,
  };
}
