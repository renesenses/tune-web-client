/**
 * Lot 2 de l'enrichissement d'après MetaRust, de Xavier Joly
 * (tune-server-rust#4805) : les deux passes de lot, lancées à la main depuis
 * Réglages ▸ Enrichissement.
 *
 * - `POST /library/bpm-all` : BPM de tous les albums locaux (Wikidata, puis le
 *   signal) ; `GET /library/bpm-all/status`.
 * - `POST /library/discogs-all` : propositions Discogs pour les albums sans
 *   identifiant MusicBrainz ; `GET /library/discogs-all/status`.
 *
 * Les deux se suspendent par la tâche de fond `enrichment`
 * (`POST /system/background-tasks/enrichment/pause|resume`) : la passe se gare
 * entre deux albums et repart au même endroit.
 *
 * Fonctions pures : aucun réseau, testées dans `__tests__/passesMetarust4805.test.ts`.
 */

export type ModePasse = 'bpm' | 'discogs';

export type StatutPasse = 'idle' | 'running' | 'done' | 'stopped' | 'interrupted';

/** L'état d'une passe, tel que `GET /library/{mode}-all/status` le rend. */
export interface EtatPasseLot {
  status: StatutPasse;
  mode: ModePasse;
  total: number;
  traites: number;
  dernier_album_id?: number;
  compte: Record<string, number>;
  annonce: Record<string, number>;
  raison: string | null;
  en_pause: boolean;
}

type Traduire = (cle: string) => string;

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function nombres(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, n(x)]),
  );
}

const STATUTS: StatutPasse[] = ['idle', 'running', 'done', 'stopped', 'interrupted'];

/** Lit un état reçu, en comblant ce qui manque (serveur plus ancien). */
export function lireEtatPasse(corps: unknown, mode: ModePasse): EtatPasseLot {
  const c = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  const status = STATUTS.includes(c.status as StatutPasse) ? (c.status as StatutPasse) : 'idle';
  return {
    status,
    mode,
    total: n(c.total),
    traites: n(c.traites),
    dernier_album_id: n(c.dernier_album_id),
    compte: nombres(c.compte),
    annonce: nombres(c.annonce),
    raison: typeof c.raison === 'string' ? c.raison : null,
    en_pause: c.en_pause === true,
  };
}

/** La passe tourne-t-elle (garée comprise) ? */
export function enCours(e: EtatPasseLot): boolean {
  return e.status === 'running';
}

/** Pourcentage d'avancement, 0 à 100. */
export function pourcentage(e: EtatPasseLot): number {
  if (e.total <= 0) return e.status === 'done' ? 100 : 0;
  return Math.min(100, Math.round((e.traites / e.total) * 100));
}

/** Remplit `{cle}` dans une phrase. */
function remplir(phrase: string, valeurs: Record<string, number | string>): string {
  return phrase.replace(/\{(\w+)\}/g, (m, k) => (k in valeurs ? String(valeurs[k]) : m));
}

/** La raison d'un arrêt, en clair. */
export function phraseDeLaRaison(raison: string | null, tr: Traduire): string {
  switch (raison) {
    case 'discogs_injoignable':
      return tr('v2.passes.stopUnreachable');
    case 'discogs_jeton_refuse':
      return tr('v2.passes.stopTokenRefused');
    default:
      return raison ? tr('v2.passes.stopOther') : '';
  }
}

/**
 * La ligne d'état sous le bouton. `fmt` formate un nombre dans la langue de
 * l'interface.
 */
export function ligneDEtat(e: EtatPasseLot, tr: Traduire, fmt: (x: number) => string = String): string {
  const c = e.compte;
  const bilan =
    e.mode === 'bpm'
      ? remplir(tr('v2.passes.bpmTally'), {
          wikidata: fmt(c.pistes_wikidata ?? 0),
          signal: fmt(c.pistes_signal ?? 0),
          none: fmt(c.pistes_sans_resultat ?? 0),
        })
      : remplir(tr('v2.passes.discogsTally'), {
          found: fmt(c.propositions ?? 0),
          none: fmt(c.sans_resultat ?? 0),
        });
  const avancement = remplir(tr('v2.passes.progress'), { n: fmt(e.traites), total: fmt(e.total) });
  switch (e.status) {
    case 'running':
      return `${e.en_pause ? tr('v2.passes.paused') : avancement} · ${bilan}`;
    case 'done':
      return e.total === 0 ? tr('v2.passes.nothing') : `${tr('v2.passes.done')} · ${bilan}`;
    case 'stopped':
      return `${phraseDeLaRaison(e.raison, tr)} ${avancement} · ${bilan}`.trim();
    case 'interrupted':
      return `${tr('v2.passes.interrupted')} ${avancement}`;
    default:
      return '';
  }
}

/** Ce que l'écran fait de la réponse du lancement. */
export type IssueLancementPasse =
  | { genre: 'lance'; total: number; sansCode: number; dureeS: number }
  | { genre: 'refuse'; phrase: string };

/**
 * Lit la réponse de `POST /library/{mode}-all` : `202`, ou `409`
 * (`enrichissement_en_pause`, `passe_deja_en_cours`) et `412`
 * (`discogs_token_absent`), acceptés par l'appel pour que l'écran dise le motif.
 */
export function issueDuLancementPasse(corps: unknown, tr: Traduire): IssueLancementPasse {
  const c = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  if (c.status === 'started') {
    const annonce = nombres(c.annonce);
    return {
      genre: 'lance',
      total: n(c.total),
      sansCode: annonce.albums_sans_code ?? 0,
      dureeS: n(c.duree_estimee_s),
    };
  }
  const code = typeof c.code === 'string' ? c.code : '';
  const phrase =
    code === 'enrichissement_en_pause'
      ? tr('v2.passes.refusedPaused')
      : code === 'passe_deja_en_cours'
        ? tr('v2.passes.refusedRunning')
        : code === 'discogs_token_absent'
          ? tr('v2.discogs.noToken')
          : tr('settings.errStartFailed');
  return { genre: 'refuse', phrase };
}
