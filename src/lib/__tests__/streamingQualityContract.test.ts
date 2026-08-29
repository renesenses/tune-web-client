import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const settings = readFileSync(
  resolve(__dirname, '../../components/SettingsView.svelte'),
  'utf8',
);
const api = readFileSync(resolve(__dirname, '../api.ts'), 'utf8');

describe('qualité streaming par zone — #2723', () => {
  it('agit sur la zone sélectionnée, jamais arbitrairement sur la première', () => {
    const start = settings.indexOf('function qualityZoneId()');
    const end = settings.indexOf('// --- Config Export/Import ---', start);
    const contract = settings.slice(start, end);

    expect(contract).toContain('get(currentZoneId)');
    expect(contract).not.toContain("get(zones)[0]?.id;\n    if");
    expect(contract).toContain('api.getStreamingQuality(zoneId)');
    expect(contract).toContain('api.setStreamingQuality(zoneId, streamingQuality)');
  });

  it('ne jette plus les erreurs ni la valeur canonique rendue par le serveur', () => {
    const start = settings.indexOf('async function applyStreamingQuality()');
    const end = settings.indexOf('// --- Config Export/Import ---', start);
    const apply = settings.slice(start, end);

    expect(apply).toContain('const saved = await api.setStreamingQuality');
    expect(apply).toContain('streamingQuality = saved.quality');
    expect(apply).toContain('notifications.error');
    expect(apply).toContain('await loadStreamingQuality()');
    expect(apply).not.toContain('catch {}');
  });

  it('ferme le contrat TypeScript aux quatre valeurs réellement acceptées', () => {
    expect(api).toContain("export type StreamingQuality = 'max' | 'hires' | 'cd' | 'low';");
    expect(api).toContain('quality: StreamingQuality');
  });
});
