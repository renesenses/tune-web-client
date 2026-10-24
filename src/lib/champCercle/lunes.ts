/**
 * Tune Circle T5 dans la scène (demande de Bertrand du 24/10/2026) — les
 * playlists partagées en PETITES LUNES autour de la planète de leur cercle.
 *
 * Ce module ne dessine rien : il dit à quelle planète chaque playlist
 * s'accroche, et où poser sa lune autour du placement que le moteur donne.
 *
 * À quelle planète ?
 * - une playlist d'un de MES cercles (`mine`, `circle_id` connu) : la planète
 *   de ce cercle, dans la vue Réseau (`k:{id}`) comme dans la vue Solo
 *   (`ks:{id}`) — le moteur ne montre que celle de la vue courante ;
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
