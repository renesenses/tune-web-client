/**
 * tune-server-rust#8419 (fil 2215) — en lecture groupée, le chemin du signal
 * ne décrivait que la zone affichée : rien ne disait que la lecture partait
 * aussi vers une seconde sortie, ni ce que celle-ci recevait. Le serveur
 * publie `signal_path.group_outputs` ; ces fonctions le lisent.
 */
import type { SignalPath, SortieDuGroupe } from './types';

/** Les sorties du groupe à afficher, ou `[]` hors groupe (ou serveur antérieur). */
export function sortiesDuGroupe(sp: SignalPath | null | undefined): SortieDuGroupe[] {
  const sorties = sp?.group_outputs?.outputs;
  return Array.isArray(sorties) && sorties.length > 1 ? sorties : [];
}

/** Ce que reçoit la sortie : la description de son étage final, sinon `null`. */
export function etageFinal(s: SortieDuGroupe): string | null {
  const d = s.final_stage?.description;
  return typeof d === 'string' && d.trim() ? d.trim() : null;
}
