/**
 * Identification par empreinte acoustique (AcoustID) — suite web de
 * renesenses/tune-server-rust#5868 (passe « à la Picard », #4805 idée 4).
 *
 * Le serveur publie trois choses, et ce module est le seul à les lire :
 *
 * 1. Le bloc `acoustid` de `GET /system/background-tasks` : la passe
 *    peut-elle tourner (`available`), et sinon pourquoi (`reason` :
 *    `fpcalc_absent`, `acoustid_cle_absente`) avec un `message`.
 * 2. L'état de la passe dans `GET /library/identify-all/status`, partagé avec
 *    les deux autres modes : on ne le lit que quand `mode === 'acoustid'`.
 * 3. La réponse de `POST /library/identify-all?mode=acoustid` : `202` et
 *    `status: 'started'`, ou `409` avec `code` et `message`.
 *
 * 🔴 Un serveur ANTÉRIEUR à #5868 n'envoie pas le bloc. Tout ce module rend
 * alors `null`, et l'écran n'affiche ni carte, ni bouton, ni champ de clé :
 * un bouton qui rendrait `400 mode_inconnu` est pire que pas de bouton.
 *
 * Les messages du serveur sont en français. L'écran dit le motif dans SA
 * langue quand il le connaît, et ne retombe sur le message du serveur que
 * pour un motif inconnu de ce client.
 */

/** Le bloc `acoustid` de l'instantané des tâches de fond. */
export type BlocAcoustid = {
  available: boolean;
  fpcalc?: boolean;
  api_key_configured?: boolean;
  reason?: string | null;
  message?: string;
  setting_key?: string;
};

/** L'état de la passe par lot, tel que `GET /library/identify-all/status` le rend. */
export type EtatLotIdentification = {
  status?: string;
  mode?: string;
  total?: number;
  traites?: number;
  identifies?: number;
  sans_majorite?: number;
  raison?: string | null;
  en_pause?: boolean;
};

/** Le réglage serveur qui porte la clé, si le serveur ne le nomme pas. */
export const REGLAGE_CLE_ACOUSTID = 'acoustid_api_key';

/** Le nom du service — un nom propre, le même dans les onze langues. */
export const NOM_ACOUSTID = 'AcoustID';

/** Le mode de `POST /library/identify-all`. */
export const MODE_ACOUSTID = 'acoustid';

/** Les motifs que ce client sait dire dans la langue de l'écran. */
export const LIBELLES_MOTIF: Record<string, string> = {
  fpcalc_absent: 'acoustid.reasonFpcalc',
  acoustid_cle_absente: 'acoustid.reasonKey',
  identification_en_pause: 'acoustid.reasonPaused',
  identification_deja_en_cours: 'acoustid.reasonAlreadyRunning',
};

type Traduire = (cle: string) => string;

/** Le bloc, ou `null` quand le serveur ne le publie pas (antérieur à #5868). */
export function lireBlocAcoustid(instantane: unknown): BlocAcoustid | null {
  if (!instantane || typeof instantane !== 'object') return null;
  const b = (instantane as Record<string, unknown>).acoustid;
  if (!b || typeof b !== 'object') return null;
  const bloc = b as Record<string, unknown>;
  if (typeof bloc.available !== 'boolean') return null;
  return bloc as unknown as BlocAcoustid;
}

/** Le nom du réglage de la clé : celui que le serveur annonce, sinon le défaut. */
export function reglageCle(bloc: BlocAcoustid | null): string {
  const k = bloc?.setting_key;
  return typeof k === 'string' && k.trim() ? k : REGLAGE_CLE_ACOUSTID;
}

/** Le motif dit dans la langue de l'écran ; le message du serveur pour un motif inconnu. */
export function phraseDuMotif(
  code: string | null | undefined,
  messageServeur: string | null | undefined,
  tr: Traduire,
): string {
  const cle = code ? LIBELLES_MOTIF[code] : undefined;
  if (cle) return tr(cle);
  if (messageServeur && messageServeur.trim()) return messageServeur;
  return code ?? '';
}

export type CarteAcoustid = {
  etat: 'idle' | 'running' | 'done' | 'off';
  ligne: string;
  fait?: number;
  total?: number;
  /** Le motif brut du serveur, affiché tel quel sous la phrase. */
  motif?: string;
};

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * La carte de l'écran Santé. `null` sans bloc : pas de carte.
 *
 * Une passe `acoustid` en cours, en pause, arrêtée ou terminée passe AVANT la
 * disponibilité : c'est ce qu'on vient chercher sur l'écran. L'état d'une
 * passe d'un autre mode (`identification`, `labels`) n'est pas le nôtre.
 */
export function carteAcoustid(
  bloc: BlocAcoustid | null,
  lot: EtatLotIdentification | null,
  tr: Traduire,
  nombre: (x: number) => string = String,
): CarteAcoustid | null {
  if (!bloc) return null;
  const notre = lot && lot.mode === MODE_ACOUSTID ? lot : null;
  const total = n(notre?.total);
  const traites = n(notre?.traites);
  const remplir = (cle: string) =>
    tr(cle)
      .replace('{n}', nombre(traites))
      .replace('{total}', nombre(total))
      .replace('{ok}', nombre(n(notre?.identifies)))
      .replace('{sans}', nombre(n(notre?.sans_majorite)));
  if (notre?.status === 'running') {
    return { etat: 'running', ligne: remplir('acoustid.running'), fait: traites, total };
  }
  if (notre?.status === 'paused') {
    return { etat: 'idle', ligne: remplir('acoustid.paused'), fait: traites, total };
  }
  if (notre?.status === 'stopped') {
    return {
      etat: 'idle',
      ligne: remplir('acoustid.stopped'),
      fait: traites,
      total,
      motif: notre.raison ?? undefined,
    };
  }
  if (!bloc.available) {
    return {
      etat: 'off',
      ligne: phraseDuMotif(bloc.reason, bloc.message, tr),
      motif: bloc.reason ?? undefined,
    };
  }
  if (notre?.status === 'done') {
    return { etat: 'done', ligne: remplir('acoustid.done') };
  }
  return { etat: 'idle', ligne: tr('acoustid.available') };
}

/** Ce que l'écran fait de la réponse du lancement. */
export type IssueLancement =
  | { genre: 'lance'; total: number }
  | { genre: 'refuse'; code: string; phrase: string };

/**
 * Lit la réponse de `POST /library/identify-all?mode=acoustid`, `202` ou
 * `409` (les deux sont acceptés par l'appel, voir `api.lancerIdentificationAcoustid`).
 */
export function issueDuLancement(corps: unknown, tr: Traduire): IssueLancement {
  const c = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  if (c.status === 'started') return { genre: 'lance', total: n(c.total) };
  const code = typeof c.code === 'string' ? c.code : typeof c.error === 'string' ? c.error : '';
  const message = typeof c.message === 'string' ? c.message : null;
  return { genre: 'refuse', code, phrase: phraseDuMotif(code, message, tr) || tr('settings.errStartFailed') };
}
