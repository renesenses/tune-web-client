import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('vérité des Pins OpenHome (#2722)', () => {
  it('conserve uniquement les opérations réellement portées par Pins:1', () => {
    const modal = read('src/components/ZoneConfigModal.svelte');
    const api = read('src/lib/api.ts');

    expect(modal).toContain('api.getZonePins(zone.id)');
    expect(modal).toContain('api.invokeZonePin(zone.id, index)');
    expect(modal).toContain('api.clearZonePin(zone.id, index)');
    expect(api).toContain('export function getZonePins(');
    expect(api).toContain('export function invokeZonePin(');
    expect(api).toContain('export function clearZonePin(');
  });

  it('ne promet plus de convertir une file Tune en URI Pin', () => {
    const modal = read('src/components/ZoneConfigModal.svelte');
    const api = read('src/lib/api.ts');

    expect(modal).not.toContain('handleSaveQueueAsPin');
    expect(modal).not.toContain('Save queue as pin');
    expect(api).not.toContain('export function saveQueueAsPin(');
    expect(api).not.toContain('/pins/from-queue');
  });
});
