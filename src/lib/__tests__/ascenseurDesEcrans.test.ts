/**
 * Chaque écran monté par la coquille porte SON ascenseur.
 *
 * `.main` est `display:flex; overflow:hidden`, et la coquille n'accorde
 * `overflow-y:auto` qu'à un enfant de classe `.dash` (`ShellV2`, règles
 * `.main{…}` et `.main > .dash{…}`). Sa seule autre règle,
 * `.main > :global(*)`, ne donne que le dimensionnement flex. Un écran qui ne
 * déclare pas son propre défilement est donc **coupé en bas, sans ascenseur**.
 *
 * ## Deux fois le même défaut, deux personnes différentes
 *
 * 1. **FabienM, fil 1859, 20/09/2026** : « Impossible de scroller pour faire
 *    défiler par le bas, espace perdu en dessous de Recommandations ». Le
 *    tableau de bord et les recommandations étaient frères directs de `.main` ;
 *    le correctif fut le conteneur `.dash` qui les empile et porte l'ascenseur
 *    « que tous les autres écrans de la coquille ont déjà ».
 * 2. **Bertrand, 27/09/2026** : « page Concerts : on ne peut pas scroller vers
 *    le bas ». Le même défaut, sur un écran que le correctif de septembre n'avait
 *    pas couvert — la phase 5 lui avait bien ajouté la réserve de la grappe, et
 *    avait oublié l'ascenseur. Les **Alarmes** étaient dans le même cas, jamais
 *    signalées.
 *
 * Deux occurrences d'une même cause ne sont pas deux accidents : c'est une
 * invariante qui manquait. La voici.
 *
 * ## Ce que cette garde NE couvre pas, et pourquoi
 *
 * Elle lit du CSS. Un écran qui **délègue** son défilement à un composant
 * enfant — `HomeV2` et `TableauDeBordV2` sont des enveloppes de trente lignes
 * autour de `PageWidgets`, qui porte l'ascenseur — n'a aucune règle à lui. Ces
 * cas sont donc **nommés** ci-dessous plutôt que devinés : ajouter un écran
 * délégant demande d'écrire ici POURQUOI il délègue. C'est le prix d'une garde
 * statique, et il est payé en une ligne.
 *
 * Elle ne prouve pas non plus qu'un ascenseur déclaré fonctionne : elle prouve
 * qu'il est déclaré. Le comportement, lui, se voit à l'écran.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SHELL_F = 'src/components/v2/ShellV2.svelte';
const SHELL = readFileSync(SHELL_F, 'utf8');

/**
 * Les composants que la coquille monte DANS son conteneur `.dash` : il porte
 * l'ascenseur pour eux. Déduits du balisage, pas nommés à la main.
 */
const SOUS_DASH = (() => {
  const i = SHELL.indexOf('<div class="dash">');
  if (i < 0) return new Set<string>();
  const bloc = SHELL.slice(i, SHELL.indexOf('</div>', i));
  return new Set([...bloc.matchAll(/<([A-Z][A-Za-z0-9]*)\s*\/>/g)].map((m) => m[1]));
})();

/**
 * Les écrans qui délèguent leur ascenseur à un composant enfant. Chacun porte
 * sa raison : sans elle, cette liste deviendrait la porte de sortie de la garde.
 */
const DELEGUENT: Record<string, string> = {
  HomeV2: 'enveloppe de PageWidgets, qui porte l’ascenseur',
  TableauDeBordV2: 'enveloppe de PageWidgets, qui porte l’ascenseur',
};

/** Composants montés par la coquille qui ne sont pas des écrans. */
const PAS_DES_ECRANS = new Set([
  'TransportBar', 'NowPlaying', 'DialogContainer', 'GlobalSearchBar',
  'ToastContainer', 'SessionExpireeOverlay', 'AvatarMenu', 'Sidebar',
  'BottomTabBar', 'MenuZone', 'MenuPisteV2',
]);

/** Les écrans montés par la coquille, déduits de ses `import`. */
function ecransMontes(): { nom: string; fichier: string }[] {
  const vus = new Map<string, string>();
  for (const m of SHELL.matchAll(
    /import\s+(\w+)\s+from\s+'\.(\/|\.\/v2-heritage\/)(\w+)\.svelte'/g,
  )) {
    const nom = m[1];
    if (PAS_DES_ECRANS.has(nom) || SOUS_DASH.has(nom)) continue;
    const dossier = m[2] === '/' ? 'v2' : 'v2-heritage';
    vus.set(nom, `src/components/${dossier}/${m[3]}.svelte`);
  }
  return [...vus].map(([nom, fichier]) => ({ nom, fichier }));
}

/** Le CSS d'un composant, commentaires retirés — comme `gouttiereGrappe`. */
function css(fichier: string): string {
  const src = readFileSync(fichier, 'utf8');
  const i = src.lastIndexOf('<style');
  return i < 0 ? '' : src.slice(i).replace(/\/\*[\s\S]*?\*\//g, ' ');
}

const A_UN_ASCENSEUR = /overflow(-y)?\s*:\s*(auto|scroll)/;

describe('L’ascenseur des écrans de la coquille', () => {
  it('la coquille coupe bien ce qui dépasse, et n’accorde l’ascenseur qu’à `.dash`', () => {
    // Sans ces deux faits, l'invariante n'a pas d'objet : si `.main` défilait,
    // aucun écran n'aurait besoin du sien. Cette garde tomberait alors en
    // même temps que sa raison d'être, au lieu de rester verte pour rien.
    const feuille = css(SHELL_F);
    expect(feuille).toMatch(/\.main\{[^}]*overflow\s*:\s*hidden/);
    expect(feuille).toMatch(/\.main\s*>\s*\.dash\{[^}]*overflow-y\s*:\s*auto/);
  });

  it('la déduction trouve bien les écrans, des deux dossiers', () => {
    // Une déduction vide rendrait tous les cas suivants verts sans rien lire.
    const noms = ecransMontes().map((e) => e.nom);
    expect(noms.length).toBeGreaterThan(10);
    expect(noms).toContain('ConcertsView');
    expect(noms).toContain('AlarmesV2');
    expect(noms).toContain('LibraryV2');
  });

  it('les composants empilés sous `.dash` sont écartés — l’ascenseur est au parent', () => {
    // Le correctif du 20/09 : c'est `.dash` qui défile pour eux deux.
    expect([...SOUS_DASH]).toEqual(
      expect.arrayContaining(['DashboardView', 'RecommendationsSection']),
    );
  });

  it('🔴 chaque écran monté déclare son propre ascenseur', () => {
    const sans = ecransMontes()
      .filter((e) => !(e.nom in DELEGUENT))
      .filter((e) => !A_UN_ASCENSEUR.test(css(e.fichier)))
      .map((e) => e.nom);
    expect(
      sans,
      'ces écrans seront coupés en bas sans pouvoir défiler — voir l’en-tête',
    ).toEqual([]);
  });

  it('les écrans qui délèguent disent à qui, et restent de simples enveloppes', () => {
    for (const [nom, raison] of Object.entries(DELEGUENT)) {
      expect(raison.length, `${nom} : la raison de la délégation manque`).toBeGreaterThan(20);
      const f = ecransMontes().find((e) => e.nom === nom);
      expect(f, `${nom} n’est plus monté par la coquille : retirer cette entrée`).toBeDefined();
      // Une enveloppe reste courte. Le jour où l'une grossit, elle a
      // probablement acquis son propre balisage — et son propre besoin
      // d'ascenseur.
      const lignes = readFileSync(f!.fichier, 'utf8').split('\n').length;
      expect(lignes, `${nom} a grossi : vérifier qu’il délègue encore`).toBeLessThan(120);
    }
  });
});
