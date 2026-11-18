/**
 * TESS est-il servi par CE serveur ? (lot W1)
 *
 * Règle du plan (§ 1, « main publiable à tout moment ») : tout l'écran TESS
 * est CACHÉ tant que le serveur ne l'annonce pas. L'annonce est la route
 * elle-même (contrat § 7) : `GET /zones/{id}/tess` en 404 ⇒ pas de TESS, les
 * anciens écrans (Égaliseur, Crossfeed, Crossfeed Pro, Crosstalk) restent.
 *
 * - `inconnue` : pas encore su (ou panne) — rien ne change dans la barre ;
 * - `oui`      : réponse conforme au contrat que ce client sait lire ;
 * - `non`      : 404, ou contrat d'une version que ce client ne connaît pas.
 */
import { writable } from 'svelte/store';
import * as api from '../api';
import { contratCompris } from '../tess';

export type CapaciteTess = 'inconnue' | 'oui' | 'non';

export const capaciteTess = writable<CapaciteTess>('inconnue');

/** Interroge le serveur sur une zone. Une panne laisse l'état tel quel. */
export async function sonderTess(zoneId: number | null | undefined): Promise<CapaciteTess | null> {
  if (zoneId == null) return null;
  try {
    const r = await api.getTessZone(zoneId);
    let c: CapaciteTess | null = null;
    if (r.ok) c = contratCompris(r.reponse) ? 'oui' : 'non';
    else if ('absent' in r) c = 'non';
    if (c) capaciteTess.set(c);
    return c;
  } catch {
    return null;
  }
}

/**
 * Les entrées de la barre que TESS remplace (maquette A1, note de la barre).
 * L'outil de fichiers « Declick » (`declick`) RESTE dans Studio : décision Q4
 * du 17/11 — le greffon temps réel de TESS a un autre id (`declick-live`).
 */
export const VUES_REMPLACEES_PAR_TESS = ['equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk'];

/**
 * Filtre des entrées STUDIO : `tess` n'apparaît que si le serveur l'annonce,
 * et les écrans qu'il remplace disparaissent alors de la barre (leurs adresses
 * restent servies : la bascule des routes est le lot W8).
 */
export function entreesAvecTess<T extends { view: string }>(items: T[], capacite: CapaciteTess): T[] {
  if (capacite !== 'oui') return items.filter((it) => it.view !== 'tess');
  return items.filter((it) => !VUES_REMPLACEES_PAR_TESS.includes(it.view));
}
