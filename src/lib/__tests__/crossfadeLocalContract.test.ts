import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('contrat du crossfade local (#2211)', () => {
  it('ne présente jamais le recouvrement comme une capacité globale', () => {
    const settings = read('src/components/SettingsView.svelte');

    expect(settings).toContain('crossfadeAvailable');
    expect(settings).toContain('disabled={!crossfadeAvailable || crossfadeLoading}');
    expect(settings).toContain('sorties réseau, navigateur, PURE et exclusives');
    expect(settings).toContain('transition séquentielle');
  });

  it('annonce que le mixage modifie le signal et prend effet à la piste suivante', () => {
    const settings = read('src/components/SettingsView.svelte');

    expect(settings).toContain('Désactive le bit-perfect pendant la transition');
    expect(settings).toContain('à partir de la prochaine piste');
  });

  it('porte le contrat de capacité explicite renvoyé par le serveur', () => {
    const api = read('src/lib/api.ts');

    expect(api).toContain("scope: 'local_pcm'");
    expect(api).toContain("other_outputs: 'sequential_track_transition'");
    expect(api).toContain('/zones/${zoneId}/crossfade');
  });
});
