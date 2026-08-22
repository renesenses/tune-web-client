import type { LocalAudioDevice } from './types';

/**
 * L'étiquette de caractéristiques d'une sortie audio locale — « 2ch · 96 kHz ».
 *
 * ## Pourquoi cette fonction existe
 *
 * Trois écrans affichaient cette étiquette, chacun avec sa propre expression,
 * et les trois lisaient des champs que le serveur ne publie pas (#2098). Le
 * calcul est ici pour qu'il n'y ait qu'un seul endroit où se tromper.
 *
 * ## Les noms de champs, qui sont la cause du défaut
 *
 * Le serveur sérialise le `struct AudioDevice` sans aucun `rename`, donc les
 * clés sont exactement `max_channels` et `sample_rates`. Le client lisait
 * `channels` et `sample_rate` — deux champs qui n'ont jamais existé dans la
 * charge utile. D'où l'étiquette « CH · NAN KHZ » vue par Benjithom :
 * `undefined` rendu par la chaîne vide, et `Math.round(undefined / 1000)` qui
 * vaut `NaN`.
 *
 * Charge utile observée (Tune 0.9.96, CoreAudio) :
 *
 * ```json
 * { "name": "HC4", "max_channels": 2, "sample_rates": [44100, 48000, 88200, 96000] }
 * ```
 *
 * ## Ce que l'étiquette VEUT DIRE — l'arbitrage du ticket
 *
 * `sample_rates` est une **liste de fréquences supportées**, pas la fréquence
 * en cours. Afficher `sample_rates[0]` serait arbitraire : ni le maximum, ni
 * ce qui joue. Le ticket laissait donc ouvert ce que l'étiquette annonce.
 *
 * Elle annonce la **capacité**, et prend le maximum. Deux raisons :
 *
 * - l'écran est une liste de *périphériques* dans les réglages, pas une vue de
 *   lecture — un périphérique ne joue pas, c'est une zone qui joue ;
 * - le serveur ne publie, pour ce périphérique, **aucune** information de
 *   format courant. Annoncer « joue en X » demanderait de la lui ajouter.
 *
 * ## Le cas de la liste vide
 *
 * Un périphérique sans fréquence connue rend `2ch` seul, pas `2ch · NaN kHz`.
 * C'est le défaut d'origine : mieux vaut une étiquette courte qu'une étiquette
 * fausse.
 */
export function etiquetteCaracteristiques(
  device: Pick<LocalAudioDevice, 'max_channels' | 'sample_rates'>,
): string {
  const morceaux: string[] = [];

  if (Number.isFinite(device.max_channels) && (device.max_channels as number) > 0) {
    morceaux.push(`${device.max_channels}ch`);
  }

  const frequences = (device.sample_rates ?? []).filter((f) => Number.isFinite(f) && f > 0);
  if (frequences.length > 0) {
    const max = Math.max(...frequences);
    // Une fréquence se lit en kHz avec sa décimale quand elle en a une :
    // 44,1 kHz est un repère, « 44 kHz » n'en est pas un.
    const kHz = Math.round(max / 100) / 10;
    morceaux.push(`${kHz} kHz`);
  }

  return morceaux.join(' · ');
}
