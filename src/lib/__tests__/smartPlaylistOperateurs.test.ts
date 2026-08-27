import { describe, expect, it } from 'vitest';

import { OPERATEURS, normaliserOperateur, optionOperateur } from '../smartPlaylistOperateurs';

/**
 * Opérateurs « supérieur ou égal » et « inférieur ou égal » de l'éditeur de
 * règles — `3408a76`, perdu par la fusion `f14553f` (23/07/2026) qui a avalé le
 * côté perdant `e554f38..c90af63` sans que les commits sortent de l'histoire.
 *
 * Une fonctionnalité absente est ici INVISIBLE : l'utilisateur ne sait pas
 * qu'elle a existé. Ce qui se voit, en revanche, c'est le dégât collatéral —
 * une règle déjà en base dont l'opérateur est stocké sous forme de symbole
 * (`">="`, semé par le serveur, cf. `smart_refs.rs:688`) ne correspond à AUCUNE
 * `<option>` du menu. Le `<select>` s'affiche donc vide ; et comme
 * l'enregistrement renvoie `op: rule.operator`, rouvrir puis enregistrer une
 * telle liste PERD son opérateur, que le serveur remplace alors par `contains`.
 *
 * CONTRAT SERVEUR
 * ---------------
 * Table de normalisation lue dans `tune-server/src/routes/smart_playlists.rs`
 * (`build_smart_query`, lignes 359-364) au commit `21ee20e` :
 *
 *     "greater_than" | ">=" | "gte" => "gte"
 *     "less_than"    | "<=" | "lte" => "lte"
 *     "equals"                      => "eq"
 *     "not_equals"                  => "neq"
 *     other                         => other
 *
 * Elle dit deux choses. D'abord que `gte` / `lte` sont bien compris — les
 * proposer n'invente rien. Ensuite, et c'est ce que `3408a76` ne pouvait pas
 * savoir, que `greater_than` produit DÉJÀ `gte` : le `>` du menu n'a jamais été
 * strict. Ajouter `≥` À CÔTÉ de `>` aurait donc offert deux entrées au
 * comportement identique au bit près. On propose `≥` / `≤` À LA PLACE de
 * `>` / `<`, ce qui dit enfin la vérité sur ce que fait le serveur, et les
 * anciennes valeurs restent lues sans perte par la normalisation.
 */

/** La table ci-dessus, telle que le serveur l'applique. */
function operateurServeur(op: string): string {
  switch (op) {
    case 'greater_than':
    case '>=':
    case 'gte':
      return 'gte';
    case 'less_than':
    case '<=':
    case 'lte':
      return 'lte';
    case 'equals':
      return 'eq';
    case 'not_equals':
      return 'neq';
    default:
      return op;
  }
}

const VALEURS_PROPOSEES = OPERATEURS.map((o) => o.value);

describe("le menu propose « ≥ » et « ≤ »", () => {
  it('les deux comparaisons inclusives sont offertes', () => {
    expect(OPERATEURS).toContainEqual({ value: 'gte', label: '≥' });
    expect(OPERATEURS).toContainEqual({ value: 'lte', label: '≤' });
  });

  it("aucune entrée n'en double une autre côté serveur", () => {
    // Deux entrées distinctes du menu doivent produire deux requêtes
    // distinctes, sinon l'utilisateur choisit entre deux libellés qui font
    // rigoureusement la même chose.
    const cotesServeur = VALEURS_PROPOSEES.map(operateurServeur);
    expect(new Set(cotesServeur).size).toBe(cotesServeur.length);
  });
});

describe('une règle déjà en base retrouve son opérateur', () => {
  /**
   * Formes que le serveur COMPREND : sa table les nomme, la règle produit donc
   * bien une condition SQL. La normalisation doit ici se contenter de renommer
   * — surtout pas de retraduire. `bit_depth >= 24` doit rester `bit_depth >= 24`.
   */
  const COMPRISES = [
    '>=',
    '<=',
    'gte',
    'lte',
    'greater_than',
    'less_than',
    'equals',
    'not_equals',
    'contains',
    'starts_with',
    'branch_of',
    'is_empty',
    'is_not_empty',
  ];

  /**
   * Formes que le serveur NE comprend PAS : elles tombent dans son
   * `_ => continue`, et la règle n'applique alors AUCUN filtre — la liste
   * renvoie toute la bibliothèque, en silence. C'est le défaut qu'a connu
   * Sergio sur les règles « Album » (forum #1008), commenté dans le serveur
   * lui-même. Pour celles-là, normaliser n'est pas préserver : c'est réparer.
   */
  const INCOMPRISES: [string, string][] = [
    ['>', 'gte'],
    ['<', 'lte'],
    ['=', 'equals'],
    ['!=', 'not_equals'],
  ];

  const TOUTES = [...COMPRISES, ...INCOMPRISES.map(([brut]) => brut)];

  it.each(TOUTES)('« %s » correspond à une entrée du menu', (stocke) => {
    // Sans cela le <select> s'affiche VIDE, et l'enregistrement renvoie cet
    // opérateur perdu au serveur.
    const normalise = normaliserOperateur(stocke);
    expect(VALEURS_PROPOSEES).toContain(normalise);
    expect(optionOperateur(normalise)).toBeDefined();
  });

  it.each(COMPRISES)('« %s » garde son sens pour le serveur', (stocke) => {
    expect(operateurServeur(normaliserOperateur(stocke))).toBe(operateurServeur(stocke));
  });

  it.each(INCOMPRISES)('« %s », que le serveur ignorait, devient « %s »', (stocke, attendu) => {
    // Tel quel, le symbole traverse la table du serveur sans être reconnu :
    // c'est ce qui le condamne au `_ => continue`.
    expect(operateurServeur(stocke)).toBe(stocke);
    // Une fois normalisé, il tombe sur un opérateur canonique du serveur.
    expect(normaliserOperateur(stocke)).toBe(attendu);
    expect(['gte', 'lte', 'eq', 'neq']).toContain(operateurServeur(attendu));
  });

  it('normaliser deux fois ne change plus rien', () => {
    for (const stocke of TOUTES) {
      const une = normaliserOperateur(stocke);
      expect(normaliserOperateur(une)).toBe(une);
    }
  });
});

describe('chaque entrée du menu est affichable', () => {
  it('porte soit une clé i18n, soit un symbole littéral, jamais rien', () => {
    for (const option of OPERATEURS) {
      expect(Boolean(option.key) || Boolean(option.label)).toBe(true);
    }
  });

  it('aucune valeur en double dans le menu', () => {
    expect(new Set(VALEURS_PROPOSEES).size).toBe(VALEURS_PROPOSEES.length);
  });
});
