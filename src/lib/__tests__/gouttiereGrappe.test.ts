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
 *
 * ## L'angle mort de la première version de cette garde
 *
 * Elle ne balayait que `src/components/v2`. Or **trois écrans v1 sont montés
 * dans la coquille v2** — `OxygenView`, `AmbianceView`, `BrowseView` (les
 * Répertoires) — et ils passaient donc au travers. Bertrand a envoyé la copie
 * d'écran des Répertoires le 08/09/2026 : la barre de recherche globale
 * recouvrait « Voir dans la bibliothèque » et « Ouvrir dans Oxygen ».
 *
 * La garde lit désormais les `import` de `ShellV2` : tout écran qu'elle y
 * trouve est soumis à la même règle, d'où qu'il vienne. Un quatrième écran v1
 * monté demain sera couvert sans qu'on y pense.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'fs';

const ECRANS = globSync('src/components/v2/*.svelte');
const SHELL = readFileSync('src/components/v2/ShellV2.svelte', 'utf8');

/**
 * Les écrans v1 que la coquille v2 monte quand même. On ne les nomme pas à la
 * main : on les DÉDUIT des `import … from '../X.svelte'` de `ShellV2`, pour que
 * le prochain soit couvert sans qu'on pense à l'ajouter ici.
 *
 * Sont écartés les composants qui ne sont pas des écrans : ils n'ont pas
 * d'en-tête, et leur imposer une gouttière n'aurait pas de sens.
 */
const PAS_DES_ECRANS = new Set([
  'TransportBar', 'NowPlaying', 'DialogContainer', 'GlobalSearchBar', 'TvView',
]);
const ECRANS_V1 = [...SHELL.matchAll(/import\s+(\w+)\s+from\s+'\.\.\/(\w+\.svelte)'/g)]
  .filter((m) => !PAS_DES_ECRANS.has(m[1]))
  .map((m) => `src/components/${m[2]}`);

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

  it('🔴 est définie UNE fois, et dans une feuille que la porte sait lire', () => {
    // Elle vivait dans le style de `ShellV2`. `check-jetons-css` ne balaie que
    // `src/styles/` : il annonçait le jeton « défini nulle part » pour les
    // vingt-quatre écrans qui l'emploient — et un jeton absent n'échoue pas,
    // la déclaration est ignorée en silence. C'était la panne d'origine, que
    // la porte savait dire.
    const feuille = readFileSync('src/styles/tune-v2.css', 'utf8');
    expect(feuille).toMatch(/\.tune-v2\{--v2-grappe-w:\s*\d+px\}/);
    // Et nulle part ailleurs : une seconde définition serait une seconde valeur.
    const doublons = [...ECRANS, ...ECRANS_V1]
      .filter((f) => /--v2-grappe-w\s*:/.test(css(f)));
    expect(doublons).toEqual([]);
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

  it('🔴 les écrans v1 montés dans la coquille sont bien vus', () => {
    // La première version de cette garde ne les balayait pas : c'est par là que
    // les Répertoires sont passés.
    expect(ECRANS_V1).toContain('src/components/BrowseView.svelte');
    expect(ECRANS_V1).toContain('src/components/OxygenView.svelte');
    expect(ECRANS_V1).toContain('src/components/AmbianceView.svelte');
  });

  it('🔴 les écrans v1 montés dans la coquille réservent la gouttière', () => {
    const sans = ECRANS_V1.filter((f) => !css(f).includes('var(--v2-grappe-w'));
    expect(sans).toEqual([]);
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

  it('🔴 l’en-tête partagé la réserve, pour tous ceux qui l’adoptent', () => {
    // `styles/tune-v2.css` porte `.v2-top`, l'en-tête harmonisé (08/09/2026).
    // Un écran converti n'a plus de `.top` local : c'est la feuille commune qui
    // doit alors tenir la gouttière, sinon la conversion la ferait perdre.
    const feuille = readFileSync('src/styles/tune-v2.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(feuille).toMatch(/\.v2-top\s*\{[^}]*padding-right:\s*var\(--v2-grappe-w/);
  });

  it('un écran converti à l’en-tête partagé reste couvert', () => {
    // Zones est le premier converti. Il n'a plus de `.top` local ET n'a plus
    // besoin d'une gouttière à lui : la garde ne doit pas le déclarer fautif,
    // mais elle doit constater qu'il passe bien par la classe partagée.
    const zones = readFileSync('src/components/v2/ZonesV2.svelte', 'utf8');
    expect(zones).toContain('class="v2-top"');
    expect(css('src/components/v2/ZonesV2.svelte')).not.toMatch(/\.top\s*\{/);
  });

  it('🔴 la grappe reste au-dessus, et c’est voulu', () => {
    // Si elle cessait d'être absolue, la bannière de mise à jour la pousserait
    // et la gouttière n'aurait plus d'objet. Le test dit la prémisse.
    const c = css('src/components/v2/ShellV2.svelte');
    expect(c).toMatch(/\.av-tr\s*\{[^}]*position:\s*absolute/);
  });
});
