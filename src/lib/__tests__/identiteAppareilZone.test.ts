/**
 * #763 — « Impossible d'effacer marque et modèle d'une zone. »
 *
 * Les cas sont ceux du .18 : l'Eversolo, seule des quatorze zones à porter une
 * marque CHOISIE, et le Sonos, qui n'a que sa détection.
 */
import { describe, it, expect } from 'vitest';
import { identiteEffective, identiteModifiee } from '../identiteAppareilZone';

const EVERSOLO = {
  brand: 'Eversolo', model: 'DMP-A8',
  detected_manufacturer: 'EVERSOLO', detected_model: 'AV Renderer Device',
};
const SONOS = {
  brand: null, model: null,
  detected_manufacturer: 'Sonos, Inc.', detected_model: 'Sonos Play:1',
};

describe('L’identité effective', () => {
  it('préfère le choix de l’utilisateur à la détection', () => {
    expect(identiteEffective(EVERSOLO)).toEqual({ marque: 'Eversolo', modele: 'DMP-A8' });
  });

  it('se rabat sur la détection quand rien n’a été choisi', () => {
    expect(identiteEffective(SONOS)).toEqual({ marque: 'Sonos, Inc.', modele: 'Sonos Play:1' });
  });

  it('rend des chaînes vides quand rien n’est connu', () => {
    expect(identiteEffective({})).toEqual({ marque: '', modele: '' });
  });
});

describe('Ce qui compte comme une modification', () => {
  it('🔴 vider un champ DÉTECTÉ compte — c’était le défaut #763', () => {
    // L'utilisateur veut retirer une identité que la découverte a posée. Avec
    // l'ancienne comparaison (contre le seul override), `'' === ''` : l'écran
    // se croyait vierge et « Appliquer » disparaissait.
    expect(identiteModifiee(SONOS, '', '')).toBe(true);
    expect(identiteModifiee(SONOS, 'Sonos, Inc.', '')).toBe(true);
  });

  it('🔴 une zone DÉTECTÉE et non touchée n’est PAS modifiée', () => {
    // L'autre moitié du même défaut : « Appliquer » restait affiché en
    // permanence sur les treize zones du .18 qui n'ont que leur détection.
    expect(identiteModifiee(SONOS, 'Sonos, Inc.', 'Sonos Play:1')).toBe(false);
  });

  it('vider un override compte, comme avant', () => {
    expect(identiteModifiee(EVERSOLO, '', '')).toBe(true);
  });

  it('une zone dont on n’a rien changé n’est pas modifiée', () => {
    expect(identiteModifiee(EVERSOLO, 'Eversolo', 'DMP-A8')).toBe(false);
  });

  it('les espaces autour ne comptent pas', () => {
    expect(identiteModifiee(EVERSOLO, '  Eversolo ', ' DMP-A8  ')).toBe(false);
  });

  it('changer l’un ou l’autre suffit', () => {
    expect(identiteModifiee(EVERSOLO, 'Eversolo', 'DMP-A6')).toBe(true);
    expect(identiteModifiee(EVERSOLO, 'Zidoo', 'DMP-A8')).toBe(true);
  });
});

describe('🔴 L’écran appelle bien cette règle', () => {
  it('ZoneDeviceEditor ne recalcule plus `deviceDirty` à la main', async () => {
    const source = await import('fs').then((fs) =>
      fs.readFileSync('src/components/ZoneDeviceEditor.svelte', 'utf8'),
    );
    expect(source).toContain('identiteModifiee(zone, selectedBrand, selectedModel)');
    // La comparaison au seul override ne doit pas revenir par habitude.
    expect(source).not.toMatch(/!==\s*\(zone\.brand \?\? ''\)/);
  });
});
