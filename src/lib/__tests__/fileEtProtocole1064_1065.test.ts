import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * #1064 — le panneau de file distingue ce qui précède le curseur de ce qui suit.
 * #1065 — Réglages : le protocole est sur la carte, et deux protocoles du même
 * appareil ne passent plus pour un doublon.
 */
const NP = readFileSync('src/components/partages/NowPlaying.svelte', 'utf8');
const SET = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');

describe('#1064 — la file ne présente plus le passé comme à venir', () => {
  it('une ligne avant le curseur porte `qs-passee`, estompée', () => {
    expect(NP).toMatch(/class:qs-passee=\{index < \$queuePosition\}/);
    const css = NP.slice(NP.indexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(css).toMatch(/\.qs-item\.qs-passee\s*\{[^}]*opacity:\s*0\.\d/);
  });

  it('les deux en-têtes disent « rien à suivre » quand rien ne suit', () => {
    for (const cls of ['queue-sheet-remaining', 'qs-remaining']) {
      const re = new RegExp(`\\{:else if \\$queueTracks\\.length > 0\\}\\s*<span class="${cls}">\\{\\$t\\('queue\\.nothingNext'\\)\\}`);
      expect(NP, cls).toMatch(re);
    }
  });
});

describe('#1065 — le protocole de chaque zone', () => {
  it('la carte affiche le libellé du protocole', () => {
    expect(SET).toMatch(/<span class="zt proto">\{zoneTypeLabel\(z\.output_type\)\}<\/span>/);
  });

  it('une jumelle d’appareil par un autre protocole est nommée', () => {
    expect(SET).toMatch(/\{#if jumelleDeProtocole\(z, \$zones\)\}/);
    expect(SET).toContain("'v2.set.sameDeviceOtherProtocol'");
    const fn = SET.slice(SET.indexOf('function jumelleDeProtocole'), SET.indexOf('function jumelleDeProtocole') + 600);
    expect(fn).toMatch(/appareilDeLaZone\(o\) === app/);
    expect(fn).toMatch(/!== \(z\.output_type \?\? 'local'\)/);
  });
});
