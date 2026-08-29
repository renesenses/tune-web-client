import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const composant = readFileSync(
  resolve(__dirname, '../../components/MediaServersView.svelte'),
  'utf-8',
);
const types = readFileSync(resolve(__dirname, '../types.ts'), 'utf-8');

function contratMediaServer(): string {
  const debut = types.indexOf('export interface MediaServer {');
  const fin = types.indexOf('\n}', debut);
  expect(debut, 'interface MediaServer introuvable').toBeGreaterThanOrEqual(0);
  expect(fin, 'fin de MediaServer introuvable').toBeGreaterThan(debut);
  return types.slice(debut, fin + 2);
}

describe('serveur media injoignable visible (#2139)', () => {
  it('consomme le champ reachable réellement émis par le serveur', () => {
    const contrat = contratMediaServer();

    expect(contrat).toContain('reachable?: boolean');
    expect(contrat).toContain('last_seen_secs?: number');
    expect(contrat).not.toContain('available');
    expect(composant).not.toContain('server.available');
  });

  it('ne déclare indisponible que le false explicite, sans inventer l ancien contrat', () => {
    expect(composant).toContain('server.reachable === false');
    expect(composant).toContain('server.reachable === true');
    expect(composant).toContain("$tr('mediaservers.unavailable')");
  });
});
