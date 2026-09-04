import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('crossfade indisponible (#2211)', () => {
  it('aucun écran ne propose le réglage inerte', () => {
    const nowPlaying = read('src/components/NowPlaying.svelte');
    const settings = read('src/components/SettingsView.svelte');
    // ÉTENDU le 04/09/2026 : l'écran des Réglages du NOUVEAU client avait été
    // écrit avant cette suppression et reproduisait le réglage inerte. Le
    // garde ne visait que les deux écrans du client actuel, il ne l'a donc pas
    // vu arriver — c'est la fusion des deux lignes qui l'a révélé.
    const settingsV2 = read('src/components/v2/SettingsV2.svelte');

    expect(nowPlaying).not.toContain('toggleCrossfade');
    expect(nowPlaying).not.toContain('setCrossfade');
    expect(settings).not.toContain('loadCrossfade');
    expect(settings).not.toContain('settings.crossfadeHint');
    expect(settingsV2).not.toContain('settings.crossfadeHint');
    expect(settingsV2).not.toContain('applyCrossfade');
  });

  it('le client ne porte plus une API qui promet un faux succès', () => {
    const api = read('src/lib/api.ts');

    expect(api).not.toContain('export function getCrossfade(');
    expect(api).not.toContain('export function setCrossfade(');
    expect(api).not.toContain('/zones/${zoneId}/crossfade');
  });
});
