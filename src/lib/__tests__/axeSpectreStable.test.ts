/**
 * L’axe de l’analyseur ne doit pas clignoter — Bertrand, 13/09/2026 :
 * « Ajoute les fréquences < 250 Hz ».
 *
 * ## La mesure
 *
 * Trames `playback.audio_levels` RÉELLES, relevées sur la .18 le 13/09/2026,
 * zone Eversolo DMP-A8, FLAC 44,1 kHz / 24 bits :
 *
 * ```text
 * trame 1  spectrum_frames = 1764  résolution = 25,0 Hz   8 bandes non résolues
 * trame 2  spectrum_frames = 1080  résolution = 40,8 Hz  10 bandes non résolues
 * trame 3  spectrum_frames = 1764  résolution = 25,0 Hz   8 bandes non résolues
 * ```
 *
 * Et ce que cela donne sur la grille ISO, calculé :
 *
 * ```text
 * 1764 trames → repères tenables : 125, 250, 500, 1000 Hz
 * 1080 trames → repères tenables :      250, 500, 1000 Hz
 * ```
 *
 * L’axe suivait la DERNIÈRE trame. 125 Hz apparaissait et disparaissait
 * plusieurs fois par seconde ; une capture prise sur une trame courte ne montre
 * rien sous 250 Hz.
 *
 * ## Ce que cette garde tient
 *
 * Que la capacité retenue est la plus large observée POUR CE FORMAT, et qu’elle
 * est jetée dès que le format change.
 *
 * ## Ce qu’elle ne tient PAS
 *
 * Elle ne fait pas apparaître 63 ni 31 Hz. À 44,1 kHz il faudrait une fenêtre
 * d’analyse de 71 ms et 135 ms — contre 40 ms aujourd’hui. C’est un arbitrage
 * serveur, pas un correctif d’affichage.
 */
import { describe, it, expect } from 'vitest';
import {
  cleFormat, capaciteMaintenue, CAPACITE_VIDE,
} from '../axeSpectre';
import { spectrumIsoTicks } from '../spectrumScale';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const visualiseur = () =>
  readFileSync(resolve(process.cwd(), 'src/components/partages/AudioVisualizer.svelte'), 'utf-8');

/** Les deux tables mesurées : 8 puis 10 bandes non résolues sur 32. */
const table = (nonResolues: number) =>
  Array.from({ length: 32 }, (_, i) => i >= nonResolues);
const LONGUE = table(8);   // trame de 1764 échantillons
const COURTE = table(10);  // trame de 1080 échantillons
/**
 * 🔴 #1454 (22/09/2026) — `cleFormat` ne prend PLUS la taille de FFT.
 *
 * Elle y était, et ce banc l'exigeait (« le débit, la taille de FFT et le
 * nombre de bandes comptent tous les trois »). C'était l'hypothèse fausse :
 * côté serveur la taille suit la LONGUEUR DE LA TRAME
 * (`n = m.next_power_of_two().min(8192)`), pas le format. À 44,1 kHz — le seul
 * format sur lequel #1002 a été mesuré — 1764 et 1080 trames donnent tous deux
 * 2048, donc rien ne se voyait. À 96 kHz elle bascule entre 4096 et 2048 à
 * chaque trame écourtée, et toute la mémoire de ce module était jetée.
 *
 * Le format, c'est le débit et le nombre de bandes. La taille de FFT est
 * désormais MÉMORISÉE comme une capacité. Voir `axeSpectre96k1454.test.ts`.
 */
const CLE = cleFormat(44100, 32);

describe('la capacité retenue est la plus large vue pour ce format', () => {
  it('une première trame pose la capacité', () => {
    const c = capaciteMaintenue(CAPACITE_VIDE, CLE, LONGUE);
    expect(c.cle).toBe(CLE);
    expect(c.resolus).toEqual(LONGUE);
  });

  /** 🔴 LE CAS MESURÉ : la trame courte ne doit PAS rétrécir l’axe. */
  it('une trame plus COURTE ne rétrécit pas la capacité', () => {
    let c = capaciteMaintenue(CAPACITE_VIDE, CLE, LONGUE);
    c = capaciteMaintenue(c, CLE, COURTE);
    expect(c.resolus).toEqual(LONGUE);
  });

  it('mais une trame plus LARGE l’élargit', () => {
    let c = capaciteMaintenue(CAPACITE_VIDE, CLE, COURTE);
    c = capaciteMaintenue(c, CLE, LONGUE);
    expect(c.resolus).toEqual(LONGUE);
  });

  it('la séquence mesurée, rejouée, ne perd jamais 125 Hz', () => {
    let c = CAPACITE_VIDE;
    const bas: number[] = [];
    for (const t of [LONGUE, COURTE, LONGUE, COURTE, COURTE]) {
      c = capaciteMaintenue(c, CLE, t);
      const ticks = spectrumIsoTicks(44100, 32, { fftSize: 2048, resolus: c.resolus });
      bas.push(ticks[0]?.hz ?? -1);
    }
    // 🔴 Le plus bas repère reste 125 Hz d'un bout à l'autre.
    expect(bas).toEqual([125, 125, 125, 125, 125]);
  });

  it('sans la stabilisation, la trame courte remonterait l’axe à 250 Hz', () => {
    // Le comportement d'AVANT : on prend la trame telle quelle.
    const avecCourte = spectrumIsoTicks(44100, 32, { fftSize: 2048, resolus: COURTE });
    const avecLongue = spectrumIsoTicks(44100, 32, { fftSize: 2048, resolus: LONGUE });
    expect(avecCourte[0].hz).toBe(250);
    expect(avecLongue[0].hz).toBe(125);
  });

  /** Changer de format rend l'ancienne capacité caduque. */
  it('un changement de format jette la capacité', () => {
    let c = capaciteMaintenue(CAPACITE_VIDE, CLE, LONGUE);
    const autre = cleFormat(96000, 32);
    c = capaciteMaintenue(c, autre, COURTE);
    expect(c.cle).toBe(autre);
    expect(c.resolus).toEqual(COURTE);
  });

  it('le débit et le nombre de bandes comptent — la taille de FFT, non (#1454)', () => {
    const a = cleFormat(44100, 32);
    expect(a).not.toBe(cleFormat(48000, 32));
    expect(a).not.toBe(cleFormat(44100, 16));
  });

  it('une trame sans table ne détruit pas ce qu’on savait', () => {
    let c = capaciteMaintenue(CAPACITE_VIDE, CLE, LONGUE);
    for (const rien of [null, undefined, []]) {
      c = capaciteMaintenue(c, CLE, rien as any);
      expect(c.resolus).toEqual(LONGUE);
    }
  });

  /**
   * 🔴 On garde la table ENTIÈRE, on ne fusionne pas bande à bande : le serveur
   * la construit par un seuil unique, donc elle est monotone — un préfixe de
   * `false` puis des `true`. Un mélange produirait une table qu'il n'aurait
   * jamais pu émettre.
   */
  it('la table retenue reste monotone, comme celles du serveur', () => {
    let c = CAPACITE_VIDE;
    for (const t of [COURTE, LONGUE, COURTE]) c = capaciteMaintenue(c, CLE, t);
    const r = c.resolus!;
    const premierVrai = r.indexOf(true);
    expect(r.slice(premierVrai).every(Boolean)).toBe(true);
    expect(r.slice(0, premierVrai).some(Boolean)).toBe(false);
  });

  /**
   * 🔴 LE BRANCHEMENT. Une règle juste que personne n'appelle, c'est l'état
   * d'avant — et cette contre-épreuve-ci est d'abord ressortie VERTE : rien ne
   * vérifiait que le composant emploie la capacité stabilisée plutôt que la
   * trame brute. Le module était gardé, son usage ne l'était pas.
   */
  it('le composant nourrit l’axe de la CAPACITÉ, pas de la dernière trame', () => {
    const src = visualiseur();
    expect(src).toContain('capaciteMaintenue(');
    const i = src.indexOf('spectrumIsoTicks(');
    expect(i).toBeGreaterThan(-1);
    const appel = src.slice(i, src.indexOf('});', i) + 3);
    expect(appel).toContain('capacite.resolus');
    expect(appel).not.toMatch(/resolus:\s*annonceSpectre\?\.resolus/);
  });

  /**
   * Et il doit rester HORS de `spectrumTargets` : la garde
   * `spectreSansInvention` interdit que le calcul des barres touche aux
   * métadonnées de la piste, et `sampleRate` en est une.
   */
  it('la stabilisation ne redescend pas dans le calcul des barres', () => {
    const src = visualiseur();
    const i = src.indexOf('function spectrumTargets');
    const corps = src.slice(i, src.indexOf('\n  }', i));
    expect(corps).not.toContain('capaciteMaintenue');
    expect(corps).not.toContain('sampleRate');
  });
});
