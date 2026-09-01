/**
 * L'échelle de fréquences de l'analyseur de spectre (#2081).
 *
 * ## Ce que le serveur envoie
 *
 * `playback.audio_levels` porte `spectrum` (forme normalisée trame par trame)
 * et `spectrum_db` (niveau absolu par bande, en dBFS), **32 bandes**, une
 * trame par fenêtre de 40 ms — `tune-core/src/audio/levels.rs:92`
 * (`analyze_spectrum(..., 32, sample_rate)`) et `tune-core/src/orchestrator.rs:353`
 * pour l'émission.
 *
 * Les bandes sont annoncées **logarithmiques**, de 20 Hz à `min(nyquist, 20 kHz)`
 * — `levels.rs:260-277` :
 *
 * ```rust
 * let hz_low  = freq_min * log_ratio.powf(b as f64 / bins as f64);
 * let hz_high = freq_min * log_ratio.powf((b + 1) as f64 / bins as f64);
 * let f_low   = ((hz_low  / nyquist) * half as f64) as usize;   // TRONCATURE
 * let f_high  = ((hz_high / nyquist) * half as f64) as usize;
 * let f_high  = f_high.max(f_low + 1).min(half);                // largeur mini
 * ```
 *
 * ## Pourquoi on ne peut pas se contenter des bords annoncés
 *
 * La FFT du serveur fait 2048 points (`levels.rs:188`), soit 1024 raies pour
 * tout le Nyquist : **21,5 Hz de résolution à 44,1 kHz, 46,9 Hz à 96 kHz**.
 * Or les bandes basses annoncées sont bien plus étroites que ça (la première
 * fait 5 Hz de large). La troncature `as usize` ci-dessus écrase donc
 * plusieurs bandes voisines sur les MÊMES raies : à 44,1 kHz les bandes 1, 2
 * et 3 lisent toutes la raie 1, et les bandes 2, 3 et 5 ne s'allument jamais.
 *
 * Mesuré en exécutant `levels.rs` verbatim sur des sinus purs : un 63 Hz
 * allume la bande 6, alors que l'axe logarithmique annoncé la place dans la
 * bande 5 ; un 125 Hz à 96 kHz allume la bande 10 au lieu de la 8. Poser un
 * repère « 63 Hz » à sa position annoncée le mettrait donc une barre à côté
 * de la barre qui s'allume réellement.
 *
 * ## Ce que fait ce module
 *
 * Il rejoue la troncature du serveur pour connaître la plage de fréquences
 * que chaque bande couvre **réellement**, puis ne place un repère que là où
 * cette plage est sans ambiguïté (aucune autre bande ne lit les mêmes raies).
 * Sous cette limite — environ 100 Hz à 44,1 kHz, 250 Hz à 96 kHz, 500 Hz à
 * 192 kHz — l'analyseur est incapable de distinguer les fréquences, et un
 * repère y serait une invention. On n'en met pas.
 */

/** Taille de la FFT du serveur — `tune-core/src/audio/levels.rs:188`. */
export const SERVER_FFT_SIZE = 2048;

/** Fréquence la plus basse de l'axe du serveur — `levels.rs:264`. */
export const SERVER_FREQ_MIN = 20;

/** Plafond de l'axe du serveur, avant bornage par le Nyquist — `levels.rs:265`. */
export const SERVER_FREQ_MAX = 20000;

/**
 * Grille ISO à l'octave — les repères de REW, ceux dont l'égaliseur Expert se
 * revendique (`EqualizerView.svelte`, `GRIDS[10]`). Partagée pour que les deux
 * écrans gradue la même chose de la même façon : c'est tout l'objet de #2081.
 */
export const ISO_OCTAVE_HZ = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** « 31 », « 1k », « 16k » — la convention déjà en place dans l'égaliseur. */
export function freqLabel(f: number): string {
  return f >= 1000 ? `${f / 1000}k` : `${f}`;
}

/** Ce qu'une bande du serveur couvre vraiment, une fois la troncature appliquée. */
export interface BandSpan {
  /** Borne basse RÉELLE, en Hz (raie FFT × résolution). */
  loHz: number;
  /** Borne haute RÉELLE, en Hz. */
  hiHz: number;
  /**
   * `false` quand une autre bande lit exactement les mêmes raies FFT : les
   * deux affichent la même chose, et aucune fréquence ne peut leur être
   * attribuée.
   */
  distinct: boolean;
}

/**
 * Rejoue `levels.rs:271-277` pour obtenir la plage réellement couverte par
 * chaque bande à cette fréquence d'échantillonnage.
 */
export function serverBandSpans(sampleRate: number, bandCount: number): BandSpan[] {
  if (!(sampleRate > 0) || bandCount <= 0) return [];
  const nyquist = sampleRate / 2;
  const freqMax = Math.min(nyquist, SERVER_FREQ_MAX);
  if (freqMax <= SERVER_FREQ_MIN) return [];
  const logRatio = freqMax / SERVER_FREQ_MIN;
  const half = SERVER_FFT_SIZE / 2;
  const resolution = sampleRate / SERVER_FFT_SIZE;

  const raw: Array<{ lo: number; hi: number }> = [];
  for (let b = 0; b < bandCount; b++) {
    const hzLow = SERVER_FREQ_MIN * Math.pow(logRatio, b / bandCount);
    const hzHigh = SERVER_FREQ_MIN * Math.pow(logRatio, (b + 1) / bandCount);
    const lo = Math.min(Math.floor((hzLow / nyquist) * half), half - 1);
    const hi = Math.min(Math.max(Math.floor((hzHigh / nyquist) * half), lo + 1), half);
    raw.push({ lo, hi });
  }

  return raw.map((span, b) => ({
    loHz: span.lo * resolution,
    hiHz: span.hi * resolution,
    distinct: !raw.some((other, k) => k !== b && other.lo === span.lo && other.hi === span.hi),
  }));
}

/** Un repère de fréquence à poser sous les barres. */
export interface SpectrumTick {
  /** La fréquence ISO, en Hz. */
  hz: number;
  /** Sa position, en fraction (0..1) de la largeur occupée par les barres. */
  pos: number;
}

/**
 * Les repères ISO que cet analyseur peut porter **honnêtement**.
 *
 * Un repère n'est retenu que si une seule bande couvre réellement sa
 * fréquence ; il est alors placé à l'intérieur de cette bande, à sa position
 * logarithmique dans la plage RÉELLE de la bande — pas à la position
 * annoncée. Vérifié bande par bande contre la sortie de `levels.rs` exécuté
 * sur des sinus purs (voir `spectrumScale.test.ts`).
 *
 * Retourne une liste vide si la fréquence d'échantillonnage est inconnue :
 * sans elle, l'axe du serveur n'est pas calculable, et un repère serait un
 * pari.
 */
export function spectrumIsoTicks(
  sampleRate: number | null | undefined,
  bandCount: number,
): SpectrumTick[] {
  if (!sampleRate || !(sampleRate > 0) || bandCount <= 0) return [];
  const spans = serverBandSpans(sampleRate, bandCount);
  if (spans.length === 0) return [];

  const ticks: SpectrumTick[] = [];
  for (const hz of ISO_OCTAVE_HZ) {
    let found = -1;
    for (let b = 0; b < spans.length; b++) {
      const s = spans[b];
      if (s.loHz > 0 && hz >= s.loHz && hz < s.hiHz) {
        found = b;
        break;
      }
    }
    if (found < 0) continue;
    const s = spans[found];
    // Bande écrasée sur les mêmes raies qu'une voisine : l'analyseur ne sait
    // pas distinguer cette fréquence, on ne prétend pas le contraire.
    if (!s.distinct) continue;
    const within = Math.log(hz / s.loHz) / Math.log(s.hiHz / s.loHz);
    ticks.push({ hz, pos: (found + within) / bandCount });
  }
  return ticks;
}
