import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Garde : un refus d'adresse de flux radio doit ARRIVER À L'ÉCRAN.
 *
 * Le défaut vécu (renesenses/tune-server-rust#2097, fil forum 1484) : Tades a
 * enregistré une station dont l'adresse commençait par `http;//` — un
 * point-virgule au lieu des deux-points. Rien ne l'a signalé. Il a fallu qu'il
 * ouvre la fiche et relise l'adresse caractère par caractère pour comprendre
 * pourquoi la station restait muette.
 *
 * Deux causes se cumulaient. Le serveur n'a rien validé — c'est corrigé de son
 * côté, et c'est là que doit vivre la règle, l'API étant appelable
 * directement. Mais le client, lui, avalait TOUT échec d'écriture dans un
 * `console.error` : même quand le serveur répondait, le formulaire se
 * contentait de ne rien faire. C'est cette moitié-ci que ce test tient.
 *
 * On lit la SOURCE plutôt que de rendre le composant : ce dépôt n'a pas de
 * harnais de rendu Svelte, et la propriété à tenir est structurelle — le
 * message existe, il est alimenté par l'erreur, et il est affiché.
 */
const SOURCE = readFileSync(
  resolve(__dirname, '../../components/RadiosView.svelte'),
  'utf-8',
);

/** Le corps d'une fonction `async function <nom>() { … }`, accolades appariées. */
function corpsDeFonction(source: string, nom: string): string {
  const debut = source.indexOf(`async function ${nom}(`);
  expect(debut, `fonction ${nom} introuvable`).toBeGreaterThan(-1);
  const ouvrante = source.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}') {
      profondeur--;
      if (profondeur === 0) return source.slice(ouvrante, i + 1);
    }
  }
  throw new Error(`accolade fermante introuvable pour ${nom}`);
}

describe('RadiosView — le refus du serveur est montré, pas avalé', () => {
  it.each([
    ['addRadio', 'addError'],
    ['saveEdit', 'editError'],
  ])('%s alimente %s dans son catch', (fonction, variable) => {
    const corps = corpsDeFonction(SOURCE, fonction);
    const catchDebut = corps.indexOf('catch');
    expect(catchDebut, `${fonction} n'a pas de catch`).toBeGreaterThan(-1);
    const branche = corps.slice(catchDebut);
    expect(
      branche,
      `${fonction} avale encore le refus : son catch n'écrit pas ${variable}`,
    ).toContain(`${variable} =`);
  });

  it.each(['addError', 'editError'])('%s est un état affiché dans le gabarit', (variable) => {
    expect(SOURCE).toContain(`let ${variable} = $state('')`);
    // Rendu conditionnel du message, avec le rôle d'accessibilité qui le fait
    // annoncer par un lecteur d'écran au moment où il apparaît.
    const bloc = new RegExp(
      `\\{#if ${variable}\\}[\\s\\S]{0,200}?role="alert"[\\s\\S]{0,200}?\\{${variable}\\}`,
    );
    expect(bloc.test(SOURCE), `${variable} n'est affiché nulle part`).toBe(true);
  });

  it('les deux zones de message sont remises à zéro avant chaque tentative', () => {
    expect(corpsDeFonction(SOURCE, 'addRadio')).toContain("addError = ''");
    expect(corpsDeFonction(SOURCE, 'saveEdit')).toContain("editError = ''");
  });

  it('le message affiché est celui du serveur, pas un texte fabriqué ici', () => {
    // Le serveur compose un message qui NOMME le défaut (« après « http » il
    // faut deux-points »), déjà traduit via Accept-Language. Le réécrire côté
    // client le rendrait moins précis et le ferait dériver.
    const aide = SOURCE.slice(SOURCE.indexOf('function messageDErreur'));
    expect(aide).toContain('e instanceof Error');
    expect(aide).toContain('e.message');
  });
});
