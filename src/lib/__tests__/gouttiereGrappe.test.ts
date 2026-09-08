/**
 * La gouttière que les écrans réservent à la grappe du coin haut-droit.
 *
 * `.av-tr` — recherche globale, signet, avatar, et selon le contexte le bouton
 * de tiroir ou celui du mode TV — est en **position absolue**. Elle flotte
 * au-dessus des écrans, qui doivent donc lui réserver la place eux-mêmes.
 *
 * ## Ce qui a cassé, et pourquoi c'était inévitable
 *
 * Cette réserve était recopiée en dur, `padding-right: 96px`, dans
 * **vingt-quatre** en-têtes. Quand la recherche globale a rejoint la grappe
 * (#3629), aucune des vingt-quatre copies n'a suivi. Résultat, sur la 0.9.143 :
 * « le bouton Modifier est trop proche de l'icône rechercher » sur l'accueil,
 * « idem écran historique » (Bertrand, 08/09/2026).
 *
 * Un nombre magique recopié vingt-quatre fois n'est pas une valeur : c'est
 * vingt-quatre occasions de diverger. Il vit désormais dans `--v2-grappe-w`,
 * défini une seule fois sur `.v2-shell`.
 *
 * Trois écrans n'avaient AUCUNE réserve — Collections, Étiquettes et l'éditeur
 * de collection intelligente. Ils l'ont maintenant.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'fs';

const ECRANS = globSync('src/components/v2/*.svelte');
const SHELL = readFileSync('src/components/v2/ShellV2.svelte', 'utf8');

/** Le CSS d'un composant, commentaires retirés. */
function css(fichier: string): string {
  const src = readFileSync(fichier, 'utf8');
  const i = src.lastIndexOf('<style');
  return i < 0 ? '' : src.slice(i).replace(/\/\*[\s\S]*?\*\//g, ' ');
}

describe('La gouttière de la grappe', () => {
  it('la garde voit bien des écrans', () => {
    expect(ECRANS.length).toBeGreaterThan(30);
  });

  it('🔴 est définie UNE fois, sur la coquille', () => {
    expect(css('src/components/v2/ShellV2.svelte')).toMatch(/--v2-grappe-w:\s*\d+px/);
  });

  it('🔴 aucun écran ne recopie le nombre en dur', () => {
    // C'est exactement ce qui a cassé : vingt-quatre copies de `96px`, et la
    // grappe qui grandit sans elles.
    const fautifs: string[] = [];
    for (const f of ECRANS) {
      for (const m of css(f).matchAll(/padding-right:\s*(\d+)px/g)) {
        // Une petite marge intérieure n'est pas une gouttière de grappe : on ne
        // s'en prend qu'aux valeurs qui prétendent réserver la place.
        if (Number(m[1]) >= 60) fautifs.push(`${f.split('/').pop()} → ${m[0]}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it('les écrans à en-tête la réservent', () => {
    // Sans réserve, leur barre d'outils passe SOUS la grappe — c'est le
    // symptôme rapporté sur l'accueil et l'historique.
    const sans: string[] = [];
    for (const f of ECRANS) {
      const c = css(f);
      // Un écran « à en-tête » : il a une règle `.top` ou `.entete`.
      if (!/\.(?:top|entete)\s*\{/.test(c)) continue;
      if (!c.includes('var(--v2-grappe-w)')) sans.push(f.split('/').pop()!);
    }
    expect(sans).toEqual([]);
  });

  it('🔴 la grappe reste au-dessus, et c’est voulu', () => {
    // Si elle cessait d'être absolue, la bannière de mise à jour la pousserait
    // et la gouttière n'aurait plus d'objet. Le test dit la prémisse.
    const c = css('src/components/v2/ShellV2.svelte');
    expect(c).toMatch(/\.av-tr\s*\{[^}]*position:\s*absolute/);
  });
});
