/**
 * La carte « Plage dynamique » de l'écran Santé : son état et ses deux stocks.
 *
 * tune-web-client#1828 (Tades, 0.9.168, 517 356 pistes) : la carte disait
 * « AU REPOS » pendant que le rattrapage travaillait, et annonçait
 * « 409 846 pistes en attente. La plage dynamique passe en premier, avant le
 * ReplayGain » alors que la plupart de ces pistes n'étaient PAS dans le
 * rattrapage.
 *
 * Deux défauts, deux décisions, écrites ici pour se garder sans monter l'écran :
 *
 * 1. **L'état.** La carte n'avait pas d'état « en cours » : tant qu'il restait
 *    des pistes, elle disait « au repos ». Le serveur publie pourtant l'état du
 *    traitement `dynamic_range` dans `GET /system/background-tasks`
 *    (`pausable[].state`, serveur ≥ 0.9.159) : `en_cours` quand la mesure à la
 *    demande, la cascade de fond ou le rattrapage des `foo_dr.txt` tourne. La
 *    cascade compte : la passe ReplayGain mesure la plage dynamique des pistes
 *    qu'elle décode, sur le même décodage.
 *
 * 2. **Les deux stocks.** ReplayGain armé, le rattrapage ne prend QUE les
 *    pistes déjà vues par le ReplayGain (serveur, `TEMOIN_RG_DR`) ; les autres
 *    recevront leur plage dynamique de la passe ReplayGain elle-même. Le
 *    serveur compte le premier stock (`GET /system/dynamic-range/progress`,
 *    `candidates`, ou `remaining` pendant une mesure à la demande). Le second
 *    est ce qui reste. L'ordre de passage choisi ne règle que le premier : le
 *    promettre sur le total était faux.
 */

/** Ce que rend `GET /system/dynamic-range/progress` (serveur #4185). Tous les
 *  champs sont optionnels : un serveur inconnu peut répondre n'importe quoi. */
export interface AvancementPlageDynamique {
  active?: boolean;
  processed?: number;
  total?: number;
  remaining?: number;
  /** Compté par le serveur seulement hors mesure à la demande ; `null` sinon. */
  candidates?: number | null;
  /** La plage dynamique peut-elle tourner. Toujours `true` depuis
   *  tune-server-rust#5246 : elle ne dépend plus du réglage ReplayGain. */
  enabled?: boolean;
}

/**
 * La plage dynamique tourne-t-elle, selon le serveur ? `null` quand il ne le
 * dit pas (route absente) : l'appelant garde alors l'ancienne règle, le
 * réglage ReplayGain.
 *
 * Défaut voisin de tune-web-client#1828 : la carte se disait « éteinte »
 * ReplayGain coupé, alors que depuis tune-server-rust#5246 la plage dynamique
 * se mesure quand même.
 */
export function drActiveSelonServeur(
  av: AvancementPlageDynamique | null | undefined,
): boolean | null {
  return typeof av?.enabled === 'boolean' ? av.enabled : null;
}

export type EtatCartePlageDynamique = 'idle' | 'running' | 'done' | 'off';

/**
 * L'état de la carte.
 *
 * @param etatServeur `pausable[].state` du traitement `dynamic_range`, ou
 *   `undefined` quand le serveur ne le publie pas (≤ 0.9.158) — la carte garde
 *   alors l'ancien comportement, « au repos » tant qu'il reste des pistes.
 */
export function etatCartePlageDynamique(p: {
  analyseActive: boolean;
  restantes: number;
  reportees: number;
  etatServeur: string | undefined;
}): EtatCartePlageDynamique {
  if (!p.analyseActive) return 'off';
  if (p.restantes === 0 && p.reportees === 0) return 'done';
  if (p.etatServeur === 'en_cours') return 'running';
  return 'idle';
}

/** Le traitement `dynamic_range` tel que le publie l'instantané, ou `undefined`. */
export function etatServeurPlageDynamique(
  instantane: { pausable?: { id?: unknown; state?: unknown }[] } | null | undefined,
): string | undefined {
  const t = instantane?.pausable?.find((x) => x?.id === 'dynamic_range');
  return typeof t?.state === 'string' ? t.state : undefined;
}

const entier = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;

/** Le stock du rattrapage selon le serveur, ou `null` s'il ne le dit pas. */
export function stockDuRattrapage(
  av: AvancementPlageDynamique | null | undefined,
): number | null {
  if (!av) return null;
  if (av.active) return entier(av.remaining);
  return entier(av.candidates);
}

export interface StocksPlageDynamique {
  /** Pistes que le rattrapage prendra, dans l'ordre de passage choisi. */
  rattrapage: number;
  /** Pistes que la passe ReplayGain mesurera en les décodant. `0` quand le
   *  ReplayGain est coupé : le rattrapage prend alors tout. */
  parLeReplayGain: number;
}

/**
 * Séparer les pistes sans plage dynamique en deux stocks, ou `null` quand le
 * serveur ne compte pas le rattrapage — la carte garde alors son message
 * d'origine, sur le seul total qu'elle connaisse.
 */
export function stocksPlageDynamique(p: {
  restantes: number;
  rattrapage: number | null;
  replayGainArme: boolean;
}): StocksPlageDynamique | null {
  if (p.rattrapage === null) return null;
  if (!p.replayGainArme) return { rattrapage: p.restantes, parLeReplayGain: 0 };
  const rattrapage = Math.min(p.rattrapage, p.restantes);
  return { rattrapage, parLeReplayGain: Math.max(0, p.restantes - rattrapage) };
}

/**
 * La JAUGE de la carte : sur quoi elle se mesure.
 *
 * 🔴 tune-server-rust#5834 (fil 2157, « Analyse plage dynamique reste bloquée
 * à 97 % ») : la jauge valait `with_dynamic_range / total_tracks`. Les pistes
 * qu'aucune passe ne mesurera jamais restaient au dénominateur : écartées pour
 * de bon (`dynamic_range_unavailable`), trop longues pour le budget de
 * l'analyse (`dynamic_range_oversized`), sans fichier propre (images CUE,
 * `dynamic_range_without_file`). Une seule suffisait pour que la jauge ne
 * finisse jamais, et la carte ne disait pas pourquoi.
 *
 * Le dénominateur est donc ce qui PEUT se mesurer. Les pistes REPORTÉES
 * (fichier qui ne répond pas, #4254) y restent : elles seront reprises, et la
 * jauge qui n'atteint pas 100 % dit vrai tant qu'elles manquent.
 *
 * `fait` n'est jamais au-dessus du total : une piste peut porter un DR (tag,
 * `foo_dr.txt`) ET une marque d'écart, et le serveur ne déduplique pas
 * `dynamic_range_unavailable`.
 */
export interface JaugePlageDynamique {
  fait: number;
  total: number;
  /** Pistes retirées du dénominateur, toutes causes confondues. */
  exclues: number;
}

export function jaugePlageDynamique(p: {
  total: number;
  avec: number;
  ecartees: number;
  tropLongues: number;
  sansFichier: number;
}): JaugePlageDynamique {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const total = n(p.total);
  const avec = Math.min(n(p.avec), total);
  const exclues = n(p.ecartees) + n(p.tropLongues) + n(p.sansFichier);
  return { fait: avec, total: Math.max(avec, total - exclues), exclues };
}
