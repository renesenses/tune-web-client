import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { zoneAProposer, propositionRetenue, resumeProposition, OCCURRENCES_MIN } from '../reglagesProposes';

const p = (occurrences: number, settings: Record<string, unknown> = { dlna_lpcm: true }) =>
  ({ occurrences, settings }) as any;

describe('zoneAProposer', () => {
  it('un appareil identifié et vierge reçoit une proposition', () => {
    expect(zoneAProposer({ id: 1, brand: 'Eversolo', model: 'DMP-A6' } as any)).toBe(true);
  });
  it('🔴 jamais par-dessus un réglage posé à la main', () => {
    expect(zoneAProposer({ id: 1, brand: 'E', model: 'M', dlna_lpcm: true } as any)).toBe(false);
    expect(zoneAProposer({ id: 1, brand: 'E', model: 'M', gain_trim_db: -3 } as any)).toBe(false);
  });
  it('un appareil non identifié n’en reçoit pas', () => {
    expect(zoneAProposer({ id: 1, brand: 'E' } as any)).toBe(false);
  });
});

describe('propositionRetenue', () => {
  it(`il faut au moins ${OCCURRENCES_MIN} occurrences, et un réglage`, () => {
    expect(propositionRetenue([p(OCCURRENCES_MIN)])).not.toBeNull();
    expect(propositionRetenue([p(OCCURRENCES_MIN - 1)])).toBeNull();
    expect(propositionRetenue([p(9, {})])).toBeNull();
    expect(propositionRetenue(undefined)).toBeNull();
  });
  it('le résumé nomme chaque réglage', () => {
    expect(resumeProposition(p(3, { dlna_lpcm: true, dlna_play_delay_ms: 200 }))).toBe('dlna_lpcm · dlna_play_delay_ms=200');
  });
});

describe('branchement dans Réglages › par zone', () => {
  const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
  it('la proposition est affichée sous l’éditeur d’appareil, et s’applique', () => {
    const i = V2.indexOf('<ZoneDeviceEditor');
    const apres = V2.slice(i, i + 2500);
    expect(apres).toContain('{#if z.id != null && propositions[z.id]}');
    expect(apres).toContain('onclick={() => appliquerProposition(z)}');
    const c = V2.slice(V2.indexOf('async function appliquerProposition('));
    expect(c.slice(0, 600)).toContain('api.applyZoneDevicePreset(');
  });
  it('les propositions passent par la règle partagée', () => {
    expect(V2).toContain('if (!zoneAProposer(z)) continue;');
    expect(V2).toContain('propositionRetenue(r.presets)');
  });
});
