import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 Une playlist de SERVICE doit s'ouvrir par son titre comme par sa pochette.
 *
 * Bertrand, 13/09/2026 : « Impossible d'ouvrir une playlist Qobuz ni en
 * cliquant sur la cover ni sur le titre. »
 *
 * Le serveur n'y était pour rien — mesuré sur son Mac le même jour,
 * `/streaming/qobuz/playlists`, `…/{id}` et `…/{id}/tracks` répondaient tous
 * les trois 200 avec leur contenu. Le titre d'une playlist de service était
 * simplement rendu en `<span>` nus, alors que la carte LOCALE du même écran,
 * dix lignes plus bas, les enveloppe dans un `<button class="meta">`.
 *
 * Ce témoin lit la SOURCE plutôt que de monter le composant : ce qu'il garde
 * est une asymétrie entre deux cartes voisines, et c'est dans leur écriture
 * côte à côte qu'elle se voit. Un test de rendu dirait « le bouton existe »
 * sans dire « il existe des DEUX côtés ».
 */
const ecran = readFileSync(
  resolve(__dirname, '../../components/v2/PlaylistsV2.svelte'),
  'utf-8',
);

/** Les ouvertures câblées, par origine. */
function ouvertures(kind: 'local' | 'streaming'): number {
  return (
    ecran.match(new RegExp(`ouvrirPl\\(\\{\\s*kind:\\s*'${kind}'`, 'g')) ?? []
  ).length;
}

describe('PlaylistsV2 — ouvrir une playlist', () => {
  it('ouvre une playlist de service par sa pochette ET par son titre', () => {
    // Deux points d'entrée, comme pour une playlist locale : la pochette
    // (`onOuvrir` de PochetteActions) et le titre (`<button class="meta">`).
    expect(ouvertures('streaming')).toBeGreaterThanOrEqual(2);
  });

  it('garde la parité avec les playlists locales', () => {
    // La contre-épreuve qui compte : le défaut n'était pas « il manque un
    // bouton » mais « une carte en a un et sa voisine non ». Si l'une des deux
    // perd une entrée, l'asymétrie revient — et c'est elle qu'on garde.
    expect(ouvertures('streaming')).toBe(ouvertures('local'));
  });

  it("enveloppe le titre d'une playlist de service dans un bouton qui ouvre", () => {
    // Assez précis pour rougir si le `<button class="meta">` redevient un
    // `<span>` : on exige le bouton ET l'appel, pas seulement leur présence
    // quelque part dans le fichier.
    const carteService = ecran.slice(
      ecran.indexOf("{#each liste as pl (pl.source_id)}"),
      ecran.indexOf('{:else if onglet === '),
    );
    expect(carteService.length).toBeGreaterThan(0);
    expect(carteService).toContain('<button class="meta"');
    expect(carteService).toMatch(/ouvrirPl\(\{\s*kind:\s*'streaming'/);
  });
});
