import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('vérité de la calibration multiroom (#2215)', () => {
  it('ne propose plus le faux calibrage par demi-RTT', () => {
    const view = read('src/components/ZoneManagerView.svelte');
    const api = read('src/lib/api.ts');

    expect(view).not.toContain('handleCalibrateGroup');
    expect(view).not.toContain("$t('zone.calibrate')");
    expect(api).not.toContain('export function calibrateGroup(');
  });

  it('affiche explicitement la médiane du RTT de contrôle', () => {
    const view = read('src/components/ZoneManagerView.svelte');

    expect(view).toContain('entry?.control_rtt?.p50_ms');
    expect(view).toContain('RTT {latencyResults[zone.id]}ms');
    expect(view).not.toContain('estimated_latency_ms');
  });
});
