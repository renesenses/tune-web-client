import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 Rien, hors de `src/components/`, ne doit importer DEPUIS `src/components/`.
 *
 * C'est la condition pour supprimer l'interface actuelle (phase 5 du chantier
 * de bascule, `docs/chantiers/basculer-la-v2-en-v1.md`). Tant qu'un composant
 * de `v2/`, `partages/` ou `v2-heritage/` puise à la racine, effacer celle-ci
 * casse la v2.
 *
 * ## Pourquoi une GARDE et pas un inventaire
 *
 * L'inventaire a sous-estimé les emprunts TROIS fois :
 *
 * 1. il ne comptait que `from '…'` et ratait les `import('…')` dynamiques —
 *    24 annoncés, 26 réels ;
 * 2. il voyait les satellites, pas les satellites DE satellites
 *    (`OxygenFolderFacet`, atteint par `OxygenFacetRail`) ;
 * 3. il ne regardait que `v2/`, alors que `partages/` et `v2-heritage/`
 *    empruntaient eux aussi — onze composants de plus, découverts APRÈS avoir
 *    annoncé la phase close.
 *
 * Chaque déplacement révèle en outre les dépendances du composant déplacé :
 * ranger onze fichiers en a fait apparaître deux autres. C'est une cascade, et
 * une cascade ne se mesure pas, elle se garde.
 *
 * Cette garde, elle, répond à la question une fois pour toutes : elle ne
 * compte rien, elle exige zéro.
 */
const COMPOSANTS = resolve(__dirname, '../../components');
const DOSSIERS = ['v2', 'partages', 'v2-heritage'];

function empruntsALaRacine(): string[] {
  const out: string[] = [];
  for (const d of DOSSIERS) {
    const chemin = resolve(COMPOSANTS, d);
    for (const f of readdirSync(chemin).filter((n) => n.endsWith('.svelte'))) {
      const src = readFileSync(resolve(chemin, f), 'utf-8');
      // `'../X.svelte'` depuis un sous-dossier = la racine des composants.
      // Les DEUX formes : un import dynamique compte autant qu'un statique —
      // c'est en l'oubliant que le premier inventaire s'est trompé.
      for (const m of src.matchAll(/(?:from |import\()'\.\.\/([A-Za-z][A-Za-z0-9]*)\.svelte'/g)) {
        out.push(`${d}/${f} → ${m[1]}`);
      }
    }
  }
  return out.sort();
}

describe('la racine des composants est isolée', () => {
  it('aucun sous-dossier ne puise dans l’interface actuelle', () => {
    expect(
      empruntsALaRacine(),
      'un composant hors racine importe encore depuis src/components/ : '
      + 'rangez-le dans partages/ (utilisé par les deux interfaces) ou dans le '
      + 'dossier de son appelant. Supprimer la racine casserait la v2.',
    ).toEqual([]);
  });

  it('la garde regarde bien quelque chose', () => {
    // Contre-épreuve : si les dossiers étaient vides ou mal nommés, le test
    // ci-dessus passerait sans rien vérifier.
    let total = 0;
    for (const d of DOSSIERS) {
      const n = readdirSync(resolve(COMPOSANTS, d)).filter((x) => x.endsWith('.svelte')).length;
      expect(n, `${d}/ est vide — la garde ne garde rien`).toBeGreaterThan(0);
      total += n;
    }
    expect(total).toBeGreaterThan(90);
  });
});
