/**
 * LA STABILITÉ DE L'AXE DE L'ANALYSEUR — Bertrand, 13/09/2026 :
 * « Ajoute les fréquences < 250 Hz ».
 *
 * ## Ce que la mesure a montré
 *
 * Relevé sur la .18, trames `playback.audio_levels` réelles, zone Eversolo,
 * FLAC 44,1 kHz / 24 bits :
 *
 * ```text
 * trame 1  spectrum_frames = 1764  résolution = 25,0 Hz  → 8 bandes non résolues
 * trame 2  spectrum_frames = 1080  résolution = 40,8 Hz  → 10 bandes non résolues
 * trame 3  spectrum_frames = 1764  résolution = 25,0 Hz  → 8 bandes non résolues
 * ```
 *
 * 🔴 **`spectrum_frames` VARIE d'une trame à l'autre** — la fenêtre de 40 ms
 * n'est pas toujours pleine. Et la résolution vraie vaut
 * `sample_rate / spectrum_frames`, pas `sample_rate / fft_size` : le
 * zéro-padding resserre les raies sans ajouter d'information (#2866).
 *
 * Conséquence à l'écran, calculée sur la grille ISO :
 *
 * ```text
 * 1764 trames (40 ms) → repères tenables : 125, 250, 500, 1000 Hz
 * 1080 trames (24 ms) → repères tenables :      250, 500, 1000 Hz
 * ```
 *
 * L'axe suivait la DERNIÈRE trame reçue. Le repère 125 Hz apparaissait donc et
 * disparaissait plusieurs fois par seconde, et une capture prise sur une trame
 * courte montre 250 Hz comme plus basse graduation — exactement ce qui a été
 * signalé.
 *
 * ## La règle
 *
 * L'axe décrit ce que l'analyseur SAIT FAIRE, pas ce qu'une trame écourtée a
 * pu faire. On retient donc, pour un format donné, la capacité la plus large
 * observée. Une bande que l'analyse a su séparer une fois, elle sait la
 * séparer : les trames courtes sont un artefact de découpage, pas une baisse
 * de capacité.
 *
 * Le format change (débit, taille de FFT, nombre de bandes) ⇒ on repart de
 * zéro : rien de l'ancien ne vaut plus.
 *
 * ## ⚠️ Ce que ceci ne fait PAS
 *
 * **Cela ne descend pas sous 125 Hz**, et aucune astuce d'affichage ne le
 * pourra. À 44,1 kHz, avec la grille à l'octave :
 *
 * ```text
 * 125 Hz : bande  8, large de 27,1 Hz → fenêtre de  37 ms   ← tenue aujourd'hui
 *  63 Hz : bande  5, large de 14,2 Hz → fenêtre de  71 ms
 *  31 Hz : bande  2, large de  7,4 Hz → fenêtre de 135 ms
 * ```
 *
 * Descendre plus bas demande d'ALLONGER la fenêtre d'analyse côté serveur,
 * au prix de la réactivité de l'affichage. C'est un arbitrage, pas un correctif.
 */

/**
 * Ce qui identifie un format d'analyse. Change ⇒ la capacité est caduque.
 *
 * 🔴 #1454 — la TAILLE DE FFT N'EN FAIT PLUS PARTIE, et c'était le défaut.
 *
 * Elle y était, au nom de « le format change (débit, taille de FFT, nombre de
 * bandes) ⇒ on repart de zéro ». Mais côté serveur elle n'est pas une propriété
 * du format : elle suit la longueur de la trame reçue
 * (`tune-core/src/audio/levels.rs`) —
 *
 * ```rust
 * let m = samples.len();
 * let n = m.next_power_of_two().min(SPECTRUM_FFT_MAX);   // 8192
 * ```
 *
 * — et #1002 a mesuré que `m` varie d'une trame à l'autre (1764, 1080, 1764).
 *
 * À 44,1 kHz ces deux valeurs donnent toutes deux `n = 2048` : la clé ne
 * bougeait pas, et le correctif de #1002 tenait — c'est le format sur lequel il
 * a été mesuré. À **96 kHz**, une fenêtre pleine de 40 ms fait ~3840 trames
 * (`n = 4096`) et une fenêtre écourtée ~1080 (`n = 2048`) : la clé basculait à
 * chaque trame courte, toute la mémoire anti-clignotement était jetée, et l'axe
 * retombait sur la trame courte. Le symptôme de #1002, revenu en hi-res
 * (Didier, fil 1889, 22/09/2026).
 *
 * Ce qui identifie vraiment le format, c'est le DÉBIT et le NOMBRE DE BANDES.
 * La taille de FFT, elle, est désormais MÉMORISÉE comme une capacité de plus.
 */
export function cleFormat(
  sampleRate: number | null | undefined,
  nbBandes: number,
): string {
  return `${sampleRate ?? 0}/${nbBandes}`;
}

export interface CapaciteSpectre {
  cle: string;
  /** La table `spectrum_resolved` la plus large vue pour ce format. */
  resolus: boolean[] | null;
  /**
   * La plus GRANDE taille de FFT annoncée pour ce format — #1454.
   *
   * Elle entre dans `spectrumIsoTicks`, qui rejoue sur elle la troncature du
   * serveur : à table `spectrum_resolved` identique, 2048 et 4096 ne rendent
   * pas les mêmes repères. La laisser suivre la trame faisait donc clignoter
   * l'axe par un second chemin, indépendant de la table.
   */
  fftSize: number | null;
}

export const CAPACITE_VIDE: CapaciteSpectre = { cle: '', resolus: null, fftSize: null };

/** Combien de bandes cette table déclare résolues. */
function largeur(resolus: boolean[] | null | undefined): number {
  if (!resolus) return -1;
  let n = 0;
  for (const r of resolus) if (r) n++;
  return n;
}

/**
 * La capacité à retenir après cette trame.
 *
 * 🔴 On ne fusionne pas bande à bande : on garde la table qui en résout le
 * PLUS, telle quelle. Le serveur la construit par un seuil unique
 * (`largeur_de_bande >= résolution`), donc elle est monotone — un préfixe de
 * `false` puis des `true`. Un mélange bande à bande produirait une table que le
 * serveur n'aurait jamais pu émettre.
 */
export function capaciteMaintenue(
  precedente: CapaciteSpectre,
  cle: string,
  resolus: boolean[] | null | undefined,
  fftSize?: number | null,
): CapaciteSpectre {
  const recue = resolus && resolus.length > 0 ? resolus : null;
  // Une taille absente, nulle ou dégénérée n'apprend rien : un serveur
  // antérieur à `spectrum_fft_size` n'en annonce aucune, et `spectrumIsoTicks`
  // a déjà son repli. Elle ne doit pas effacer ce qu'on savait.
  const brute = Number(fftSize);
  const taille = Number.isFinite(brute) && brute > 1 ? brute : null;

  if (cle !== precedente.cle) return { cle, resolus: recue, fftSize: taille };

  // 🔴 #1454 — même doctrine que la table : on retient la plus LARGE vue pour
  // ce format. Une analyse qui a su travailler sur 4096 points sait le refaire ;
  // une trame écourtée est un artefact de découpage, pas une baisse de capacité.
  const meilleureTaille =
    taille != null && (precedente.fftSize == null || taille > precedente.fftSize)
      ? taille
      : precedente.fftSize;

  if (!recue || largeur(recue) <= largeur(precedente.resolus)) {
    return meilleureTaille === precedente.fftSize
      ? precedente
      : { ...precedente, fftSize: meilleureTaille };
  }
  return { cle, resolus: recue, fftSize: meilleureTaille };
}
