import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('multi-room synchronization truth', () => {
  const component = readFileSync(
    resolve(process.cwd(), 'src/components/MultiroomSettings.svelte'),
    'utf8',
  );

  it('does not expose inert cross-technology calibration controls', () => {
    expect(component).not.toContain('listGroupDelays');
    expect(component).not.toContain('setGroupDelay');
    expect(component).not.toContain('VISIBLE_PAIRS');
    expect(component).not.toContain('type="range"');
  });

  it('keeps the explicit synchronization-scope explanation visible', () => {
    const french = readFileSync(
      resolve(process.cwd(), 'src/lib/locales/fr.ts'),
      'utf8',
    );

    expect(component).toContain("$t('multiroom.title')");
    expect(component).toContain("$t('multiroom.calibrationHint')");
    expect(french).toContain('Seuls les points de diffusion Tune regroupés par OAAT');
    expect(french).toContain('pas une restitution synchronisée');
    expect(french).not.toContain('calibration inter-techno');
  });
});
