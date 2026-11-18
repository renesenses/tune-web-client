import { describe, expect, it } from 'vitest';
import { choixPeriodeWasapi, periodeWasapiVisible } from '../periodeWasapi';

/** tune-server-rust#8696 — le sélecteur « Période WASAPI exclusif ». */
describe('periodeWasapi (#8696)', () => {
  const windows: Parameters<typeof periodeWasapiVisible>[0] = {
    output_type: 'local',
    exclusive_mode: null,
    wasapi_exclusive_period_ms: null,
    wasapi_exclusive_period_choices_ms: [10, 20, 50, 100],
    wasapi_exclusive_period_applicable: true,
  };

  it('visible sur une zone locale d’un serveur Windows qui connaît le réglage', () => {
    expect(periodeWasapiVisible(windows)).toBe(true);
    expect(periodeWasapiVisible({ ...windows, exclusive_mode: true })).toBe(true);
  });

  it('masqué hors Windows, en partagé, sur une zone réseau ou un ancien serveur', () => {
    expect(periodeWasapiVisible({ ...windows, wasapi_exclusive_period_applicable: false })).toBe(false);
    expect(periodeWasapiVisible({ ...windows, exclusive_mode: false })).toBe(false);
    expect(periodeWasapiVisible({ ...windows, output_type: 'dlna' })).toBe(false);
    expect(periodeWasapiVisible({ ...windows, wasapi_exclusive_period_ms: undefined })).toBe(false);
  });

  it('propose les choix du serveur, et y ajoute une valeur réglée ailleurs', () => {
    expect(choixPeriodeWasapi(windows)).toEqual([10, 20, 50, 100]);
    expect(choixPeriodeWasapi({ ...windows, wasapi_exclusive_period_ms: 50 })).toEqual([10, 20, 50, 100]);
    expect(choixPeriodeWasapi({ ...windows, wasapi_exclusive_period_ms: 40 })).toEqual([10, 20, 40, 50, 100]);
  });

  it('retombe sur les choix par défaut si le serveur ne les publie pas', () => {
    expect(choixPeriodeWasapi({ ...windows, wasapi_exclusive_period_choices_ms: undefined })).toEqual([10, 20, 50, 100]);
  });
});
