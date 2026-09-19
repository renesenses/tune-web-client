/**
 * #994 — Alex Campbell : « only album art and all the cover art stitched
 * together, no Artist information, no Album information ». Et sa porte de
 * sortie : « or perhaps just leave oxygen the way it is and add another
 * viewing option? » — arbitré par Bertrand le 13/09/2026 : une QUATRIÈME
 * disposition, « Mur », à côté de Grille, Album, Cartes et Détails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const oxy = lire('src/components/v2-heritage/OxygenView.svelte');

describe('#994 — la disposition « Mur »', () => {
  it('🔴 le type des dispositions la connaît', () => {
    expect(lire('src/lib/stores/preferences.ts')).toMatch(/export type OxygenViewMode = .*'mur'/);
  });
  it('🔴 le sélecteur la propose, et la branche de rendu existe', () => {
    expect(oxy).toContain("onclick={() => setMode('mur')}");
    expect(oxy).toContain("{:else if mode === 'mur'}");
  });
  it('🔴 le mur ne porte NI titre NI artiste en texte — seulement l’image, le texte en infobulle', () => {
    const debut = oxy.indexOf("{:else if mode === 'mur'}");
    const fin = oxy.indexOf("{:else if mode === 'grid'}", debut);
    const bloc = oxy.slice(debut, fin).replace(/<!--[\s\S]*?-->/g, '');
    expect(bloc).toContain('<div class="mur">');
    expect(bloc).toContain('title={`${g.title} — ${g.artist}`}');
    // Aucun nœud texte de titre/artiste : pas de `{g.title}` hors attribut.
    expect(bloc).not.toMatch(/>\s*\{g\.title\}/);
    expect(bloc).not.toMatch(/>\s*\{g\.artist\}/);
    expect(bloc).not.toContain('QualityBadge');
  });
  it('mêmes albums, mêmes gestes que la Grille : clic = ouvrir, double-clic = lire', () => {
    const debut = oxy.indexOf("{:else if mode === 'mur'}");
    const bloc = oxy.slice(debut, oxy.indexOf("{:else if mode === 'grid'}", debut));
    expect(bloc).toContain('{#each albums as g (g.key)}');
    expect(bloc).toContain('onclick={() => openAlbum(g)}');
    expect(bloc).toContain('ondblclick={() => playAlbumGroup(g)}');
  });
  it('des carrés jointifs — le CSS du mur', () => {
    expect(oxy).toMatch(/\.mur \{ display: grid;[^}]*gap: 2px/);
    expect(oxy).toMatch(/\.mur \.tuile \{[^}]*aspect-ratio: 1/);
  });
});
