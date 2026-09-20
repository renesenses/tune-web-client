// #1308 — un banc ne charge JAMAIS un dictionnaire dans le corps d'un test.
//
// Importer `../locales/<langue>` à l'intérieur d'un `it` fait payer au test
// le chargement d'un fichier de 260 à 330 Ko, sous le chronomètre de 5 s et
// sous la concurrence de toute la porte : le test expirait au hasard dès que
// le banc dépassait ~552 fichiers. Les dictionnaires se prennent dans
// `onzeDictionnaires.ts`, chargé à la collecte (non chronométrée).
//
// Ce garde lit les fichiers de test ; il ne se lit pas lui-même, et le motif
// est assemblé pour ne jamais apparaître en clair dans ce fichier.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const RACINE = join(__dirname, '..', '..');
const CE_FICHIER = 'dictionnairesALaCollecte1308.test.ts';

function fichiersDeTest(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiersDeTest(p, acc);
    else if (/\.test\.ts$/.test(nom) && nom !== CE_FICHIER) acc.push(p);
  }
  return acc;
}

// `import(` suivi, dans la même expression, d'un chemin vers `locales/`.
const IMPORT_DYNAMIQUE = new RegExp('im' + 'port\\(\\s*[\'"`][^\'"`]*locales/');

describe('#1308 — les onze dictionnaires se chargent à la collecte, pas dans un test', () => {
  it('aucun banc n\'importe un dictionnaire dynamiquement', () => {
    const fautifs = fichiersDeTest(RACINE)
      .filter((f) => IMPORT_DYNAMIQUE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(RACINE, f));
    expect(fautifs, 'utiliser dictionnaire(code) de onzeDictionnaires.ts').toEqual([]);
  });

  it('le motif reconnaît bien la forme qui expirait', () => {
    // Contre-épreuve du garde lui-même : sans elle, une expression régulière
    // fausse le laisserait vert pour toujours.
    const fautive = 'const d = (await im' + 'port(`../locales/${code}`)).default;';
    expect(IMPORT_DYNAMIQUE.test(fautive)).toBe(true);
    expect(IMPORT_DYNAMIQUE.test("im" + "port('../locales/fr')")).toBe(true);
    expect(IMPORT_DYNAMIQUE.test("import lFr from '../locales/fr';")).toBe(false);
  });

  it('les onze dictionnaires sont servis, et une langue inconnue est refusée', () => {
    for (const code of ONZE_LANGUES) {
      expect(Object.keys(dictionnaire(code)).length, code).toBeGreaterThan(1000);
    }
    expect(dictionnaire('fr')['nav.library']).toBeTruthy();
    expect(() => dictionnaire('xx')).toThrow(/langue inconnue/);
  });
});
