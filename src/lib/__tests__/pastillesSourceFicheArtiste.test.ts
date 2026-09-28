// Bertrand, 28/09/2026 : « Dans la fiche artiste, je veux ajouter un filtre
// par source (local, upnp, Qobuz, ...) ». Arbitrages du même jour : une
// rangée de pastilles toujours visible, plusieurs sources à la fois, et le
// filtre porte sur TOUTES les sections de la fiche.
//
// Ce que la garde tient :
//   1. local et chaque serveur UPnP sont des pastilles DISTINCTES — le Focus
//      les confondait sous « Bibliothèque » ;
//   2. les comptes portent sur toutes les sections réunies ;
//   3. un `upnp` venu de la grille de la Bibliothèque coche chacun de ses
//      serveurs, et en décocher un laisse les autres ;
//   4. le composant filtre bien chaque section, et le Focus ne garde que la
//      qualité.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  basculerProvenance, compterProvenances, dansProvenances, fusionnerDiscographie, provenanceCochee,
} from '../discographieCommune';
import { libelleProvenance } from '../provenanceBibliotheque';
import type { Album } from '../types';

const al = (o: Record<string, unknown>) => o as unknown as Album;

const disco = fusionnerDiscographie(
  [
    al({ id: 1, title: 'A', source: 'local' }),
    al({ id: 2, title: 'S', source: 'upnp', source_id: 'uuid:sonos|7' }),
    al({ id: 3, title: 'M', source: 'upnp', source_id: 'uuid:minim|8' }),
  ],
  [
    { service: 'tidal', albums: [al({ source_id: 'TB', title: 'B' })] },
    { service: 'qobuz', albums: [al({ source_id: 'QA', title: 'A' }), al({ source_id: 'QB', title: 'B' })] },
  ],
);
const compilations = fusionnerDiscographie([al({ id: 9, title: 'Best of', source: 'upnp', source_id: 'uuid:sonos|9' })], []);

describe('pastilles « Source » de la fiche artiste', () => {
  it('une pastille par provenance, local et serveurs UPnP séparés, comptée sur toutes les sections', () => {
    expect(compterProvenances([disco, compilations])).toEqual([
      { cle: 'local', n: 1 },
      { cle: 'upnp:uuid:minim', n: 1 },
      { cle: 'upnp:uuid:sonos', n: 2 },
      { cle: 'qobuz', n: 2 },
      { cle: 'tidal', n: 1 },
    ]);
  });

  it('plusieurs sources = OU ; rien de coché = tout', () => {
    const titres = (c: string[]) => disco.filter((e) => dansProvenances(e, new Set(c))).map((e) => e.principal.album.title);
    expect(titres([])).toEqual(['A', 'S', 'M', 'B']);
    expect(titres(['local'])).toEqual(['A']);
    expect(titres(['upnp:uuid:sonos', 'tidal'])).toEqual(['S', 'B']);
    expect(titres(['qobuz'])).toEqual(['A', 'B']);
  });

  it('« upnp » venu de la grille coche chaque serveur, et décocher l’un garde l’autre', () => {
    const presentes = compterProvenances([disco]).map((p) => p.cle);
    const choix = new Set(['upnp']);
    expect(provenanceCochee('upnp:uuid:sonos', choix)).toBe(true);
    expect(provenanceCochee('upnp:uuid:minim', choix)).toBe(true);
    expect(provenanceCochee('local', choix)).toBe(false);
    expect([...basculerProvenance(choix, 'upnp:uuid:sonos', presentes)]).toEqual(['upnp:uuid:minim']);
    expect([...basculerProvenance(new Set(['qobuz']), 'local', presentes)].sort()).toEqual(['local', 'qobuz']);
    expect([...basculerProvenance(new Set(['qobuz']), 'qobuz', presentes)]).toEqual([]);
  });

  it('libellé : Local traduit, nom du serveur UPnP, UDN abrégé à défaut, service en capitales', () => {
    const noms = { 'uuid:sonos': 'Sonos' };
    expect(libelleProvenance('local', noms, 'Local')).toBe('Local');
    expect(libelleProvenance('upnp:uuid:sonos', noms, 'Local')).toBe('Sonos');
    expect(libelleProvenance('upnp:uuid:minim', noms, 'Local')).toBe('uuid:minim…');
    expect(libelleProvenance('qobuz', noms, 'Local')).toBe('QOBUZ');
  });
});

describe('le composant applique les pastilles', () => {
  const src = readFileSync(resolve(__dirname, '../../components/v2/DiscographieCommune.svelte'), 'utf-8');

  it('chaque section passe par le filtre', () => {
    for (const s of ['toutes', 'connexesToutes', 'compilationsToutes', 'apparitionsToutes', 'reprisesToutes', 'g.entrees']) {
      expect(src.includes(`garder(${s})`), `garder(${s})`).toBe(true);
    }
  });

  it('les comptes réunissent toutes les sections, collaborations comprises', () => {
    expect(/compterProvenances\(\[\s*toutes, connexesToutes, compilationsToutes, apparitionsToutes, reprisesToutes,\s*\.\.\.collaborationsToutes/.test(src)).toBe(true);
  });

  it('la source de la grille est une pastille cochée, pas un filtre caché', () => {
    expect(src).toMatch(/choix = provenance \? new Set\(\[provenance\]\) : new Set\(\)/);
    expect(src).not.toMatch(/dansProvenance\(e, provenance\)/);
  });

  it('le Focus ne porte plus d’axe Source', () => {
    expect(src).not.toMatch(/basculerSource|sourcesCochees/);
    expect(src).toMatch(/filtrerFocus\(entrees, \{ sources: new Set\(\), qualites: qualitesCochees \}\)/);
  });
});
