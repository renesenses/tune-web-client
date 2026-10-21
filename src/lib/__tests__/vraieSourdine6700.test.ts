import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// #6700 (tune-server-rust) — décision de Bertrand du 21/10/2026 : une VRAIE
// sourdine. Le bouton, la touche M et le curseur mobile envoyaient
// `setVolume(zone, 0)` ; un renderer qui remontait ensuite son ancien volume
// faisait croire la zone audible, à 80 %, sur un appareil muet.

vi.mock('../api', () => ({ muteZone: vi.fn(), setVolume: vi.fn() }));
vi.mock('../stores/zones', async () => {
  const { writable } = await import('svelte/store');
  return { zones: writable([]) };
});
vi.mock('../stores/browserAudio', () => ({
  browserSetVolume: vi.fn(),
  isBrowserZone: (z: { output_type?: string }) => z?.output_type === 'browser',
}));

import { basculerSourdine, poserSourdine, type DependancesSourdine } from '../sourdine';

function banc(echec = false) {
  const appels: string[] = [];
  const deps: DependancesSourdine = {
    muteZone: vi.fn(async (id: number, muted: boolean) => {
      appels.push(`mute:${id}:${muted}`);
      if (echec) throw new Error('refus');
    }),
    poserMuet: vi.fn((id: number, muted: boolean) => appels.push(`etat:${id}:${muted}`)),
    audioLocal: vi.fn((v: number) => appels.push(`audio:${v}`)),
  };
  return { deps, appels };
}

describe('vraie sourdine (#6700)', () => {
  it('couper le son envoie muted=true et ne touche pas au volume', async () => {
    const { deps, appels } = banc();
    await basculerSourdine({ id: 10, volume: 0.8, muted: false }, { ...deps, audioLocal: undefined });
    expect(appels).toEqual(['etat:10:true', 'mute:10:true']);
  });

  it('lever la sourdine envoie muted=false : le son revient au volume d’avant', async () => {
    const { deps, appels } = banc();
    await basculerSourdine({ id: 10, volume: 0.8, muted: true }, { ...deps, audioLocal: undefined });
    expect(appels).toEqual(['etat:10:false', 'mute:10:false']);
  });

  it('zone navigateur : l’<audio> local suit (0, puis le volume de la zone)', async () => {
    const { deps, appels } = banc();
    await poserSourdine({ id: 3, volume: 0.6, muted: false, output_type: 'browser' }, true, deps);
    await poserSourdine({ id: 3, volume: 0.6, muted: true, output_type: 'browser' }, false, deps);
    expect(appels.filter((a) => a.startsWith('audio'))).toEqual(['audio:0', 'audio:0.6']);
  });

  it('un refus du serveur rétablit l’état d’avant', async () => {
    const { deps, appels } = banc(true);
    await expect(
      basculerSourdine({ id: 10, volume: 0.8, muted: false }, { ...deps, audioLocal: undefined }),
    ).rejects.toThrow('refus');
    expect(appels).toEqual(['etat:10:true', 'mute:10:true', 'etat:10:false']);
  });

  it('aucun geste de sourdine n’écrit plus un volume à zéro', () => {
    const fichiers = [
      'src/components/partages/VolumeControl.svelte',
      'src/components/partages/TransportBar.svelte',
      'src/lib/keyboard.ts',
    ];
    for (const f of fichiers) {
      const src = readFileSync(resolve(process.cwd(), f), 'utf-8');
      expect(src, `${f} : setVolume(…, 0) revenu`).not.toMatch(/setVolume\([^,()]+,\s*0\s*\)/);
      expect(src, `${f} : la sourdine doit passer par basculerSourdineZone`).toMatch(
        /basculerSourdineZone\(/,
      );
    }
  });
});
