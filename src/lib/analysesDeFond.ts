import { writable, get } from 'svelte/store';

/**
 * L'avancement des analyses qui suivent le scan — tune-server-rust#7915.
 *
 * Sur un NAS lent, le premier scan finissait en 2 h, puis le processeur
 * restait haut toute la nuit : les empreintes et la plage dynamique
 * décodaient toute la bibliothèque. L'indicateur de la barre latérale
 * (`analyseBibliotheque`, #1577) disparaissait à la fin du scan, juste au
 * moment où ces passes commençaient, et rien ne disait ce qui tournait.
 *
 * Le serveur publie désormais leur avancement de deux façons :
 *  - l'événement `library.analysis.progress` (`task`, `processed`, `total`,
 *    `eta_seconds`, `active`), à la cadence du scan ;
 *  - `progress` sur chaque entrée `pausable[]` de
 *    `GET /system/background-tasks`, que la barre lit déjà à l'ouverture.
 *
 * Un serveur antérieur n'envoie ni l'un ni l'autre : l'état reste `null` et
 * la barre se tait, comme avant.
 */
export interface AnalyseDeFond {
  /** `fingerprints` | `dynamic_range` | `replaygain` — `Tache::id` du serveur. */
  tache: string;
  traitees: number;
  total: number;
  /** Secondes restantes estimées par le serveur ; `null` : pas encore d'estimation. */
  resteSecondes: number | null;
}

export const analyseDeFond = writable<AnalyseDeFond | null>(null);

const nombre = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

function depuisAvancement(tache: string, p: any): AnalyseDeFond | null {
  if (!p || typeof p !== 'object') return null;
  const total = nombre(p.total);
  const traitees = nombre(p.processed);
  if (total <= 0 || traitees >= total) return null;
  const eta = p.eta_seconds;
  return {
    tache,
    traitees,
    total,
    resteSecondes: typeof eta === 'number' && Number.isFinite(eta) ? eta : null,
  };
}

/**
 * L'état qui suit un `library.analysis.progress`. Une passe qui se ferme
 * (`active: false`) n'efface que SA ligne : une autre passe a pu prendre la
 * suite entre-temps.
 */
export function fusionnerAnalyseDeFond(
  courant: AnalyseDeFond | null,
  data: any,
): AnalyseDeFond | null {
  const tache = typeof data?.task === 'string' ? data.task : null;
  if (!tache) return courant;
  if (data.active === false) {
    return courant && courant.tache === tache ? null : courant;
  }
  return depuisAvancement(tache, data) ?? (courant?.tache === tache ? null : courant);
}

/** L'analyse en cours d'après `GET /system/background-tasks`, ou `null`. */
export function depuisInstantane(instantane: any): AnalyseDeFond | null {
  for (const p of instantane?.pausable ?? []) {
    if (p?.state !== 'en_cours' || p?.paused) continue;
    const a = depuisAvancement(String(p.id ?? ''), p.progress);
    if (a && a.tache) return a;
  }
  return null;
}

/** Le pourcentage traité, arrondi vers le bas, borné à 0-100. */
export function pourcentAnalyseDeFond(a: AnalyseDeFond): number {
  return Math.max(0, Math.min(100, Math.floor((a.traitees / a.total) * 100)));
}

/**
 * Une durée lisible et sans fausse précision : « 45 min », « 2 h 05 »,
 * « 1 min » en dessous d'une minute.
 */
export function dureeLisible(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (m === 60) return `${h + 1} h`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/**
 * Le libellé de la barre : « Empreintes audio — 35 % · encore 2 h 05 ».
 * `t` est la fonction de traduction, injectée pour tester sans rendu.
 */
export function libelleAnalyseDeFond(
  a: AnalyseDeFond | null,
  t: (cle: string) => string,
): string | null {
  if (!a) return null;
  const cleNom = `v2.nav.bgTask.${a.tache}`;
  const traduit = t(cleNom);
  const nom = traduit && traduit !== cleNom ? traduit : t('v2.nav.bgTask.other');
  let libelle = t('v2.nav.bgAnalysisPct')
    .replace('{task}', nom)
    .replace('{p}', String(pourcentAnalyseDeFond(a)));
  if (a.resteSecondes !== null && a.resteSecondes > 0) {
    libelle += ' · ' + t('v2.nav.bgAnalysisEta').replace('{d}', dureeLisible(a.resteSecondes));
  }
  return libelle;
}

/** Brancher l'état sur le flux d'événements. Rend le désabonnement. */
export function abonnerAnalysesDeFond(
  onEvent: (h: (e: { type?: string; data?: any }) => void) => () => void,
): () => void {
  return onEvent((event) => {
    if (event?.type === 'library.analysis.progress') {
      analyseDeFond.update((a) => fusionnerAnalyseDeFond(a, event.data));
    }
  });
}

/** Pour les tests : l'état courant sans abonnement. */
export const lireAnalyseDeFond = () => get(analyseDeFond);
