/**
 * Retour de Didier (rc13.90) — les consignes de placement du micro :
 * l'orientation suit le fichier d'étalonnage, et les textes sont là dans
 * les 20 langues, avec leurs repères.
 */
import { describe, expect, it } from 'vitest';
import { orientationMicro, texteOrientation } from '../correctionPieceProtocole';
import fr from '../locales/fr';
import en from '../locales/en';

describe('orientation du micro selon l’étalonnage', () => {
  it('lit 90° dans le nom miniDSP, 0° sinon, et ne sait pas sans étalonnage', () => {
    expect(orientationMicro('UMIK-1_7001234_90deg')).toBe('90');
    expect(orientationMicro('7001234_90')).toBe('90');
    expect(orientationMicro('UMIK-1_7001234')).toBe('0');
    // Un « 90 » au milieu d'un numéro de série n'est pas une orientation.
    expect(orientationMicro('7090123')).toBe('0');
    expect(orientationMicro('')).toBe('inconnue');
    expect(orientationMicro(null)).toBe('inconnue');
  });

  it('donne le texte traduit à glisser dans {orientation}', () => {
    const t = (k: string) => (fr as Record<string, string>)[k];
    expect(texteOrientation('x_90deg', t)).toContain('plafond');
    expect(texteOrientation('x', t)).toContain('enceintes');
    expect(texteOrientation(null, t)).toContain('90°');
  });

  it('les consignes disent hauteur d’oreille, place d’écoute, 30 à 50 cm et l’orientation', () => {
    const f = fr as Record<string, string>;
    expect(f['v2.room.measureConfirm']).toContain("hauteur d'oreille");
    expect(f['v2.room.measureConfirm']).toContain('{orientation}');
    expect(f['v2.room.multiConfirm']).toContain('{orientation}');
    expect(f['v2.room.multiHow']).toContain('30 à 50 cm');
    expect((en as Record<string, string>)['v2.room.beforePosition']).toContain('{orientation}');
  });
});
