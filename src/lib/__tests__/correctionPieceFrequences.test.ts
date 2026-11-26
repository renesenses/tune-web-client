// tune-server-rust rc14 — la mesure à la fréquence native du micro.
//
// Le serveur accepte désormais 44,1 à 192 kHz (`frequences_acceptees` de
// `GET /microphones`) et pose `mesurable` en conséquence : l'avertissement
// disparaît pour ces fréquences, et reste, avec la liste, pour les autres.
// Un serveur plus ancien (sans la liste) garde l'ancien message.

import { describe, expect, it } from 'vitest';
import { avertissementFrequenceMicro, type EntreeMicro } from '../correctionPiece';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const ACCEPTEES = [44100, 48000, 88200, 96000, 176400, 192000];

const micro = (frequence_courante: number | null, mesurable: boolean): EntreeMicro => ({
  nom: 'TASCAM US-366', id: 'us366', canaux: 2, frequence_courante, virtuelle: false, mesurable,
});

describe('avertissement de fréquence du micro (rc14)', () => {
  const fr = dictionnaire('fr');
  const tr = (cle: string) => fr[cle] ?? cle;

  it('aucun avertissement pour une fréquence prise en charge', () => {
    for (const hz of ACCEPTEES) {
      expect(avertissementFrequenceMicro(micro(hz, true), 48000, tr, ACCEPTEES)).toBeNull();
    }
  });

  it('une fréquence non prise en charge : la fréquence du micro et la liste', () => {
    const a = avertissementFrequenceMicro(micro(32000, false), 48000, tr, ACCEPTEES)!;
    expect(a).toContain('32000 Hz');
    expect(a).toContain('44100, 48000, 88200, 96000, 176400, 192000 Hz');
    expect(a).not.toMatch(/\{hz\}|\{liste\}/);
    expect(a).not.toContain('réglez-le à 48000');
  });

  it('serveur d’avant la rc14 (sans liste) : l’ancien message', () => {
    const a = avertissementFrequenceMicro(micro(44100, false), 48000, tr, undefined)!;
    expect(a).toBe(fr['v2.room.micRate'].replaceAll('{hz}', '48000'));
  });

  it('format illisible : la vraie cause, liste ou pas', () => {
    expect(avertissementFrequenceMicro(micro(null, false), 48000, tr, ACCEPTEES)).toBe(fr['v2.room.micFormatUnknown']);
  });

  it.each(ONZE_LANGUES)('%s : le message est traduit et ses deux paramètres remplis', (code) => {
    const d = dictionnaire(code);
    const brut = d['v2.room.micRateList'];
    expect(brut, `${code} : clé absente`).toBeTruthy();
    expect(brut).toContain('{hz}');
    expect(brut).toContain('{liste}');
    const a = avertissementFrequenceMicro(micro(32000, false), 48000, (c) => d[c] ?? c, ACCEPTEES)!;
    expect(a).toContain('32000');
    expect(a).toContain('192000');
    expect(a).not.toMatch(/\{hz\}|\{liste\}/);
  });
});
