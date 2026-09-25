/**
 * L'HISTORIQUE LOCAL DES ÉCOUTES — et la coquille qui ne l'écrivait pas.
 *
 * ## Le signalement
 *
 * **Reivax66**, fil forum « Historique radio », 08/09/2026, Tune 0.9.141 :
 *
 *   « Les morceaux écoutés avec les radios live ne figurent plus dans
 *     l'historique depuis le 06/09/2026. »
 *
 * ## Pourquoi la RADIO, et elle seule
 *
 * L'écran d'historique montre la FUSION de deux sources (`fusionnerHistorique`) :
 *
 *   • le serveur — `/library/history`, alimenté par `listen_history` ;
 *   • le magasin local — `stores/history`, alimenté par le client.
 *
 * Le serveur n'écrit pas la radio dans `listen_history` : une écoute y est
 * indexée sur un identifiant de `tracks`, et un titre entendu à la radio n'en a
 * pas. La radio ne tenait donc QUE par le magasin local.
 *
 * Et le magasin local n'avait qu'un seul écrivain : `App.svelte`, ligne 1317.
 * `?v2` monte `ShellV2` À LA PLACE d'`App` — jamais les deux. Sur la nouvelle
 * interface, personne n'écrivait plus rien.
 *
 * D'où la forme exacte du symptôme : les pistes LOCALES restent à l'écran,
 * puisque le serveur les sert ; la radio disparaît. Écrit, mais pas branché —
 * la même famille que l'annonce de mise à jour, les raccourcis clavier et
 * l'historique du navigateur, tous trois retrouvés dans `App` et absents de la
 * nouvelle coquille.
 *
 * ## Pourquoi un module
 *
 * Parce qu'une garde écrite contre une coquille ne peut que lire son texte, et
 * qu'un texte présent ne prouve pas qu'il s'exécute. Ici la règle est PURE et
 * l'écriture INJECTÉE : la garde fournit le carnet et regarde ce qu'on y pose.
 *
 * Et parce que les DEUX coquilles doivent tenir la même règle. La recopier
 * dans la seconde, c'était accepter qu'elles divergent au premier correctif —
 * ce qui est précisément ce qui vient de se passer.
 */
import type { Track } from './types';

/**
 * Ce qu'une zone doit porter pour qu'on sache quoi noter.
 *
 * 🔴 `group_id` est une CHAÎNE dans `types.Zone`, pas un nombre — relevé par
 * `check-svelte` le 13/09/2026, la première version de ce module l'avait écrit
 * `number`. La comparaison d'égalité vaut pour les deux, mais le type ment
 * jusqu'à ce qu'on essaie de l'appeler. Les deux sont acceptés ici.
 */
export interface ZoneEcoutee {
  id?: number | null;
  name?: string | null;
  group_id?: string | number | null;
  current_track?: unknown;
}

/**
 * Les deux seuls événements qui COMMENCENT une écoute.
 *
 * `playback.resumed` n'en est pas une : c'est la même piste qui reprend, et la
 * noter deux fois remplirait l'historique de doublons à chaque pause.
 */
export function estDebutDEcoute(type: string | null | undefined): boolean {
  return type === 'playback.started' || type === 'playback.track_changed';
}

/**
 * L'événement concerne-t-il ce qu'on écoute ?
 *
 * 🔴 Une zone qui joue dans une autre pièce ne doit pas remplir MON historique.
 * La règle d'`App` depuis toujours : la zone courante, ou un membre de son
 * groupe — un groupe multiroom joue la même chose, et l'événement peut venir
 * de n'importe lequel de ses membres.
 *
 * `group_id` doit être NON NUL des deux côtés : `null === null` est vrai en
 * JavaScript, et deux zones sans groupe passeraient pour groupées ensemble.
 */
export function concerneLEcoute(
  zoneEvenement: number | null | undefined,
  courante: ZoneEcoutee | null | undefined,
  zoneDeLEvenement: ZoneEcoutee | null | undefined,
): boolean {
  if (courante == null || zoneEvenement == null) return false;
  if (courante.id === zoneEvenement) return true;
  return (
    courante.group_id != null &&
    zoneDeLEvenement?.group_id != null &&
    courante.group_id === zoneDeLEvenement.group_id
  );
}

/**
 * La piste que l'ÉVÉNEMENT porte lui-même, ou `null` s'il n'en porte pas.
 *
 * 🔴 #1010 — « l'historique n'a conservé que les 3 premiers titres » (Fabien,
 * Ambiance lancée en « Tout lire », 0.9.148).
 *
 * L'écoute était notée d'après `zone.current_track`, c'est-à-dire d'après un
 * `GET /zones` lancé séparément par `v2Live` — `void rechargerZones().then(…)`,
 * une requête par événement, jamais sérialisée, et dont la réponse décrit
 * l'état du serveur à l'instant où elle arrive, pas à celui de l'événement.
 * Rien n'apparie une réponse à l'événement qui l'a demandée. Un instantané en
 * retard d'un cran n'écrit alors pas une mauvaise ligne : `playbackHistory.add`
 * refuse toute piste égale à la précédente, donc il n'en écrit AUCUNE, en
 * silence. Une file de N titres ne laisse que quelques lignes.
 *
 * Or le serveur porte déjà la réponse : `now_playing_event_data`
 * (tune-server-rust, `playback/mod.rs`) sérialise le `NowPlaying` COMPLET dans
 * `playback.started` et `playback.track_changed` — titre, `track_id`, format,
 * `queue_position` — et le fait exprès depuis #1096, pour que le client cesse
 * d'aller redemander par le réseau ce qu'il tient déjà.
 *
 * ⚠️ Le repli reste indispensable : quand la zone a disparu entre l'événement
 * et sa mise en forme, le serveur émet une charge VIDE
 * (`unwrap_or_else(|| json!({}))`). Une charge qui n'identifie aucune piste ne
 * doit pas écraser `current_track`, sinon on noterait une écoute sans piste.
 */
export function pisteDeLEvenement(donnees: unknown): unknown | null {
  if (donnees == null || typeof donnees !== 'object') return null;
  const d = donnees as Record<string, unknown>;
  const titre = typeof d.title === 'string' ? d.title.trim() : '';
  const id = d.track_id;
  if (titre === '' && (id == null || id === '')) return null;
  /**
   * Le transport voyage AVEC la piste, il n'en fait pas partie : `ws.rs` pose
   * `zone_id`, `now_playing_event_data` pose `queue_position`,
   * `queue_length` et `track_generation`. Les retirer rend exactement la forme
   * de `zone.current_track` — sans quoi l'historique garderait, dans
   * `localStorage` et pour deux cents lignes, l'index de file d'un instant.
   */
  const { zone_id: _z, queue_position: _p, queue_length: _l, track_generation: _g, ...piste } = d;
  return piste;
}

/**
 * Noter l'écoute. Rend `true` si elle a été notée.
 *
 * `convertir` est `nowPlayingToTrack` : la zone porte un `NowPlaying`, dont
 * l'identifiant s'appelle `track_id`. Injecté, comme le carnet.
 *
 * `pisteEvenement` : la charge de l'événement, préférée à l'instantané de zone
 * dès qu'elle identifie une piste — voir `pisteDeLEvenement`. Le NOM de la
 * zone, lui, vient toujours de la zone : l'événement ne le porte pas.
 */
export function noterEcoute(
  zone: ZoneEcoutee | null | undefined,
  convertir: (np: any) => Track,
  ajouter: (piste: Track, nomDeZone: string) => void,
  pisteEvenement?: unknown,
): boolean {
  const np = pisteDeLEvenement(pisteEvenement) ?? zone?.current_track;
  if (!np) return false;
  ajouter(convertir(np), zone?.name ?? '');
  return true;
}

/**
 * La chaîne complète, telle que les DEUX coquilles doivent la tenir.
 *
 * Rend `true` quand une écoute a été notée — c'est ce que la garde regarde.
 */
export function noterSiDebutDEcoute(
  type: string | null | undefined,
  zoneEvenement: number | null | undefined,
  courante: ZoneEcoutee | null | undefined,
  zoneDeLEvenement: ZoneEcoutee | null | undefined,
  /**
   * `nowPlayingToTrack`. Typé `any` et non `unknown` : elle déclare
   * `Track | NowPlaying`, et une fonction qui prend un type ÉTROIT n'est pas
   * assignable à une qui prend `unknown` — la contravariance des paramètres.
   * `check-svelte` l'a refusée, à juste titre.
   */
  convertir: (np: any) => Track,
  ajouter: (piste: Track, nomDeZone: string) => void,
  /** La charge de l'événement — #1010. Voir `pisteDeLEvenement`. */
  pisteEvenement?: unknown,
): boolean {
  if (!estDebutDEcoute(type)) return false;
  if (!concerneLEcoute(zoneEvenement, courante, zoneDeLEvenement)) return false;
  return noterEcoute(courante, convertir, ajouter, pisteEvenement);
}
