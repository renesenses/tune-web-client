import { describe, expect, it } from 'vitest';
import { temperatureProcesseur } from '../temperatureProcesseur';

// tune-server-rust#5189 — `cpu_temp_c` de `GET /system/diagnostics`.
describe('temperatureProcesseur (#5189)', () => {
  it('affiche la valeur en °C, arrondie à l’entier', () => {
    expect(temperatureProcesseur(52.4, 'indisponible')).toBe('52 °C');
    expect(temperatureProcesseur(52.5, 'indisponible')).toBe('53 °C');
  });

  it('affiche « indisponible » quand le serveur n’a pas de capteur (null)', () => {
    expect(temperatureProcesseur(null, 'indisponible')).toBe('indisponible');
  });

  it('contre-épreuve : un serveur antérieur (champ absent) ne produit aucune ligne', () => {
    expect(temperatureProcesseur(undefined, 'indisponible')).toBeNull();
    // Et « absent » ne se confond pas avec « pas de capteur ».
    expect(temperatureProcesseur(undefined, 'x')).not.toBe(temperatureProcesseur(null, 'x'));
  });
});
