/**
 * Bibliothèque › Qualité — « Hi-Res vérifié » et « Hi-Res douteux »
 * (décision de Bertrand du 13/11/2026, rc12 ; tune-server-rust#6285).
 *
 * Le verdict se lit au SERVEUR, par le filtre `GET /library/albums?hires_verdict=`
 * qui rend exactement les albums portant le badge : on en garde les
 * identifiants, et la grille filtre sur place comme pour le pays ou la portée
 * de dossier. Décision de Bertrand : détection éteinte = rien de visible. Les
 * deux entrées n'apparaissent que si la détection est ALLUMÉE (même si des
 * mesures restent en base) ; « douteux » seulement si le serveur le montre.
 */
import type { EtatFauxHiRes } from './api';

export type CleHiRes = 'hires_verifie' | 'hires_douteux';
export const VERDICT_DE_LA_CLE: Record<CleHiRes, 'verifie' | 'douteux'> = {
  hires_verifie: 'verifie',
  hires_douteux: 'douteux',
};

export function estCleHiRes(cle: string): cle is CleHiRes {
  return cle === 'hires_verifie' || cle === 'hires_douteux';
}

/** Les entrées du menu Qualité que l'état de la détection autorise. */
export function entreesHiRes(etat: EtatFauxHiRes | null | undefined): { key: CleHiRes; label: string; cle: string }[] {
  if (!etat?.active) return [];
  const r: { key: CleHiRes; label: string; cle: string }[] = [
    { key: 'hires_verifie', label: 'Hi-Res ✓', cle: 'v2.lib.qualityHiresVerified' },
  ];
  if (etat.douteux_visible) r.push({ key: 'hires_douteux', label: 'Hi-Res ?', cle: 'v2.lib.qualityHiresDoubtful' });
  return r;
}

export const PAGE_VERDICT = 2000;
const TOURS_MAX = 50;

/** Tous les identifiants d'albums d'un verdict, page après page. */
export async function idsParVerdictHiRes(
  page: (limite: number, rang: number) => Promise<{ items?: { id?: number }[]; total?: number } | null | undefined>,
): Promise<Set<number>> {
  const ids = new Set<number>();
  let rang = 0;
  for (let tour = 0; tour < TOURS_MAX; tour++) {
    const r = await page(PAGE_VERDICT, rang);
    const recues = r?.items ?? [];
    for (const a of recues) if (typeof a?.id === 'number') ids.add(a.id);
    if (recues.length === 0) return ids;
    rang += recues.length;
    const total = r?.total;
    if (typeof total === 'number' ? rang >= total : recues.length < PAGE_VERDICT) return ids;
  }
  return ids;
}

/** La phrase d'avancement sous l'interrupteur : rien tant que la détection
 *  est éteinte ; « en cours » tant qu'il reste des pistes ; « terminée » sinon. */
export function avancementFauxHiRes(etat: EtatFauxHiRes | null | undefined):
  { cle: 'settings.fauxHiResProgress' | 'settings.fauxHiResDone'; rangees: number; restantes: number } | null {
  if (!etat?.active) return null;
  const rangees = Math.max(0, etat.rangees ?? 0);
  const restantes = Math.max(0, etat.restantes ?? 0);
  if (etat.restantes == null && etat.rangees == null) return null;
  return { cle: restantes > 0 ? 'settings.fauxHiResProgress' : 'settings.fauxHiResDone', rangees, restantes };
}
