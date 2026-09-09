/**
 * Le tri « Dynamic Range » manquait à la bibliothèque de la NOUVELLE interface.
 *
 * Bertrand, 09/09/2026 : « la bibliothèque v2 n'a ni tri ni filtre alors que la
 * v1 les a […] Corrige ! »
 *
 * L'écran actuel propose ce tri depuis #2144 (`LibraryView.svelte:649`), et le
 * serveur le sert (`sort=dynamic_range`, `dr_min`/`dr_max`). La nouvelle
 * interface ne l'avait jamais repris : ses clés de tri s'arrêtaient à
 * `title | artist | year | added`.
 *
 * ## Pourquoi il se CACHE, et pourquoi c'est le bon choix
 *
 * Mesuré le 09/09/2026 sur TROIS serveurs :
 *
 *   .18  /library/tracks?limit=400      → dynamic_range présent sur 0
 *   .15  /library/tracks?limit=400      → dynamic_range présent sur 0
 *   .42  /library/tracks?limit=300      → dynamic_range présent sur 0
 *   .18  /library/albums/filters        → `dynamic_ranges` : liste VIDE
 *   .42  /library/albums/filters        → `dynamic_ranges` : liste VIDE
 *
 * Aucune bibliothèque ne porte de DR. Un tri offert là-dessus ne changerait
 * rien à l'écran — ce qui se lit comme une panne, pas comme une bibliothèque
 * non taguée. L'écran actuel cache déjà sa tranche DR pour cette raison
 * (`drValues.length > 0`) : on reprend sa règle.
 *
 * ⚠️ Tune ne CALCULE jamais le DR : il lit le tag Vorbis `ALBUM DYNAMIC RANGE`
 * / `DYNAMIC RANGE` (`tune-core/src/metadata/mod.rs:3278-3291`). Aucun
 * analyseur n'existe. Une bibliothèque non taguée le restera après n'importe
 * quel rescan.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = () =>
  readFileSync(resolve(process.cwd(), 'src/components/v2/LibraryV2.svelte'), 'utf-8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('le tri Dynamic Range de la bibliothèque v2', () => {
  it('🔴 la clé de tri existe — elle s’arrêtait à « added »', () => {
    expect(src()).toContain("type SortKey = 'title' | 'artist' | 'year' | 'added' | 'dr';");
    expect(src()).toContain("{ k: 'dr', l: 'library.sortDynamicRange' }");
  });

  it('🔴 il ne PARAÎT que s’il trie quelque chose', () => {
    // Sans cette garde, le menu offrirait une entrée qui ne change rien —
    // mesuré : zéro DR sur les trois serveurs.
    expect(src()).toContain("const hasDr = $derived(src.some((a) => drNombre(a) != null));");
    expect(src()).toMatch(/s2\.k !== 'dr' \|\| hasDr/);
  });

  it('🔴 un tri devenu indisponible ne reste pas ACTIF', () => {
    // Retenu d'une visite à l'autre : choisi sur une bibliothèque taguée puis
    // rouvert sur une autre, il trierait par un critère absent du menu.
    expect(src()).toContain("if (!availableSorts.some((s2) => s2.k === sortKey)) sortKey = 'title';");
  });

  it('🔴 « 0 » est une VRAIE valeur, pas une absence', () => {
    // Un album entièrement écrasé porte DR 0. `Number('')` rend 0 : sans le
    // test de chaîne vide, un album NON tagué passerait pour un DR 0 et
    // remonterait avec les pires — un mensonge.
    expect(src()).toContain("if (v == null || v === '') return null;");
  });

  it('les albums SANS tag sortent en DERNIER, jamais à zéro', () => {
    const s = src();
    expect(s).toContain('if (va == null) return 1;');
    expect(s).toContain('if (vb == null) return -1;');
  });

  it('l’écran ACTUEL l’a bien — c’est la référence de la parité', () => {
    // Contre-épreuve : si la v1 perdait ce tri, ce fichier n'aurait plus de
    // point de comparaison.
    expect(readFileSync(resolve(process.cwd(), 'src/components/LibraryView.svelte'), 'utf-8'))
      .toContain("{ key: 'dynamic_range', label: 'library.sortDynamicRange'");
  });
});
