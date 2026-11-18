/**
 * TESS W3 — les étages fixes de la colonne « Signal path » (maquette A1) :
 * Headroom, Upsampling, Volume, puis l'étape finale (Dither en PCM,
 * modulateur en DSD), toujours la DERNIÈRE (Q9).
 */
import type { EtapeTess } from './contrat';
import type { Traduire } from './libelles';

/** Les étapes fixes de TESS (ni Source, ni Output, ni greffon), dans l'ordre publié. */
export function estEtageFixe(e: EtapeTess): boolean {
  return e.fixed && e.code !== 'source' && e.code !== 'output' && e.code !== 'plugin';
}

/** L'étape finale (Dither en PCM, modulateur en DSD). */
export function estEtapeFinale(e: EtapeTess): boolean {
  return e.code === 'quantization' || e.code === 'dsd_modulator';
}

/** Les étiquettes d'une étape : FIXED pour un étage fixe, LAST pour l'étape finale. */
export function etiquettesEtape(e: EtapeTess, tr: Traduire): string[] {
  const out: string[] = [];
  if (estEtageFixe(e)) out.push(tr('tess.tag.fixed'));
  if (estEtapeFinale(e)) out.push(tr('tess.tag.last'));
  return out;
}
