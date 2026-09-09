import { describe, expect, it } from 'vitest';
import { etatWav24, wav24Disponible } from '../wav24Gate';
import type { RendererCapabilities } from '../types';

/** Une sonde qui a répondu, avec les seuls drapeaux qui comptent ici. */
function sonde(p: Partial<RendererCapabilities>): RendererCapabilities {
  return { probed: true, ...p };
}

describe('porte du WAV 24 bits (#303)', () => {
  it('ouvre sur audio/L24, la capacité historique', () => {
    expect(etatWav24(sonde({ lpcm24: true }), false)).toBe('ouvert');
  });

  it('ouvre sur audio/wav seul — le darTZeel LHC-208 n’annonce jamais L24', () => {
    // Yves Corbat : l'appareil lit le WAV mais n'annonce pas audio/L24.
    expect(etatWav24(sonde({ wav: true, lpcm16: true, flac: true }), false)).toBe('ouvert');
  });

  it('reste ATTEIGNABLE quand aucune sonde n’a abouti — c’est le défaut du ticket', () => {
    // Aucune sonde lancée : l'écran s'ouvre sur cet état.
    expect(etatWav24(null, false)).toBe('sans_preuve');
    expect(wav24Disponible(null, false)).toBe(true);
    // Sonde lancée mais sans réponse (`probed: false`) : le serveur qualifie
    // lui-même ce cas d'« inconclusive ». Une absence de réponse n'est pas un
    // refus — le LHC-208 est lent à acquitter ses commandes SOAP.
    for (const raison of ['soap_failed', 'empty_sink', 'renderer_offline']) {
      const inconcluant: RendererCapabilities = { probed: false, reason: raison };
      expect(etatWav24(inconcluant, false), raison).toBe('sans_preuve');
      expect(wav24Disponible(inconcluant, false), raison).toBe(true);
    }
  });

  it('GARDE-FOU : refuse un appareil dont la sonde prouve qu’il ne sait pas faire', () => {
    // audio/L16 seul = le profil LPCM standard, 16 bits : y servir du 24 bits
    // rejoue le silence de #1137.
    const l16Seul = sonde({ lpcm16: true, flac: true, mp3: true });
    expect(etatWav24(l16Seul, false)).toBe('refuse');
    expect(wav24Disponible(l16Seul, false)).toBe(false);
    // Un renderer qui ne fait que du compressé : même verdict.
    expect(wav24Disponible(sonde({ mp3: true, aac: true }), false)).toBe(false);
  });

  it('ne rétrograde jamais une zone qui porte déjà le 24 bits', () => {
    expect(wav24Disponible(null, true)).toBe(true);
    expect(wav24Disponible(sonde({ lpcm16: true }), true)).toBe(true);
  });

  it('sépare les trois états — l’écran ne peut donc pas les confondre', () => {
    const etats = [
      etatWav24(sonde({ wav: true }), false),
      etatWav24(null, false),
      etatWav24(sonde({ lpcm16: true }), false),
    ];
    expect(etats).toEqual(['ouvert', 'sans_preuve', 'refuse']);
    expect(new Set(etats).size).toBe(3);
  });

  it('ne prend pas un drapeau absent pour un drapeau vrai', () => {
    // Une sonde qui a répondu sans rien annoncer reste un refus établi.
    expect(etatWav24(sonde({}), false)).toBe('refuse');
  });
});
