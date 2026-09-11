// 🔴 `renesenses/tune-web-client#892` — Pascal (bluevelvet), fil 1765, ticket
// 114, Tune 0.9.144 Windows / WASAPI :
//
//   « l'échelle des fréquences affichée sous les barres commence seulement à
//     250 Hz […] Pourtant, les barres représentent visiblement aussi les
//     fréquences situées en dessous. »
//
// J'ai d'abord accusé le SERVEUR, sur la foi d'un long commentaire de
// `spectrumScale.ts` qui décrit un serveur disparu depuis #2866 (PR #2987,
// v0.9.129). C'était faux et c'était public. Le serveur porte
// `SPECTRUM_FFT_MAX = 8192`, une FFT adaptative, et une résolution CONSTANTE
// d'environ 25 Hz de 44,1 à 192 kHz. Il ANNONCE tout cela sur
// `playback.audio_levels` — et le client n'en lisait RIEN.
//
// CE QUE CE FICHIER TIENT
// -----------------------
//  1. le magasin ne jette plus les trois champs d'annonce ;
//  2. l'échelle suit la taille annoncée, et non une constante ;
//  3. le repère 125 Hz revient à 96 et 192 kHz — c'est exactement le « 250 Hz »
//     que Pascal voit ;
//  4. le booléen par bande du serveur PRIME sur notre reconstitution ;
//  5. un serveur qui n'annonce rien garde l'ancien comportement, juste pour lui.
//
// CONTRE-ÉPREUVE : la dernière épreuve rejoue l'appel d'AVANT — sans annonce —
// et exige qu'il redonne bien le 250 Hz. Sans elle, un module qui rendrait
// toujours les mêmes repères passerait pour corrigé.
import { describe, expect, it } from 'vitest';
import {
  SERVER_FFT_SIZE_PAR_DEFAUT,
  serverBandSpans,
  spectrumIsoTicks,
} from '../spectrumScale';
import { audioLevels, handleAudioLevelsEvent } from '../stores/audioLevels';
import { currentZoneId } from '../stores/zones';
import { get } from 'svelte/store';

/** Le serveur rend 32 bandes (`levels.rs`). */
const BANDES = 32;

/** La taille RÉELLE de la FFT du serveur, par fréquence d'échantillonnage. */
const TAILLE_REELLE: Record<number, number> = {
  44100: 2048, 48000: 2048, 96000: 4096, 192000: 8192,
};

const premiers = (sr: number, taille?: number) =>
  spectrumIsoTicks(sr, BANDES, taille ? { fftSize: taille } : null).map((t) => t.hz);

describe('#892 — l’échelle suit la FFT que le serveur ANNONCE', () => {
  it('le repli vaut toujours 2048 : un serveur d’avant #2866 reste juste', () => {
    expect(SERVER_FFT_SIZE_PAR_DEFAUT).toBe(2048);
    expect(premiers(96000)).toEqual(premiers(96000, 2048));
  });

  it('🔴 le « 250 Hz » de Pascal redevient 125 Hz dès qu’on écoute le serveur', () => {
    // Sans annonce — ce que faisait le client — le premier repère est 250 Hz.
    expect(premiers(96000)[0], 'le symptôme signalé n’est pas reproduit').toBe(250);
    // Avec la taille réellement employée à 96 kHz, il descend à 125 Hz.
    expect(premiers(96000, TAILLE_REELLE[96000])[0]).toBe(125);
  });

  it('à 192 kHz aussi : 500 Hz sans annonce, 125 Hz avec', () => {
    expect(premiers(192000)[0]).toBe(500);
    expect(premiers(192000, TAILLE_REELLE[192000])[0]).toBe(125);
  });

  it('à 44,1 et 48 kHz rien ne bouge : la FFT y valait déjà 2048', () => {
    for (const sr of [44100, 48000]) {
      expect(premiers(sr, TAILLE_REELLE[sr]), `à ${sr} Hz`).toEqual(premiers(sr));
    }
  });

  it('le haut de l’échelle n’a jamais été en cause', () => {
    // 16 kHz est le dernier repère ISO à l'octave ; les barres montent bien à
    // 20 kHz, il n'y a rien à graduer entre les deux. Répondu au testeur.
    for (const sr of [44100, 96000, 192000]) {
      const t = premiers(sr, TAILLE_REELLE[sr]);
      expect(t[t.length - 1], `à ${sr} Hz`).toBe(16000);
    }
  });

  it('une FFT plus longue rend les bandes basses distinctes', () => {
    const court = serverBandSpans(96000, BANDES, 2048).filter((s) => s.distinct).length;
    const long = serverBandSpans(96000, BANDES, 4096).filter((s) => s.distinct).length;
    expect(long, 'allonger la FFT ne distingue pas plus de bandes').toBeGreaterThan(court);
  });

  it('le booléen par bande du serveur PRIME sur notre reconstitution', () => {
    const taille = TAILLE_REELLE[96000];
    const avec = spectrumIsoTicks(96000, BANDES, { fftSize: taille }).map((t) => t.hz);
    // Le serveur dit « je ne distingue AUCUNE bande » : aucun repère ne tient.
    const aucun = spectrumIsoTicks(96000, BANDES, {
      fftSize: taille,
      resolus: Array(BANDES).fill(false),
    });
    expect(avec.length).toBeGreaterThan(0);
    expect(aucun, 'notre reconstitution passe devant ce que le serveur affirme').toEqual([]);
    // Un tableau de la mauvaise taille est ignoré : on ne devine pas.
    expect(
      spectrumIsoTicks(96000, BANDES, { fftSize: taille, resolus: [false, false] }).map((t) => t.hz),
    ).toEqual(avec);
  });

  it('CONTRE-ÉPREUVE : sans annonce, le défaut de Pascal revient tel quel', () => {
    const sansAnnonce = spectrumIsoTicks(96000, BANDES, null).map((t) => t.hz);
    const avecAnnonce = spectrumIsoTicks(96000, BANDES, { fftSize: 4096 }).map((t) => t.hz);
    expect(sansAnnonce[0], 'le repli ne reproduit plus le symptôme : l’épreuve ne garde rien')
      .toBe(250);
    expect(avecAnnonce[0]).toBe(125);
    expect(sansAnnonce).not.toEqual(avecAnnonce);
  });
});

describe('#892 — le magasin ne jette plus ce que le serveur annonce', () => {
  it('les trois champs arrivent jusqu’à l’écran', () => {
    currentZoneId.set(7);
    handleAudioLevelsEvent({
      zone_id: 7,
      spectrum_db: [-20, -30],
      spectrum_fft_size: 4096,
      spectrum_resolution_hz: 25,
      spectrum_resolved: [true, false],
    });
    const n = get(audioLevels);
    expect(n.spectrum_fft_size, 'la taille de FFT est encore jetée').toBe(4096);
    expect(n.spectrum_resolution_hz).toBe(25);
    expect(n.spectrum_resolved).toEqual([true, false]);
  });

  it('un serveur qui n’annonce rien ne casse rien', () => {
    currentZoneId.set(8);
    handleAudioLevelsEvent({ zone_id: 8, spectrum_db: [-20] });
    const n = get(audioLevels);
    expect(n.spectrum_fft_size).toBeNull();
    expect(n.spectrum_resolution_hz).toBeNull();
    expect(n.spectrum_resolved).toEqual([]);
  });
});
