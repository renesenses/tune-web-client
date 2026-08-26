import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const settings = readFileSync(
  resolve(__dirname, '../../components/SettingsView.svelte'),
  'utf-8',
);
const api = readFileSync(resolve(__dirname, '../api.ts'), 'utf-8');

describe('volume fixe réseau confirmé de bout en bout (#2395)', () => {
  it('l’accord « 100 » précède le PATCH et lui seul crée le témoin', () => {
    const start = settings.indexOf("const typed = await dialogs.prompt($t('settings.fixedVolumeNetConfirm'))");
    const confirmed = settings.indexOf('fullVolumeConfirmed = true;', start);
    const request = settings.indexOf(
      'api.updateZoneFixedVolume(z.id, enabled, fullVolumeConfirmed)',
      confirmed,
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(confirmed).toBeGreaterThan(start);
    expect(request).toBeGreaterThan(confirmed);
    expect(settings.slice(start, confirmed)).toContain("if (typed !== '100')");
    expect(settings.indexOf('z.fixed_volume = enabled;', request)).toBeGreaterThan(request);
  });

  it('le client API omet le témoin tant qu’il n’a pas été confirmé', () => {
    const start = api.indexOf('export function updateZoneFixedVolume(');
    const end = api.indexOf('export function updateZoneDlnaNativeFlac', start);
    const method = api.slice(start, end);

    expect(method).toContain('confirmFullVolume = false');
    expect(method).toContain('confirmFullVolume ? { confirm_full_volume: true } : {}');
  });
});
