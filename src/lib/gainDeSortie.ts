/**
 * LE GAIN RÉELLEMENT APPLIQUÉ EN SORTIE — tune-server-rust#4384.
 *
 * « Preamp +6 dB, pas de changement » (fil 1797) : sur une sortie locale,
 * volume × ReplayGain × préampli sont composés puis RABOTÉS à l'unité pour
 * éviter l'écrêtage. À volume plein, un préampli positif ne produit donc
 * rien, et rien à l'écran ne le disait.
 *
 * Tout vient du serveur, jamais d'un calcul refait ici :
 *   - `playback.audio_levels` porte `output_gain_db` (le gain déjà compris
 *     dans les niveaux) et, sur une sortie locale hors DoP,
 *     `output_gain_requested_db` et `output_gain_limited` ;
 *   - le chemin du signal porte `replaygain_untagged` (ReplayGain armé, piste
 *     sans gain : préampli non appliqué) et, sur l'étape ReplayGain,
 *     `applied_in` (`local_output` ou `stream`).
 *
 * Garde par PRÉSENCE : un serveur qui ne publie pas ces champs n'affiche
 * rien de neuf. `output_gain_db` seul ne suffit pas — il vaut 0 sur un rendu
 * réseau, qui cuit son gain dans le flux, et ce 0 n'est pas un gain de sortie.
 */
import { readable, type Readable } from 'svelte/store';
import { audioLevels, type AudioLevels } from './stores/audioLevels';
import { dbSigne } from './compensationNiveau';
import type { SignalPath } from './types';

export interface GainDeSortie {
  /** Gain déjà compris dans les niveaux publiés, en dB. */
  appliqueDb: number;
  /** Volume × ReplayGain (préampli compris) demandé AVANT rabot, en dB. */
  demandeDb: number;
  /** Le rabot à l'unité a mordu : le gain demandé n'est pas rendu. */
  limite: boolean;
}

function nombre(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Le gain de sortie d'une trame, ou `null` si le serveur ne le dit pas. */
export function lireGainDeSortie(l: Pick<AudioLevels, 'output_gain_db' | 'output_gain_requested_db' | 'output_gain_limited'> | null | undefined): GainDeSortie | null {
  const demande = nombre(l?.output_gain_requested_db);
  if (demande == null) return null;
  return {
    appliqueDb: nombre(l?.output_gain_db) ?? 0,
    demandeDb: demande,
    limite: l?.output_gain_limited === true,
  };
}

/** Même valeur affichée ⇒ même gain : pas de nouveau rendu à chaque trame. */
function memeAffichage(a: GainDeSortie | null, b: GainDeSortie | null): boolean {
  if (a == null || b == null) return a === b;
  return a.limite === b.limite
    && dbSigne(a.appliqueDb) === dbSigne(b.appliqueDb)
    && dbSigne(a.demandeDb) === dbSigne(b.demandeDb);
}

/**
 * Le gain de sortie de la zone sélectionnée. Les trames arrivent plusieurs
 * fois par seconde ; ce magasin ne change que quand l'affichage change.
 */
export const gainDeSortieCourant: Readable<GainDeSortie | null> = readable<GainDeSortie | null>(null, (set) => {
  // Un `readable` garde sa dernière valeur entre deux abonnements : la
  // première trame vue repose donc toujours la valeur, même `null`.
  let premiere = true;
  let dernier: GainDeSortie | null = null;
  return audioLevels.subscribe((l) => {
    const g = lireGainDeSortie(l);
    if (premiere || !memeAffichage(g, dernier)) {
      premiere = false;
      dernier = g;
      set(g);
    }
  });
});

type Traduire = (cle: string) => string;

/** « Gain appliqué en sortie : −3.0 dB ». */
export function libelleGainApplique(g: GainDeSortie, t: Traduire): string {
  return t('signal.outputGainApplied').replace('{db}', dbSigne(g.appliqueDb));
}

/** « Gain demandé +6.0 dB, limité à 0 dB pour éviter l'écrêtage » — ou `null`. */
export function libelleRabot(g: GainDeSortie | null, t: Traduire): string | null {
  if (!g?.limite) return null;
  return t('signal.outputGainLimited').replace('{db}', dbSigne(g.demandeDb));
}

/** ReplayGain armé, piste sans gain : la phrase à dire, ou `null`. */
export function libelleSansGainTague(sp: SignalPath | null | undefined, t: Traduire): string | null {
  const rg = sp?.replaygain_untagged;
  if (!rg) return null;
  const preamp = nombre(rg.preamp_db) ?? 0;
  return t(dbSigne(preamp) === '0.0' ? 'signal.rgUntagged' : 'signal.rgUntaggedPreamp');
}

/** Rendu réseau : le gain ReplayGain est cuit dans le flux envoyé. */
export function libelleGainDansLeFlux(sp: SignalPath | null | undefined, t: Traduire): string | null {
  const etape = sp?.steps?.find((s) => s.name === 'ReplayGain' && s.bit_perfect === false);
  return etape?.applied_in === 'stream' ? t('signal.rgInStream') : null;
}
