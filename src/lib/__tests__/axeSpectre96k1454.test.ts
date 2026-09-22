/**
 * #1454 — l'axe de l'analyseur clignote ENCORE, après le correctif de #1002.
 *
 * « Gros Bidon » / Didier, forum fil 1889, 22/09/2026, Windows 11, FLAC
 * 96 kHz : « Écran lecture en cours, échelle de fréquence clignote lors de la
 * lecture ». Sa capture ne porte AUCUN repère entre 63 Hz et 2 kHz, et son
 * repère `20Hz` (venu de `spectrumGravesTicks`, 17/09) borne sa build APRÈS
 * `b5c13c63`, le correctif de #1002. Ce n'est donc pas un doublon : c'est le
 * même symptôme après son correctif.
 *
 * ## Ce que le code prouve
 *
 * Côté serveur (`tune-core/src/audio/levels.rs`) la taille de FFT est
 * ADAPTATIVE et suit le nombre de trames réellement disponibles :
 *
 * ```rust
 * let m = samples.len();
 * let n = m.next_power_of_two().min(SPECTRUM_FFT_MAX);   // 8192
 * ```
 *
 * et #1002 a MESURÉ que `m` varie d'une trame à l'autre (1764, 1080, 1764).
 *
 *  - à **44,1 kHz** : 1764 et 1080 donnent tous deux `n = 2048`. La taille
 *    annoncée ne bouge pas — c'est le format sur lequel #1002 a été mesuré, et
 *    son correctif y tient.
 *  - à **96 kHz** : une fenêtre pleine de 40 ms fait ~3840 trames (`n = 4096`)
 *    et une fenêtre écourtée ~1080 (`n = 2048`). **La taille bascule à chaque
 *    trame courte.**
 *
 * Et la taille annoncée entrait DEUX FOIS dans l'axe :
 *
 *  1. dans `cleFormat`, donc `capaciteMaintenue` jetait toute la mémoire
 *     anti-clignotement à chaque bascule et l'axe retombait sur la trame
 *     courte ;
 *  2. dans `spectrumIsoTicks`, qui rejoue la troncature du serveur sur cette
 *     taille — à table `spectrum_resolved` IDENTIQUE, 2048 et 4096 ne rendent
 *     pas les mêmes repères.
 *
 * Une taille de FFT qui suit la longueur d'une trame ne décrit pas un FORMAT :
 * elle décrit un découpage. Ce banc tient les deux moitiés.
 *
 * ## Ce que ce banc NE prouve PAS
 *
 * Que ce soit ce que Didier voit. Sa capture est compatible (aucun repère
 * entre 63 Hz et 2 kHz, exactement ce que rend une trame courte), mais aucune
 * trame `audio_levels` de son installation n'a été observée, et le fichier
 * porte la mention « Transcodé » : le taux réellement analysé n'est pas
 * établi. Si son clignotement porte sur les BARRES et non sur l'axe, ce
 * correctif est juste et sans effet sur sa plainte.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { cleFormat, capaciteMaintenue, CAPACITE_VIDE } from '../axeSpectre';
import { spectrumIsoTicks } from '../spectrumScale';

/** Un booléen par bande, monotone comme celles du serveur. */
const table = (nonResolues: number) => Array.from({ length: 32 }, (_, i) => i >= nonResolues);

/**
 * Les deux trames du 96 kHz.
 *
 * Fenêtre pleine : ~3840 trames → `n = 4096`, résolution 96000/3840 = 25 Hz.
 * Fenêtre écourtée : ~1080 trames → `n = 2048`, résolution 96000/1080 = 89 Hz.
 */
const PLEINE = { fftSize: 4096, resolus: table(8) };
const ECOURTEE = { fftSize: 2048, resolus: table(14) };

const axe = (c: { resolus: boolean[] | null; fftSize: number | null }) =>
  spectrumIsoTicks(96000, 32, { fftSize: c.fftSize, resolus: c.resolus }).map((t) => t.hz);

describe('#1454 — le clignotement du 96 kHz', () => {
  it('les deux trames NE rendent PAS le même axe — le clignotement est là', () => {
    // Le constat de départ : sans mémoire, l'axe saute de 125 Hz à 500 Hz et
    // revient, plusieurs fois par seconde.
    expect(axe({ ...PLEINE } as any)[0]).toBe(125);
    expect(axe({ ...ECOURTEE } as any)[0]).toBe(500);
  });

  it("la taille de FFT ne fait plus partie de l'identité du FORMAT", () => {
    // 🔴 C'est le cœur : `n` suit la longueur d'une trame, pas le format. Deux
    // trames du même flux 96 kHz doivent porter la MÊME clé.
    expect(cleFormat(96000, 32)).toBe(cleFormat(96000, 32));
    expect(cleFormat(96000, 32)).not.toBe(cleFormat(44100, 32));
    expect(cleFormat(96000, 32)).not.toBe(cleFormat(96000, 16));
  });

  it("la capacité SURVIT à une trame écourtée — c'était le défaut", () => {
    const cle = cleFormat(96000, 32);
    let c = capaciteMaintenue(CAPACITE_VIDE, cle, PLEINE.resolus, PLEINE.fftSize);
    c = capaciteMaintenue(c, cle, ECOURTEE.resolus, ECOURTEE.fftSize);
    expect(c.resolus).toEqual(PLEINE.resolus);
    expect(c.fftSize).toBe(4096);
  });

  it("la séquence alternée, rejouée, ne bouge plus d'un repère", () => {
    const cle = cleFormat(96000, 32);
    let c = CAPACITE_VIDE;
    const axes: number[][] = [];
    for (const trame of [PLEINE, ECOURTEE, PLEINE, ECOURTEE, ECOURTEE, PLEINE]) {
      c = capaciteMaintenue(c, cle, trame.resolus, trame.fftSize);
      // 🔴 Les DEUX dimensions sont tenues à chaque trame — sans la taille
      // mémorisée, l'axe se replierait sur le repli 2048 et ce banc passerait
      // au vert pour la mauvaise raison.
      expect(c.fftSize).toBe(4096);
      axes.push(axe(c));
    }
    const attendu = [125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    for (const a of axes) expect(a).toEqual(attendu);
  });

  it('une trame PLUS large élargit encore, dans les deux dimensions', () => {
    const cle = cleFormat(192000, 32);
    let c = capaciteMaintenue(CAPACITE_VIDE, cle, table(14), 2048);
    c = capaciteMaintenue(c, cle, table(6), 8192);
    expect(c.resolus).toEqual(table(6));
    expect(c.fftSize).toBe(8192);
  });

  it("un vrai changement de format jette bien tout", () => {
    // Passer de 96 kHz à 44,1 kHz : plus rien de l'ancien ne vaut.
    let c = capaciteMaintenue(CAPACITE_VIDE, cleFormat(96000, 32), PLEINE.resolus, PLEINE.fftSize);
    const autre = cleFormat(44100, 32);
    c = capaciteMaintenue(c, autre, ECOURTEE.resolus, ECOURTEE.fftSize);
    expect(c.cle).toBe(autre);
    expect(c.resolus).toEqual(ECOURTEE.resolus);
    expect(c.fftSize).toBe(2048);
  });

  it("une trame sans taille annoncée ne détruit pas celle qu'on savait", () => {
    // Un serveur antérieur à `spectrum_fft_size` n'annonce rien : on garde.
    const cle = cleFormat(96000, 32);
    let c = capaciteMaintenue(CAPACITE_VIDE, cle, PLEINE.resolus, PLEINE.fftSize);
    for (const rien of [null, undefined, 0, 1]) {
      c = capaciteMaintenue(c, cle, PLEINE.resolus, rien as any);
      expect(c.fftSize).toBe(4096);
    }
  });
});

describe("#1454 — le BRANCHEMENT dans l'écran", () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/components/partages/AudioVisualizer.svelte'),
    'utf-8',
  );

  it("la clé de format ne porte plus la taille de FFT de la trame courante", () => {
    expect(src).not.toMatch(/cleFormat\([^)]*annonceSpectre\?\.fftSize/);
  });

  it("l'axe est nourri de la taille MÉMORISÉE, pas de celle de la trame", () => {
    const i = src.indexOf('spectrumIsoTicks(');
    expect(i).toBeGreaterThan(-1);
    const appel = src.slice(i, src.indexOf('});', i) + 3);
    expect(appel).toContain('capacite.fftSize');
    expect(appel).toContain('capacite.resolus');
  });
});
