/**
 * #1751 — l'écran « État du serveur » sait LANCER un traitement, plus
 * seulement le suspendre.
 *
 * Tades (fil 2024) : « pourquoi ne pas pouvoir relancer l'enrichissement des
 * métadonnées depuis l'écran état du serveur alors que je peux relancer le
 * CLAP » ; Bertrand (fil 2043) : « rien de similaire pour le DR […] en un seul
 * clic relancer l'analyse et la recherche des différentes données […] :
 * Metadonnées, covers ».
 *
 * Le seul geste d'une carte était Pause / Reprendre, et il ne s'affichait que
 * si le traitement tournait ou était suspendu. Une carte au repos ou terminée
 * n'offrait RIEN, alors que les routes de lancement existent côté serveur :
 *
 *  - plage dynamique  : `POST /system/dynamic-range/analyze` (202 lancé,
 *    200 `nothing_to_do`, 409 `already_running`) — tune-server-rust#4185 ;
 *  - métadonnées      : `POST /library/enrich-all` — celle des Réglages ;
 *  - images d'artistes : `POST /library/artwork/enrich-artists` — idem.
 *
 * Les autres cartes n'ont pas de route « lancer tout de suite » : le scan a
 * son propre écran, le ReplayGain et l'analyse acoustique sont des passes de
 * fond qui reprennent seules, et l'empreinte AcoustID a son lancement à part.
 * Elles n'ont donc PAS de bouton — un bouton qui ne ferait rien n'a pas sa
 * place sur cet écran.
 */
import * as api from './api';

export type CarteLancable = 'dr' | 'enrich' | 'covers';

/** L'ordre du geste « Tout relancer » : celui du fil 2043. */
export const CARTES_LANCABLES: readonly CarteLancable[] = ['dr', 'enrich', 'covers'];

export function estLancable(id: string): id is CarteLancable {
  return (CARTES_LANCABLES as readonly string[]).includes(id);
}

/**
 * La carte porte-t-elle « Lancer » ?
 *
 * Seulement au repos ou terminée, et jamais suspendue : un traitement en
 * pause se REPREND (son bouton existe déjà), un traitement qui tourne ne se
 * relance pas, et un état inconnu ne promet rien.
 */
export function boutonLancer(c: { id: string; etat: string }, enPause: boolean): boolean {
  return estLancable(c.id) && !enPause && (c.etat === 'idle' || c.etat === 'done');
}

export type IssueLancement = 'lance' | 'rien' | 'deja';

/** Lit le `status` que rendent les trois routes. Tout autre succès = lancé. */
export function issueDe(statut: unknown): IssueLancement {
  if (statut === 'nothing_to_do' || statut === 'skipped') return 'rien';
  if (statut === 'already_running') return 'deja';
  return 'lance';
}

/** La phrase de chaque issue. */
export const CLE_ISSUE: Record<IssueLancement, string> = {
  lance: 'v2.health.launchStarted',
  rien: 'v2.health.launchNothing',
  deja: 'v2.health.launchAlready',
};

export interface RoutesLancement {
  dr: () => Promise<{ status?: string }>;
  enrich: () => Promise<{ status?: string }>;
  covers: () => Promise<{ status?: string }>;
}

const ROUTES: RoutesLancement = {
  dr: () => api.lancerPlageDynamique(),
  enrich: () => api.startBatchEnrich(),
  covers: () => api.enrichArtistImages(),
};

/** Lance UN traitement. Une erreur (refus, panne) remonte à l'appelant. */
export async function lancerTraitement(
  id: CarteLancable,
  routes: RoutesLancement = ROUTES,
): Promise<IssueLancement> {
  const r = await routes[id]();
  return issueDe(r?.status);
}

/**
 * « Tout relancer » : les trois, dans l'ordre, l'échec de l'un n'empêchant
 * pas les suivants. Ce qui tourne déjà n'est pas relancé (`enCours`).
 */
export async function lancerTout(
  enCours: ReadonlySet<CarteLancable>,
  routes: RoutesLancement = ROUTES,
): Promise<Record<CarteLancable, IssueLancement | 'erreur'>> {
  const out = {} as Record<CarteLancable, IssueLancement | 'erreur'>;
  for (const id of CARTES_LANCABLES) {
    if (enCours.has(id)) { out[id] = 'deja'; continue; }
    try {
      out[id] = await lancerTraitement(id, routes);
    } catch {
      out[id] = 'erreur';
    }
  }
  return out;
}

/**
 * tune-server-rust#6330 — Benjithom (fil 2270) : « malgré un appui sur le
 * bouton "Tout Relancer" […] le Replay Gain reste bloqué à 99 % et la Plage
 * Dynamique à 95 % ». Les deux étaient EN PAUSE, avec des pistes en échec de
 * mesure. Le bouton ne connaissait que les trois routes de lancement, écartait
 * ce qui était suspendu et ne touchait jamais au ReplayGain : il n'avait rien
 * à faire, et il ne l'a pas fait.
 *
 * « Tout relancer » fait désormais ce que le mot promet :
 *  1. `POST /system/background-tasks/relaunch-all` : le serveur REPREND tous
 *     les traitements suspendus, ReplayGain compris, et rend à la passe les
 *     pistes en échec (ReplayGain, plage dynamique) ;
 *  2. puis les trois lancements, pour ce qui était au repos.
 *
 * Un serveur d'avant #6330 ne connaît pas la route : on retombe sur
 * `resume-all`, qui reprend au moins tout ce qui est suspendu.
 */
export interface ReponseRelanceGenerale {
  /** Les traitements que le clic a repris (ils étaient suspendus). */
  resumed?: string[];
  /** Les pistes rendues à la passe, par passe. */
  retried?: { replaygain?: number; dynamic_range?: number; deferred?: number };
}

export interface RoutesToutRelancer extends RoutesLancement {
  relancerTout: () => Promise<ReponseRelanceGenerale>;
  reprendreTout: () => Promise<unknown>;
}

const ROUTES_TOUT: RoutesToutRelancer = {
  ...ROUTES,
  relancerTout: () => api.relaunchAllBackgroundTasks(),
  reprendreTout: () => api.resumeAllBackgroundTasks(),
};

export interface BilanToutRelancer {
  /** Traitements repris ; `null` quand le serveur ne sait pas le dire. */
  repris: number | null;
  /** Pistes en échec rendues à la passe ; `null` : serveur d'avant #6330. */
  pistes: number | null;
  lances: number;
  erreurs: number;
  lancements: Record<CarteLancable, IssueLancement | 'erreur'>;
}

/**
 * « Tout relancer ». `occupes` : les cartes lançables qui tournaient ou étaient
 * suspendues AVANT le clic — les secondes sont reprises par l'étape 1 et ne
 * doivent pas recevoir une seconde passe par l'étape 2.
 */
export async function toutRelancer(
  occupes: ReadonlySet<CarteLancable>,
  routes: RoutesToutRelancer = ROUTES_TOUT,
): Promise<BilanToutRelancer> {
  let repris: number | null = null;
  let pistes: number | null = null;
  let erreurs = 0;
  try {
    const r = await routes.relancerTout();
    repris = Array.isArray(r?.resumed) ? r.resumed.length : null;
    const t = r?.retried;
    if (t) pistes = (t.replaygain ?? 0) + (t.dynamic_range ?? 0) + (t.deferred ?? 0);
  } catch {
    try {
      await routes.reprendreTout();
    } catch {
      erreurs += 1;
    }
  }
  const lancements = await lancerTout(occupes, routes);
  const issues = Object.values(lancements);
  return {
    repris,
    pistes,
    lances: issues.filter((x) => x === 'lance').length,
    erreurs: erreurs + issues.filter((x) => x === 'erreur').length,
    lancements,
  };
}
