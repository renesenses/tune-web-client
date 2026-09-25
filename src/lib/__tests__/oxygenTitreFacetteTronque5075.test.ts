import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * renesenses/tune-server-rust#5075 — rapport UI, fil 1944 (0.9.164, Windows) :
 * « Dans la vue oxygen, le tri des compositeurs A-Z est masqué par le titre
 * "COMPOSITEURS" ».
 *
 * 🔴 L'en-tête d'une facette est une rangée flex : `.ghtitle` (flex:1,
 * min-width:0), puis `.sortbtn`, `.clearbtn`, `.allvals` (tous flex:none).
 * Quand « Tout afficher » apparaît (facette tronquée), `.ghtitle` rétrécit
 * sous la largeur de son libellé. Or ce libellé était un nœud texte NU dans le
 * bouton : un élément flex anonyme, qu'on ne peut pas styler, dont la largeur
 * minimale est celle du mot entier. Rien ne le coupait : il débordait du bouton
 * et se peignait par-dessus « A→Z ».
 *
 * Correctif : le libellé dans son propre élément, qui peut rétrécir
 * (min-width:0) et s'élide (overflow:hidden, text-overflow:ellipsis,
 * white-space:nowrap). Les facettes courtes ne changent pas.
 *
 * jsdom ne met rien en page : ce fichier tient l'invariant CSS et de structure
 * qui produit le rendu.
 */
const rail = readFileSync(
  resolve(__dirname, '../../components/v2-heritage/OxygenFacetRail.svelte'),
  'utf-8',
);
const css = rail.slice(rail.lastIndexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, '');
const decl = (sel: string) => {
  const m = css.match(new RegExp(`(?:^|[}\\s])${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

/** Contenu de chaque `<button class="ghtitle" …>…</button>` du gabarit. */
function titres(): string[] {
  const gabarit = rail.slice(0, rail.lastIndexOf('<style'));
  // La balise ouvrante se clôt sur `}>` ou `">` : un simple `[^>]*` s'arrêterait
  // au `=>` de `onclick={() => toggle(f)}`.
  return [...gabarit.matchAll(/<button class="ghtitle"[\s\S]*?[}"]>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
}

describe('Oxygen : le titre d’une facette ne recouvre plus le tri A→Z (#5075)', () => {
  it('les en-têtes de facette existent, sinon la garde ne garde rien', () => {
    expect(titres().length).toBeGreaterThanOrEqual(2);
    expect(rail).toContain('class="sortbtn"');
    expect(rail).toContain('class="allvals"');
  });

  it('le libellé n’est plus un nœud texte nu : il est dans un élément .ghlabel', () => {
    for (const t of titres()) {
      // On retire le chevron et l'élément du libellé : il ne doit rien rester.
      const reste = t
        .replace(/<svg[\s\S]*?<\/svg>/g, '')
        .replace(/<span class="ghlabel"[^>]*>[\s\S]*?<\/span>/g, '')
        .trim();
      expect(t).toMatch(/<span class="ghlabel"/);
      expect(reste, `texte nu dans .ghtitle : ${reste}`).toBe('');
    }
  });

  it('le libellé peut rétrécir et s’élide au lieu de déborder', () => {
    const d = decl('.ghlabel');
    expect(d, 'aucune règle .ghlabel').not.toBe('');
    expect(d).toMatch(/min-width\s*:\s*0/);
    expect(d).toMatch(/overflow\s*:\s*hidden/);
    expect(d).toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(d).toMatch(/white-space\s*:\s*nowrap/);
  });

  it('le titre rétrécit, les boutons de la rangée ne rétrécissent pas', () => {
    expect(decl('.ghtitle')).toMatch(/min-width\s*:\s*0/);
    for (const b of ['.sortbtn', '.clearbtn', '.allvals']) {
      expect(decl(b), `${b} doit rester flex:none`).toMatch(/flex\s*:\s*none/);
    }
  });
});
