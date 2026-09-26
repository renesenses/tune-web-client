import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CODE_CODEC_INCONNU,
  descriptionDEtape,
  etatSansPerte,
} from '../formatInconnu';

// #4346 — la capture de Jean Valjean (fil 1825) : radio pas encore sondée,
// sortie locale Windows. L'écran disait « Avec perte » et « Unknown » ×3.
describe('#4346 — codec inconnu dans le chemin du signal', () => {
  it('lossless: null est l\'état INCONNU, jamais « avec perte »', () => {
    expect(etatSansPerte({ lossless: null, bit_perfect: false })).toBe('unknown');
  });

  it('un codec connu garde son verdict', () => {
    expect(etatSansPerte({ lossless: true, bit_perfect: false })).toBe('lossless');
    expect(etatSansPerte({ lossless: false, bit_perfect: false })).toBe('lossy');
  });

  it('serveur 0.9.165 : champ absent ⇒ repli sur bit_perfect, comme avant', () => {
    expect(etatSansPerte({ bit_perfect: true })).toBe('lossless');
    expect(etatSansPerte({ bit_perfect: false })).toBe('lossy');
    expect(etatSansPerte({ lossless: false, bit_perfect: false })).toBe('lossy');
  });

  it('le jeton du codec inconnu est traduit, la résolution est gardée', () => {
    const step = { description: '? → ? 44kHz/16bit', code: CODE_CODEC_INCONNU };
    expect(descriptionDEtape(step, 'Format inconnu')).toBe(
      'Format inconnu → Format inconnu 44kHz/16bit',
    );
    expect(descriptionDEtape({ description: '?', code: CODE_CODEC_INCONNU }, 'Unknown format')).toBe(
      'Unknown format',
    );
  });

  it('une étape sans le code est rendue telle quelle', () => {
    expect(descriptionDEtape({ description: 'FLAC 44kHz/16bit' }, 'Format inconnu')).toBe(
      'FLAC 44kHz/16bit',
    );
    // Un « ? » d'une autre étape n'est pas le jeton : pas de code, pas de remplacement.
    expect(descriptionDEtape({ description: 'Pourquoi ?', code: 'rate_conversion' }, 'X')).toBe(
      'Pourquoi ?',
    );
    // Serveur 0.9.165 : « Unknown » sans code reste tel quel.
    expect(descriptionDEtape({ description: 'Unknown' }, 'Format inconnu')).toBe('Unknown');
  });

  it('les deux panneaux lisent l\'état et la description par ces fonctions', () => {
    for (const fichier of ['NowPlaying.svelte', 'TransportBar.svelte']) {
      const src = readFileSync(
        resolve(__dirname, '../../components/partages', fichier),
        'utf8',
      );
      expect(src, fichier).toContain("etatSansPerte(zone.signal_path) === 'unknown'");
      expect(src, fichier).toContain("descriptionDEtape(step, $t('signal.unknownFormat'");
      // L'ancien en-tête binaire, qui transformait `null` en « Avec perte », a disparu.
      expect(src, fichier).not.toContain(
        "(zone.signal_path.lossless ?? zone.signal_path.bit_perfect) ? $t('signal.lossless') : $t('signal.lossy')",
      );
    }
  });
});
