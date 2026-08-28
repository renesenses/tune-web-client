import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const transport = readFileSync(
  resolve(__dirname, '../../components/TransportBar.svelte'),
  'utf-8',
);
const settings = readFileSync(
  resolve(__dirname, '../../components/SettingsView.svelte'),
  'utf-8',
);
const api = readFileSync(resolve(__dirname, '../api.ts'), 'utf-8');
const store = readFileSync(resolve(__dirname, '../stores/audiophile.ts'), 'utf-8');

function bodyOf(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, `${start} doit exister`).toBeGreaterThanOrEqual(0);
  expect(to, `${end} doit suivre ${start}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('garde plein volume transversale (#2445)', () => {
  it('les deux boutons PURE passent par la même décision avant le POST', () => {
    const handler = bodyOf(
      transport,
      'async function toggleAudiophile()',
      'async function toggleVolumeLock()',
    );
    // Une déclaration et deux surfaces (bouclier de la barre + interrupteur
    // du chemin du signal) : toute surface supplémentaire doit réutiliser ce
    // même handler, pas appeler l'API directement.
    expect(transport.match(/toggleAudiophile\(\)/g)?.length).toBe(3);
    expect(handler.indexOf("fullVolumeConfirmationRequired('audiophile'")).toBeLessThan(
      handler.indexOf('api.setAudiophileMode('),
    );
    expect(handler.indexOf('dialogs.confirm(')).toBeLessThan(
      handler.indexOf('api.setAudiophileMode('),
    );
    expect(handler).toContain('enabled, fullVolumeConfirmed');
  });

  it('l’interrupteur du verrou confirme avant toute écriture', () => {
    const handler = bodyOf(transport, 'async function toggleVolumeLock()', 'const detailTranslations');
    expect(handler.indexOf("fullVolumeConfirmationRequired('volume-lock'")).toBeLessThan(
      handler.indexOf('setZoneVolumeLock('),
    );
    expect(handler.indexOf('dialogs.confirm(')).toBeLessThan(handler.indexOf('setZoneVolumeLock('));
    expect(handler).toContain('setZoneVolumeLock(z.id, enabled, fullVolumeConfirmed)');
  });

  it('aucun appelant ne peut armer le verrou sans attestation', () => {
    expect(store).toContain("if (enabled && !get(audiophileGlobalLockVolume) && !confirmFullVolume)");
    expect(store).toContain("if (enabled === true && !confirmFullVolume)");
    expect(store).toContain("throw new Error('full_volume_confirmation_required')");
    expect(store).toContain('_confirm_full_volume: true');
    // Le double geste déjà livré dans les Paramètres transmet explicitement
    // son accord au même contrat, au lieu de bénéficier d'un passe-droit.
    expect(settings).toContain('setVolumeLock(true, true)');
  });

  it('le POST PURE ne transmet le témoin que sur confirmation', () => {
    const method = bodyOf(api, 'export function setAudiophileMode(', '// --- Streaming Quality ---');
    expect(method).toContain('confirmFullVolume ? { confirm_full_volume: true } : {}');
  });
});
