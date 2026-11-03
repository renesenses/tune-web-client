/**
 * renesenses/tune-server-rust#7448 : un titre local repartait en boucle sans fin.
 * « Lire en boucle par défaut » mettait la zone en `repeat one` mais la
 * décocher ne la remettait jamais à `off`. Décision de Bertrand (30/10/2026) :
 * décocher remet la zone à `off`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('boucle par défaut (#7448)', () => {
  beforeEach(() => { vi.resetModules(); });

  it('décocher remet à off les zones en répéter la piste, et elles seules', async () => {
    const setRepeat = vi.fn(async (_id: number, mode: string) => ({ repeat: mode }));
    vi.doMock('../api', () => ({ setRepeat }));
    const z = await import('../stores/zones');
    z.zones.set([
      { id: 1, repeat: 'one' },
      { id: 2, repeat: 'off' },
      { id: 3, repeat: 'all' },
    ] as any);
    await z.remettreRepetitionAOff();
    expect(setRepeat).toHaveBeenCalledTimes(1);
    expect(setRepeat).toHaveBeenCalledWith(1, 'off');
    expect(get(z.zones).find((x: any) => x.id === 1)?.repeat).toBe('off');
    expect(get(z.zones).find((x: any) => x.id === 3)?.repeat).toBe('all');
  });

  it('la zone courante en répétition est remise à off et le bouton suit', async () => {
    const setRepeat = vi.fn(async (_id: number, mode: string) => ({ repeat: mode }));
    vi.doMock('../api', () => ({ setRepeat }));
    const z = await import('../stores/zones');
    const { repeatMode } = await import('../stores/nowPlaying');
    z.zones.set([{ id: 5 }] as any);
    z.currentZoneId.set(5);
    repeatMode.set('one');
    await z.remettreRepetitionAOff();
    expect(setRepeat).toHaveBeenCalledWith(5, 'off');
    expect(get(repeatMode)).toBe('off');
  });

  it('la case de SettingsV2 appelle le correctif quand on la décoche', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(src).toMatch(/bind:checked=\{\$loopByDefault\}\s+onchange=\{\(\) => \{ if \(!\$loopByDefault\) void remettreRepetitionAOff\(\)/);
  });
});
