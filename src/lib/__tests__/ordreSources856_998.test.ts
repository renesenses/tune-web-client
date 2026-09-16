/**
 * #856 et #998 — l'ordre des sources était l'ALPHABET, par accident.
 *
 * Le serveur sérialise `services` depuis un `serde_json::Map` — un
 * `BTreeMap` : `bandcamp < qobuz < tidal < youtube`. Trois écrans le
 * recopiaient : les pastilles « Où » de la Recherche, l'ordre des blocs de
 * résultats, les onglets du Streaming. FabienM, fils 1749 et 1774 : « local,
 * qobuz, … », « Qobuz avant Bandcamp ».
 *
 * UNE table, `RANG_SOURCE` (celle de #850), et trois consommateurs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ordonnerSources, fusionnerParType } from '../rechercheClassement';
import { servicesConnectes, ongletsStreaming } from '../ongletsStreaming';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const ALPHABET = ['bandcamp', 'qobuz', 'tidal', 'youtube'];

describe('ordonnerSources — la préférence, pas l’alphabet', () => {
  it('local, qobuz, tidal, deezer, bandcamp, youtube', () => {
    expect(ordonnerSources(['youtube', 'bandcamp', 'deezer', 'tidal', 'qobuz', 'local'], (x) => x))
      .toEqual(['local', 'qobuz', 'tidal', 'deezer', 'bandcamp', 'youtube']);
  });
  it('🔴 un service inconnu se range entre Bandcamp (1) et YouTube (0) — ni en tête, ni perdu', () => {
    const r = ordonnerSources(['youtube', 'bandcamp', 'amazon', 'qobuz'], (x) => x);
    expect(r).toEqual(['qobuz', 'bandcamp', 'amazon', 'youtube']);
  });
  it('à rang égal, l’ordre d’arrivée survit (tri stable), et l’entrée n’est pas mutée', () => {
    const entree = ['b-inconnu', 'a-inconnu'];
    expect(ordonnerSources(entree, (x) => x)).toEqual(['b-inconnu', 'a-inconnu']);
    expect(entree).toEqual(['b-inconnu', 'a-inconnu']);
  });
});

describe('#998 — les onglets du Streaming', () => {
  const services = Object.fromEntries(ALPHABET.map((k) => [k, { enabled: true, authenticated: true }]));
  it('🔴 Qobuz avant Bandcamp, quel que soit l’ordre des clés du serveur', () => {
    expect(servicesConnectes(services)).toEqual(['qobuz', 'tidal', 'bandcamp', 'youtube']);
    expect(ongletsStreaming(services, false)).toEqual(['qobuz', 'tidal', 'bandcamp', 'youtube']);
  });
  it('l’extension Bandcamp garde la PLACE du service générique (#860 tient toujours)', () => {
    expect(ongletsStreaming(services, true)).toEqual(['qobuz', 'tidal', '__bandcamp__', 'youtube']);
  });
});

describe('#856 — la Recherche', () => {
  it('🔴 les blocs de résultats suivent la préférence : local, Qobuz, Bandcamp', () => {
    const r = fusionnerParType(
      { artists: [{ id: 1, name: 'L' }] } as any,
      { bandcamp: { artists: [{ name: 'B' }] }, qobuz: { artists: [{ name: 'Q' }] } } as any,
    );
    expect(r.artistes.map((a: any) => a.source)).toEqual(['local', 'qobuz', 'bandcamp']);
  });
  it('les pastilles « Où » lisent la même table', () => {
    const src = lire('src/components/v2/SearchV2.svelte');
    expect(src).toContain('return ordonnerSources([...n.entries()], (e) => e[0]);');
    expect(src).not.toContain("a[0].localeCompare(b[0])");
  });
});
