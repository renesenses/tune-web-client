/**
 * Le suffixe d'une ligne de piste tient sur UNE ligne de grille.
 *
 * Bertrand, 09/09/2026 : « Historique : diminue l'espace entre les pistes ».
 *
 * Ce n'était pas un réglage d'espacement. `.avecSuffixe` est une grille à DEUX
 * colonnes ; l'extrait `apres` de l'Historique rend DEUX éléments racine —
 * l'heure (« il y a 9 h ») et le cœur des radios — soit TROIS enfants pour deux
 * colonnes. Le troisième tombait sur une seconde ligne IMPLICITE, sous la
 * piste.
 *
 * Ce qui rendait le défaut invisible à la lecture du code : ce cœur est en
 * `opacity: 0` hors survol. La ligne en trop ne montrait rien et coûtait
 * pourtant sa hauteur (28 px) plus la gouttière de la grille (8 px), à chaque
 * piste de l'écran.
 *
 * La garde ne mesure pas des pixels — elle tient l'INVARIANT qui les cause :
 * le suffixe est enveloppé, donc la grille reçoit exactement deux enfants quoi
 * que l'appelant écrive dans son extrait.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(__dirname, '../../components/v2/', p), 'utf-8');
const liste = lire('ListePistesV2.svelte');

/** Les éléments RACINE d'un extrait `{#snippet nom(...)}…{/snippet}`. */
function racinesDuSnippet(source: string, nom: string): number {
  const i = source.indexOf(`{#snippet ${nom}(`);
  if (i < 0) return -1;
  const fin = source.indexOf('{/snippet}', i);
  // 🔴 Les COMMENTAIRES d'abord : `<!-- … -->` commence par `<` et se faisait
  // compter comme un élément racine. Ajouter un commentaire au-dessus d'une
  // ligne faisait donc rougir la garde sans que le rendu ait bougé d'un pixel
  // — attrapé le 09/09/2026 en documentant l'ajout de la zone d'écoute.
  const corps = source
    .slice(source.indexOf('\n', i), fin)
    .replace(/<!--[\s\S]*?-->/g, '');
  // Un élément racine : une balise ouvrante ou un bloc `{#if}` en tête de ligne
  // à l'indentation la plus faible du corps.
  const lignes = corps.split('\n').filter((l) => l.trim() && !l.trim().startsWith('{@const'));
  const creux = Math.min(...lignes.map((l) => l.length - l.trimStart().length));
  return lignes.filter((l) => {
    const t = l.slice(creux);
    // 🔴 `</span>` n'est pas une racine — c'est la FIN d'une. Le compteur
    // prenait toute ligne commençant par `<`, donc un élément écrit sur
    // plusieurs lignes était compté DEUX fois. Second défaut du compteur
    // attrapé le 09/09/2026, avec celui des commentaires.
    return (
      (l.length - l.trimStart().length) === creux &&
      ((t.startsWith('<') && !t.startsWith('</')) || t.startsWith('{#if'))
    );
  }).length;
}

describe('l’enveloppe du suffixe', () => {
  it('🔴 le rendu du suffixe est enveloppé dans un seul élément', () => {
    expect(liste).toContain('<span class="suffixe">{@render apres(p, i)}</span>');
    // 🔴 CHAQUE rendu du suffixe est enveloppé, pas seulement celui-là. Le mode
    // TABLEAU l'enveloppait déjà (`<span class="td act">`) et n'a jamais souffert
    // du défaut : c'est le mode LIGNES qui rendait l'extrait nu. La garde
    // vérifie donc les deux, sans quoi corriger l'un laisserait l'autre.
    const nus = liste
      .split('{@render apres(p, i)}')
      .slice(0, -1)
      .filter((avant) => !/<span class="(suffixe|td act)"[^>]*>$/.test(avant.trimEnd()));
    expect(nus, 'un rendu du suffixe est posé nu dans sa grille').toEqual([]);
  });

  it('l’enveloppe range ses enfants côte à côte, jamais en pile', () => {
    const css = liste.slice(liste.lastIndexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const regle = /\.suffixe\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(regle).toContain('display:flex');
    expect(regle).toContain('align-items:center');
    expect(regle, 'une pile recréerait la ligne qu’on vient de retirer').not.toContain('column');
  });

  it('la grille reste à deux colonnes — c’est elle qui impose l’invariant', () => {
    const css = liste.slice(liste.lastIndexOf('<style')).replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(css).toMatch(/\.avecSuffixe\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  });
});

describe('les trois écrans qui posent un suffixe', () => {
  it('l’Historique en rend bien DEUX — c’est le cas qui a cassé', () => {
    // La colonne « zone + instant », puis le cœur radio (ou son emplacement
    // vide). C'était « l'heure puis le cœur » jusqu'au 09/09/2026 : la zone
    // d'écoute est venue s'empiler AVEC l'instant dans une seule colonne
    // (`.quand`), pour ne pas ajouter un troisième enfant à la grille — c'est
    // exactement l'invariant que ce fichier tient (FabienM, fil 1739, point 8).
    expect(racinesDuSnippet(lire('HistoriqueV2.svelte'), 'suffixe')).toBe(2);
  });

  it('🔴 aucun ne dépend plus du nombre qu’il rend', () => {
    // Le contrat est tenu par l'enveloppe, pas par la discipline des appelants :
    // un écran qui rendrait trois éléments demain ne casserait plus rien.
    for (const [f, nom] of [
      ['HistoriqueV2.svelte', 'suffixe'],
      ['PlaylistDetailV2.svelte', 'suffixe'],
      ['SearchV2.svelte', 'proximite'],
    ] as const) {
      expect(racinesDuSnippet(lire(f), nom), `${f} → ${nom}`).toBeGreaterThan(0);
    }
  });
});
