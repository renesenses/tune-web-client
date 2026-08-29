import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('serveurs Tune découverts automatiquement (#2746)', () => {
  it('n’affiche pas des statistiques absentes de la découverte', () => {
    const settings = read('src/components/SettingsView.svelte');

    expect(settings).not.toContain('peer.tracks');
    expect(settings).not.toContain('peer.zones');
    expect(settings).not.toContain('peer-stats');
  });

  it('ne propose pas un registre manuel sans besoin terrain', () => {
    const settings = read('src/components/SettingsView.svelte');
    const apiSource = read('src/lib/api.ts');

    expect(settings).not.toContain('addPeer(');
    expect(settings).not.toContain('removePeer(');
    expect(settings).not.toContain('peer-add');
    expect(apiSource).not.toContain('export function addTunePeer(');
    expect(apiSource).not.toContain('export function removeTunePeer(');
  });
});
