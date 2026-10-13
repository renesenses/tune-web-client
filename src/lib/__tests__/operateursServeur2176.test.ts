// tune-web-client#2176 — les opérateurs que l'éditeur PROPOSE doivent être
// ceux que le serveur TRADUIT, famille par famille.
//
// Le serveur tient la même table dans `tune-smart-http/src/criteres.rs`
// (`Famille::operateurs()`), et sa garde joue chaque opérateur dans les deux
// moteurs. Un opérateur proposé ici et absent là-bas rendrait une règle FAUSSE
// ou ignorée ; un opérateur traduit là-bas et absent ici ne serait jamais
// proposé — c'était « ne contient pas » (tune-server-rust#6250).
//
// Deux comparaisons :
//  1. TOUJOURS, à la copie figée `operateursCriteresServeur.json` (le dépôt
//     serveur n'est pas là en CI) ;
//  2. quand le source serveur est lisible — `TUNE_CRITERES_RS`, ou le clone
//     voisin `../tune-server-rust` —, au fichier `criteres.rs` LUI-MÊME, ce
//     qui attrape une copie figée restée en retard.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATEURS, type TypeChamp } from '../smartRegles';
import copie from './operateursCriteresServeur.json';

/** La famille du serveur (`criteres::Famille`) pour chaque type du client. */
const FAMILLE: Record<TypeChamp, string> = {
  text: 'Texte',
  int: 'Nombre',
  source: 'Source',
  folder: 'Repertoire',
  nullable: 'Vide',
  timestamp: 'Horodatage',
  credit: 'Credit',
  collection_ref: 'RefCollection',
  playlist_ref: 'RefPlaylist',
  favorite: 'Favori',
  tag_ref: 'Etiquette',
  count: 'Compte',
  marquage: 'Marquage',
};

const duClient = (): Record<string, string[]> =>
  Object.fromEntries(
    (Object.keys(OPERATEURS) as TypeChamp[]).map((t) => [
      FAMILLE[t],
      OPERATEURS[t].map((o) => o.value),
    ]),
  );

/** `Famille::operateurs()` lue dans le source Rust. */
export function lireCriteresRs(source: string): Record<string, string[]> {
  const debut = source.indexOf('const fn operateurs(self)');
  if (debut < 0) throw new Error('criteres.rs : `operateurs()` introuvable');
  const fin = source.indexOf('\n    }\n}', debut);
  const corps = source
    .slice(debut, fin)
    .replace(/^\s*\/\/.*$/gm, '');
  const table: Record<string, string[]> = {};
  for (const m of corps.matchAll(/((?:Famille::\w+\s*\|\s*)*Famille::\w+)\s*=>\s*&\[([^\]]*)\]/g)) {
    const ops = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
    for (const f of m[1].split('|')) table[f.trim().replace('Famille::', '')] = ops;
  }
  return table;
}

describe('opérateurs du client = opérateurs du serveur (#2176)', () => {
  it('chaque type du client a sa famille serveur, et inversement', () => {
    const { _source, ...serveur } = copie as Record<string, unknown>;
    expect(_source).toBeTruthy();
    expect(Object.keys(duClient()).sort()).toEqual(Object.keys(serveur).sort());
  });

  it('la table du client est la copie figée de criteres.rs', () => {
    const { _source, ...serveur } = copie as Record<string, unknown>;
    void _source;
    expect(duClient()).toEqual(serveur);
  });

  it('« ne contient pas » est proposé pour chaque règle texte', () => {
    expect(OPERATEURS.text.map((o) => o.value)).toContain('not_contains');
    expect(OPERATEURS.text.find((o) => o.value === 'not_contains')?.labelKey).toBe(
      'smartCollection.opNotContains',
    );
  });

  const chemin =
    process.env.TUNE_CRITERES_RS ??
    resolve(process.cwd(), '../tune-server-rust/tune-smart-http/src/criteres.rs');
  it.runIf(existsSync(chemin))('la table du client est celle de criteres.rs', () => {
    expect(duClient()).toEqual(lireCriteresRs(readFileSync(chemin, 'utf-8')));
  });
});
