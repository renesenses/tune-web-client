import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  type Contexte,
  extraireFeuilleDeStyle,
  releverDeclarations,
  valeurEffective,
} from '../cascadeCss';

/**
 * Trois interactions de la Bibliothèque perdues par la fusion `f14553f`
 * (23/07/2026), qui a avalé le côté perdant `e554f38..c90af63` sans que les
 * commits sortent de l'histoire — donc invisibles à un audit par numéro.
 *
 *   - `1161675` « l'icône d'édition d'un artiste doit être visible en
 *     permanence, pas seulement au survol » (#1081) ;
 *   - `4c637eb` « cliquer un album SANS pochette ouvre sa fiche, ne lance pas
 *     la lecture » (#55, signalé par Thibaud) ;
 *   - `41a2d61` « accorder le nombre de colonnes du défilement virtuel avec la
 *     grille CSS » (#1022) — celui-là, lui, n'est PAS à restaurer : voir plus
 *     bas.
 *
 * CE QUE CES TESTS PROUVENT, ET CE QU'ILS NE PROUVENT PAS
 * -------------------------------------------------------
 * Les deux premiers sujets sont du CSS pur. Sous jsdom, aucun test de rendu ne
 * les atteindrait : ni la cascade, ni les requêtes de média, ni `:hover` n'y
 * sont appliqués — un test de rendu serait vert quoi qu'il arrive, exactement
 * la fausse preuve à éviter. On résout donc la cascade à la main, sur la
 * feuille de styles RÉELLE de `LibraryView.svelte`, dans la situation précise
 * que décrivent les deux signalements : **un appareil tactile, donc sans
 * survol**. Cela prouve que la feuille livrée déclare bien ce qui a été promis ;
 * cela ne prouve pas le rendu pixel d'un navigateur, qui demanderait un test de
 * bout en bout absent de ce dépôt.
 *
 * Aucune valeur attendue n'est recopiée du code : les sélecteurs sont RELEVÉS
 * dans la feuille, et les promesses sont exprimées en termes d'usage
 * (« l'icône a une opacité non nulle », « la pastille ne capte pas le doigt »).
 */

const LIBRARY_VIEW = readFileSync(
  resolve(__dirname, '../../components/LibraryView.svelte'),
  'utf8',
);

const REGLES = releverDeclarations(extraireFeuilleDeStyle(LIBRARY_VIEW), [
  'opacity',
  'pointer-events',
]);

/**
 * Tablette ou téléphone : le doigt ne survole pas. C'est la situation des deux
 * signalements — « inatteignable au doigt » (#1081), « lecture déclenchée par
 * mégarde au toucher » (#55).
 */
const TACTILE: Contexte = { ecran: { largeur: 1024, hauteur: 768 }, survol: false };

/** Bureau, pointeur sur l'élément : la pastille de lecture doit rester utilisable. */
const SURVOL: Contexte = { ecran: { largeur: 1600, hauteur: 900 }, survol: true };

/** Tous les sélecteurs de la feuille qui mentionnent cette classe. */
function selecteursVisant(classe: string): string[] {
  return [
    ...new Set(REGLES.filter((r) => r.selecteur.includes(classe)).map((r) => r.selecteur)),
  ].sort();
}

describe("icône d'édition de l'artiste — visible sans survol (#1081)", () => {
  const SELECTEURS = selecteursVisant('.artist-edit-btn');

  it('la feuille ne vise cette icône que par les sélecteurs examinés ici', () => {
    // Recensement : si un sélecteur apparaît sans qu'on l'ait examiné, la
    // résolution ci-dessous ne vaut plus et ce test le signale.
    // `.artist-edit-btn:hover` n'apparaît pas ici : il ne déclare qu'une
    // `color`, ni `opacity` ni `pointer-events`.
    expect(SELECTEURS).toEqual([
      '.artist-detail-name:hover .artist-edit-btn',
      '.artist-edit-btn',
    ]);
  });

  it("est visible au doigt : opacité non nulle sans aucun survol", () => {
    const opacite = valeurEffective(REGLES, SELECTEURS, 'opacity', TACTILE);
    expect(opacite).not.toBeNull();
    expect(Number(opacite)).toBeGreaterThan(0);
  });

  it('reste discrète au repos et pleine au survol', () => {
    const repos = Number(valeurEffective(REGLES, SELECTEURS, 'opacity', TACTILE));
    const survolee = Number(valeurEffective(REGLES, SELECTEURS, 'opacity', SURVOL));
    expect(repos).toBeLessThan(1);
    expect(survolee).toBe(1);
  });
});

describe('album sans pochette — un appui ouvre la fiche (#55)', () => {
  const SELECTEURS = selecteursVisant('.play-overlay');

  it('la feuille ne vise cette pastille que par les sélecteurs examinés ici', () => {
    expect(SELECTEURS).toEqual(['.album-card-art:hover .play-overlay', '.play-overlay']);
  });

  it("ne capte pas le doigt tant qu'elle est invisible", () => {
    // La pastille est `position: absolute; inset: 0` : elle recouvre TOUTE la
    // pochette. Invisible mais cliquable, elle avalait l'appui et lançait la
    // lecture au lieu d'ouvrir la fiche — d'autant plus visible sur un album
    // sans pochette, dont l'`<img>` est masquée par `onerror` et qui n'offre
    // qu'un aplat gris.
    expect(Number(valeurEffective(REGLES, SELECTEURS, 'opacity', TACTILE))).toBe(0);
    expect(valeurEffective(REGLES, SELECTEURS, 'pointer-events', TACTILE)).toBe('none');
  });

  it('redevient cliquable dès que le survol la révèle', () => {
    expect(Number(valeurEffective(REGLES, SELECTEURS, 'opacity', SURVOL))).toBe(1);
    expect(valeurEffective(REGLES, SELECTEURS, 'pointer-events', SURVOL)).toBe('auto');
  });
});

describe('colonnes de la grille virtuelle — accord JS/CSS déjà tenu autrement (#1022)', () => {
  /**
   * `41a2d61` faisait coller le CALCUL JS à la formule `auto-fill` du CSS
   * (`floor((w + gap) / (min + gap))`, avec 140px et 24px écrits en dur).
   *
   * Ce n'est PAS ce qu'il faut restaurer : `#1307` a depuis retourné le
   * problème dans l'autre sens, et mieux — la grille virtuelle ÉPINGLE
   * désormais `grid-template-columns` sur le nombre de colonnes calculé par le
   * JS, en style en ligne. Le style en ligne l'emporte sur toute règle de la
   * feuille : les deux ne PEUVENT plus diverger, quelles que soient la densité
   * (mur de pochettes, `WALL_MIN_WIDTH`) et la requête de média (le palier
   * kiosque déclare `minmax(160px, 1fr)` et `gap: 8px`, valeurs pour
   * lesquelles les 140/24 en dur de `41a2d61` seraient FAUX).
   *
   * Ce test garde donc l'épinglage, précisément pour qu'un audit ultérieur ne
   * « restaure » pas `41a2d61` par-dessus et ne réintroduise pas la divergence.
   */
  it('la grille virtuelle des albums épingle ses colonnes sur le calcul JS', () => {
    expect(LIBRARY_VIEW).toContain(
      'grid-template-columns:repeat({albumGridMetrics.cols}, minmax(0, 1fr))',
    );
  });

  it('la grille virtuelle par année épingle les siennes de la même façon', () => {
    expect(LIBRARY_VIEW).toContain(
      'grid-template-columns:repeat({yearRowModel.cols}, minmax(0, 1fr))',
    );
  });
});
