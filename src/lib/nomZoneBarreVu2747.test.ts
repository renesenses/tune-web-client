import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// web#2747 — FabienM (rc11, fil 2723) : « le nom de la zone active n'apparaît
// plus, seule l'icône générique reste ; ça marchait en rc9 ». Cause : la
// requête de conteneur de #2555 masquait `.zone-chip-label` sur toute la plage
// 1200-1800 px de barre dès que les VU-mètres sont allumés. vitest n'a pas de
// moteur de mise en page : ce banc garde les deux règles qui comptent.
const SRC = readFileSync(new URL('../components/partages/TransportBar.svelte', import.meta.url), 'utf-8');

/** Corps de la requête de conteneur de #2555 (même lecture que son banc). */
function requeteVuIntermediaire(src: string): { corps: string } | null {
  const m = src.match(/@container tbar \(min-width: \d+px\) and \(max-width: \d+px\) \{([\s\S]*?)\n  \}\n/);
  return m ? { corps: m[1] } : null;
}

/** Retire les commentaires CSS/HTML pour ne juger que les règles actives. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
}

export function fautes2747(src: string): string[] {
  const fautes: string[] = [];
  const r = requeteVuIntermediaire(sansCommentaires(src));
  if (!r) return ['requête #2555 absente'];
  if (/zone-chip-label\s*\{[^}]*display:\s*none/.test(r.corps)) fautes.push('libellé de zone masqué entre 1200 et 1800 px');
  if (/zone-icon-btn\s*\{[^}]*max-width:\s*32px/.test(r.corps)) fautes.push('pastille de zone réduite au carré');
  // Le libellé ne peut rester que si la colonne de droite ne déborde plus :
  // elle doit valoir au moins sa largeur de contenu.
  const grille = sansCommentaires(src).match(/\.transport-bar\.vu\s*\{([^}]*)\}/);
  if (!grille || !/grid-template-columns:[^;]*minmax\(max-content,\s*1fr\)\s*;/.test(grille[1])) {
    fautes.push('colonne de droite à quart fixe : le libellé ferait déborder la barre (#2555)');
  }
  return fautes;
}

describe('web#2747 — nom de la zone active dans la barre à VU-mètres', () => {
  it('le libellé de zone reste affiché entre 1200 et 1800 px, sans débordement', () => {
    expect(fautes2747(SRC)).toEqual([]);
  });

  it('le libellé porte toujours le nom de la zone', () => {
    expect(SRC).toMatch(/<span class="truncate zone-chip-label">\{zoneChipLabel\(zone\)\}<\/span>/);
  });

  it('contre-épreuve : la règle de rc10/rc11 (libellé masqué, quart fixe) est refusée', () => {
    const rc11 = SRC
      .replace(/(@container tbar \(min-width: 1200px\) and \(max-width: 1800px\) \{)/,
        '$1\n    .transport-bar.vu .zone-chip-label {\n      display: none;\n    }')
      .replace(/(grid-template-columns: minmax\(0, 1fr\) minmax\(0, 2fr\) )minmax\(max-content, 1fr\);/, '$1minmax(0, 1fr);');
    const f = fautes2747(rc11);
    expect(f).toContain('libellé de zone masqué entre 1200 et 1800 px');
    expect(f).toContain('colonne de droite à quart fixe : le libellé ferait déborder la barre (#2555)');
  });
});
