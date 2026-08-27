import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../components/TrackContextMenu.svelte'),
  'utf-8',
);

describe('fermeture du menu de piste (#2348)', () => {
  it('consomme le clic du fond avant de fermer le menu', () => {
    const start = source.indexOf('function dismiss(e: MouseEvent)');
    const end = source.indexOf('\n  }', start);
    const handler = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(handler.indexOf('e.stopPropagation()')).toBeGreaterThanOrEqual(0);
    expect(handler.indexOf('onClose()')).toBeGreaterThan(
      handler.indexOf('e.stopPropagation()'),
    );
    expect(source).toContain('class="track-menu-backdrop" onclick={dismiss}');
    expect(source).not.toContain('class="track-menu-backdrop" onclick={onClose}');
  });
});
