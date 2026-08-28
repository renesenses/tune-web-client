import { describe, it, expect } from 'vitest';
import {
  ISO_OCTAVE_HZ,
  SERVER_FFT_SIZE,
  freqLabel,
  serverBandSpans,
  spectrumIsoTicks,
} from './spectrumScale';

/**
 * L'échelle de l'analyseur de spectre (#2081), vérifiée contre le serveur.
 *
 * ## D'où vient la vérité terrain
 *
 * `BANDE_ALLUMEE` n'est pas une prédiction : chaque valeur a été obtenue en
 * compilant `tune-core/src/audio/levels.rs` **verbatim** (origin/main,
 * sha256 32bcea2d…) et en lui donnant un sinus pur sur une fenêtre de 40 ms —
 * exactement ce que fait le forwarder de `orchestrator.rs`. La valeur est
 * l'indice de la bande dont `spectrum_db` est le plus haut.
 *
 * ## Ce que ces tests verrouillent
 *
 * Un repère de fréquence n'a de sens que s'il désigne la barre qui s'allume
 * vraiment. La FFT du serveur ne fait que 2048 points : dans le grave, ses
 * bandes logarithmiques sont plus étroites qu'une raie, plusieurs bandes
 * lisent les mêmes raies, et l'axe annoncé se décale d'une à deux barres.
 * On vérifie donc deux choses :
 *
 *  1. tout repère produit tombe DANS la barre que la fréquence allume ;
 *  2. les fréquences que l'analyseur ne sait pas distinguer ne reçoivent
 *     aucun repère — plutôt aucun repère qu'un repère faux.
 */

/** Bande réellement allumée par un sinus pur — mesurée, pas déduite. */
const BANDE_ALLUMEE: Record<number, Record<number, number>> = {
  44100: { 31: 1, 63: 6, 125: 9, 250: 12, 500: 15, 1000: 18, 2000: 21, 4000: 24, 8000: 27, 16000: 30 },
  48000: { 31: 1, 63: 6, 125: 9, 250: 12, 500: 15, 1000: 18, 2000: 21, 4000: 24, 8000: 27, 16000: 30 },
  88200: { 31: 0, 63: 4, 125: 9, 250: 12, 500: 15, 1000: 18, 2000: 21, 4000: 24, 8000: 27, 16000: 30 },
  96000: { 31: 0, 63: 4, 125: 10, 250: 12, 500: 15, 1000: 18, 2000: 21, 4000: 24, 8000: 27, 16000: 30 },
  176400: { 31: 0, 63: 0, 125: 7, 250: 12, 500: 15, 1000: 18, 2000: 21, 4000: 24, 8000: 27, 16000: 30 },
  192000: { 31: 0, 63: 0, 125: 8, 250: 13, 500: 15, 1000: 18, 2000: 21, 4000: 24, 8000: 27, 16000: 31 },
};

/** Le serveur envoie 32 bandes — `levels.rs:92`. */
const BANDES = 32;

const CADENCES = Object.keys(BANDE_ALLUMEE).map(Number);

describe('échelle de fréquences de l’analyseur de spectre', () => {
  it('examine toutes les cadences mesurées', () => {
    // Garde-fou de la preuve elle-même : si la table se vide, les boucles
    // ci-dessous passeraient au vert sans rien vérifier.
    expect(CADENCES.length).toBe(6);
    expect(ISO_OCTAVE_HZ.length).toBe(10);
  });

  it('chaque repère produit tombe dans la barre que la fréquence allume', () => {
    let verifies = 0;
    for (const sr of CADENCES) {
      const ticks = spectrumIsoTicks(sr, BANDES);
      for (const { hz, pos } of ticks) {
        const allumee = BANDE_ALLUMEE[sr][hz];
        expect(allumee, `${sr} Hz / ${hz} Hz absent de la vérité terrain`).toBeDefined();
        const centreBarre = allumee + 0.5;
        const ecart = Math.abs(pos * BANDES - centreBarre);
        expect(
          ecart,
          `${sr} Hz : le repère ${hz} Hz est posé à la barre ${(pos * BANDES).toFixed(2)} ` +
            `alors que ${hz} Hz allume la barre ${allumee}`,
        ).toBeLessThanOrEqual(0.75);
        verifies++;
      }
    }
    // Sans cette borne, une fonction qui ne rend RIEN passerait au vert.
    expect(verifies).toBeGreaterThanOrEqual(40);
  });

  it('ne pose aucun repère là où le serveur ne distingue pas les fréquences', () => {
    // Mesuré : à 44,1 kHz un 63 Hz allume la barre 6 alors que l'axe
    // logarithmique annoncé le place dans la barre 5 ; à 96 kHz un 125 Hz
    // allume la barre 10 pour une barre 8 annoncée. Ces repères-là mentiraient.
    const attendus: Record<number, number[]> = {
      44100: [125, 250, 500, 1000, 2000, 4000, 8000, 16000],
      48000: [125, 250, 500, 1000, 2000, 4000, 8000, 16000],
      88200: [250, 500, 1000, 2000, 4000, 8000, 16000],
      96000: [250, 500, 1000, 2000, 4000, 8000, 16000],
      176400: [500, 1000, 2000, 4000, 8000, 16000],
      192000: [500, 1000, 2000, 4000, 8000, 16000],
    };
    for (const sr of CADENCES) {
      expect(spectrumIsoTicks(sr, BANDES).map((t) => t.hz), `à ${sr} Hz`).toEqual(attendus[sr]);
    }
  });

  it('l’axe annoncé par le serveur est bien FAUX dans le grave — c’est pourquoi on l’écarte', () => {
    // Contre-épreuve du choix : si l'axe logarithmique annoncé était juste,
    // il n'y aurait aucune raison de retirer ces repères. On vérifie donc
    // qu'il se trompe vraiment, et de plus d'une barre.
    const nominal = (hz: number, sr: number) => {
      const fmax = Math.min(sr / 2, 20000);
      return (BANDES * Math.log(hz / 20)) / Math.log(fmax / 20);
    };
    const fautes: Array<[number, number]> = [
      [44100, 63],
      [44100, 125],
      [96000, 125],
      [192000, 250],
    ];
    for (const [sr, hz] of fautes) {
      const ecart = Math.abs(nominal(hz, sr) - (BANDE_ALLUMEE[sr][hz] + 0.5));
      expect(ecart, `${sr} Hz / ${hz} Hz`).toBeGreaterThan(1);
    }
    expect(fautes.length).toBe(4);
  });

  it('les repères montent en fréquence de gauche à droite', () => {
    for (const sr of CADENCES) {
      const ticks = spectrumIsoTicks(sr, BANDES);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i].pos, `à ${sr} Hz`).toBeGreaterThan(ticks[i - 1].pos);
      }
      for (const t of ticks) {
        expect(t.pos).toBeGreaterThanOrEqual(0);
        expect(t.pos).toBeLessThanOrEqual(1);
      }
    }
  });

  it('sans fréquence d’échantillonnage, aucun repère n’est inventé', () => {
    expect(spectrumIsoTicks(null, BANDES)).toEqual([]);
    expect(spectrumIsoTicks(undefined, BANDES)).toEqual([]);
    expect(spectrumIsoTicks(0, BANDES)).toEqual([]);
    expect(spectrumIsoTicks(44100, 0)).toEqual([]);
  });

  it('rejoue la troncature du serveur, pas les bords annoncés', () => {
    // `levels.rs:274-277` : à 44,1 kHz la résolution est de 21,5 Hz et les
    // bandes 1, 2 et 3 lisent toutes la raie 1. Elles couvrent donc la même
    // plage réelle, et aucune n'est exploitable.
    const spans = serverBandSpans(44100, BANDES);
    expect(spans.length).toBe(BANDES);
    const resolution = 44100 / SERVER_FFT_SIZE;
    expect(resolution).toBeCloseTo(21.53, 2);
    for (const b of [1, 2, 3]) {
      expect(spans[b].loHz).toBeCloseTo(resolution, 5);
      expect(spans[b].hiHz).toBeCloseTo(2 * resolution, 5);
      expect(spans[b].distinct, `bande ${b}`).toBe(false);
    }
    // Au-dessus, chaque bande a ses propres raies.
    for (const b of [11, 18, 24, 31]) {
      expect(spans[b].distinct, `bande ${b}`).toBe(true);
    }
    const ecrasees = spans.filter((s) => !s.distinct).length;
    expect(ecrasees).toBe(5);
  });

  it('libelle les fréquences comme l’égaliseur', () => {
    expect(freqLabel(31)).toBe('31');
    expect(freqLabel(125)).toBe('125');
    expect(freqLabel(1000)).toBe('1k');
    expect(freqLabel(16000)).toBe('16k');
  });
});
