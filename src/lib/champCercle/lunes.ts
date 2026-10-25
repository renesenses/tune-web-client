/**
 * Tune Circle T5 dans la scène (demande de Bertrand du 24/10/2026) — les
 * playlists partagées en PETITES LUNES : posées SUR l'anneau de leur cercle
 * (les cercles sont des boucles depuis le 24/10 au soir), ou autour de la
 * planète de leur propriétaire.
 *
 * Ce module ne dessine rien : il dit à quelle planète chaque playlist
 * s'accroche, et où poser sa lune autour du placement que le moteur donne.
 *
 * À quel nœud ?
 * - une playlist d'un de MES cercles (`mine`, `circle_id` connu) : l'ANNEAU
 *   de ce cercle, dans la vue Réseau (`k:{id}`) comme dans la vue Solo
 *   (`ks:{id}`) — le moteur ne montre que celui de la vue courante ; ses
 *   lunes se rangent à droite de son nom ({@link positionLuneEnRangee}) ;
 * - une playlist d'un cercle d'un contact (`circle_id` jamais montré à un
 *   membre, contrat T5) : la planète de son PROPRIÉTAIRE (`c:{user_id}`) ;
 * - sinon (cercle hors de la scène, propriétaire sans planète) : aucune lune.
 *   La playlist reste dans l'accès du haut et dans le bloc de gestion.
 *
 * Rien n'est gardé ici : la liste vient de `GET /ext/circle/playlists`, relue
 * par `CircleV2`.
 */
import type { PlaylistCercleResume } from '../circlePlaylists';
import { idCercle, idCercleSolo, idContact } from './scene';

/** Une lune : de quoi la nommer et l'ouvrir. */
export interface Lune {
  id: PlaylistCercleResume['id'];
  nom: string;
  count: number;
}

/** Au plus tant de lunes par planète ; au-delà, une lune « +N » ouvre la liste. */
export const LUNES_MAX = 5;

export interface LunesDePlanete {
  lunes: Lune[];
  /** Les playlists de cette planète qui n'ont pas de lune (au-delà de `max`). */
  reste: number;
}

/** Les planètes d'une playlist (une par vue qui la porte) ; vide si elle n'en a pas. */
export function planetesDePlaylist(p: PlaylistCercleResume): string[] {
  if (p.mine && p.circle_id != null) return [idCercle(p.circle_id), idCercleSolo(p.circle_id)];
  if (!p.mine && p.owner?.user_id != null) return [idContact(p.owner.user_id)];
  return [];
}

/**
 * Les lunes de chaque planète présente dans la scène, dans l'ordre de la
 * liste du cloud. `presents` : les identifiants de nœuds que la scène porte.
 */
export function lunesParPlanete(
  playlists: readonly PlaylistCercleResume[],
  presents: ReadonlySet<string>,
  max = LUNES_MAX,
): Map<string, LunesDePlanete> {
  const m = new Map<string, LunesDePlanete>();
  for (const p of playlists) {
    for (const planete of planetesDePlaylist(p)) {
      if (!presents.has(planete)) continue;
      let e = m.get(planete);
      if (!e) { e = { lunes: [], reste: 0 }; m.set(planete, e); }
      if (e.lunes.length < max) e.lunes.push({ id: p.id, nom: p.name, count: p.count });
      else e.reste += 1;
    }
  }
  return m;
}

/**
 * Le centre de la lune `k` sur `n` autour d'une planète de centre (x, y) et de
 * rayon `r` (px CSS). Les lunes partent du haut-droit et tournent dans le sens
 * des aiguilles d'une montre, à un pas fixe : une lune de plus ne déplace pas
 * les autres.
 */
export function positionLune(planete: { x: number; y: number; r: number }, k: number, n: number): { x: number; y: number } {
  const orbite = Math.max(12, planete.r) + 14;
  const pas = n > 6 ? (2 * Math.PI) / n : Math.PI / 5;
  const a = -Math.PI / 3 + k * pas;
  return { x: planete.x + Math.cos(a) * orbite, y: planete.y + Math.sin(a) * orbite };
}

/** Pas (px) entre deux lunes d'un anneau, rangées à droite de son nom. */
export const LUNE_PAS_RANGEE = 14;

/** La place (px) qu'il faut à droite du nom d'un anneau pour `n` lunes (« +N » compris). */
export function largeurRangeeLunes(n: number): number {
  return n > 0 ? 10 + n * LUNE_PAS_RANGEE + 4 : 0;
}

/**
 * Le centre de la lune `k` d'un ANNEAU (25/10/2026) : en rangée serrée à
 * droite de son nom, plus en perles le long du trait. `x0` : où la rangée
 * commence (`PlacementNoeud.lunesX`), `y` : la ligne du nom.
 */
export function positionLuneEnRangee(x0: number, y: number, k: number): { x: number; y: number } {
  return { x: x0 + LUNE_PAS_RANGEE / 2 + k * LUNE_PAS_RANGEE, y };
}
