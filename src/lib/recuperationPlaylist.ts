/**
 * Lire le compte rendu d'une récupération de playlist — #1076.
 *
 * Le serveur applique RÉELLEMENT les remplacements depuis la v0.9.155
 * (tune-server-rust#3685, PR #4273) et rend ce qu'il a fait, piste par piste.
 * Le client faisait l'inverse : `applyOneRecovery` réécrivait son état en
 * OPTIMISTE juste après l'appel —
 *
 * ```ts
 * t.track_id === trackId ? { ...t, status: 'available', alternatives: [] } : t
 * ```
 *
 * — c'est-à-dire qu'il affichait « disponible » pour une piste que le serveur
 * venait peut-être de refuser. Et il pouvait la refuser pour trois raisons
 * qu'il NOMME : la piste de remplacement n'existe pas en base, une piste de
 * service ne remplace pas une piste manquante, ou la ligne a disparu de la
 * playlist entre la lecture et l'écriture. Aucun de ces motifs n'atteignait
 * l'écran.
 *
 * Ce module ne fait que lire le compte rendu. Il est pur — donc mesurable
 * sans monter d'écran, et sans playlist.
 */
import type { RecoverApplyResponse, RecoverApplied, RecoverRejected } from './types';

/** Les pistes VRAIMENT remplacées, par identifiant d'origine. */
export function appliquesParPiste(res: unknown): Map<number, RecoverApplied> {
  const out = new Map<number, RecoverApplied>();
  const liste = (res as RecoverApplyResponse | null)?.applied;
  if (!Array.isArray(liste)) return out;
  for (const a of liste) {
    if (a && typeof a.track_id === 'number') out.set(a.track_id, a);
  }
  return out;
}

/** Les REFUS, par identifiant de piste, avec leur motif. */
export function refusParPiste(res: unknown): Map<number, string> {
  const out = new Map<number, string>();
  const liste = (res as RecoverApplyResponse | null)?.rejected;
  if (!Array.isArray(liste)) return out;
  for (const r of liste as RecoverRejected[]) {
    if (r && typeof r.track_id === 'number') {
      out.set(r.track_id, (r.reason ?? '').trim() || 'refus sans motif');
    }
  }
  return out;
}

/** Cette piste-là a-t-elle été remplacée ? La seule question qui autorise
 *  l'écran à la passer en « disponible ». */
export function pisteAppliquee(res: unknown, trackId: number): boolean {
  return appliquesParPiste(res).has(trackId);
}

/**
 * Une phrase pour l'écran, ou `null` quand tout est passé sans refus.
 *
 * `traduire` reçoit la clé et rend le gabarit : le module reste pur.
 */
export function resumeApplication(
  res: unknown,
  traduire: (cle: string) => string,
): string | null {
  const refus = refusParPiste(res);
  if (!refus.size) return null;
  const appliques = appliquesParPiste(res).size;
  const cle = appliques ? 'playlist.recoverPartial' : 'playlist.recoverNoneApplied';
  const phrase = traduire(cle)
    .replace('{applied}', String(appliques))
    .replace('{rejected}', String(refus.size));
  // Les motifs DISTINCTS : trois pistes refusées pour la même raison ne
  // méritent pas trois fois la même phrase.
  const motifs = [...new Set(refus.values())];
  return `${phrase} — ${motifs.join(' · ')}`;
}
