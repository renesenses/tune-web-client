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

/** Ce qui identifie un format d'analyse. Change ⇒ la capacité est caduque. */
export function cleFormat(
  sampleRate: number | null | undefined,
  fftSize: number | null | undefined,
  nbBandes: number,
): string {
  return `${sampleRate ?? 0}/${fftSize ?? 0}/${nbBandes}`;
}

export interface CapaciteSpectre {
  cle: string;
  /** La table `spectrum_resolved` la plus large vue pour ce format. */
  resolus: boolean[] | null;
}

export const CAPACITE_VIDE: CapaciteSpectre = { cle: '', resolus: null };

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
): CapaciteSpectre {
  const recue = resolus && resolus.length > 0 ? resolus : null;
  if (cle !== precedente.cle) return { cle, resolus: recue };
  if (!recue) return precedente;
  return largeur(recue) > largeur(precedente.resolus)
    ? { cle, resolus: recue }
    : precedente;
}
