import { describe, expect, it } from 'vitest';
import fr from '../locales/fr';

// Ne vérifier que les textes : les clés et les paramètres ICU peuvent
// légitimement s'appeler « reseau », « creer » ou « deja ».
const sansAccents = /(?<![\p{L}\p{N}_])(?:creer|cree(?:e?s?)?|desactiv(?:e|ee|es|ees)|reseaux?|deja|etre|parametres?|selectionn(?:e|ee|es|ees)|telecharg(?:e|ee|es|ees)|reglages?|repondez|personnalise(?:e?s?)?|recuperant|donnees|montees|conservees|geres|decouvert(?:e?s?)|degagees|deplacez|piece|mise a jour|importee|succes|resolution|hote|detecte|creation|creee|deconnecte)(?![\p{L}\p{N}_])/giu;
const motsFautifs = (texte: string) => [...texte.replace(/\{[^{}]*\}/g, '').matchAll(sansAccents)].map(m => m[0]);

describe('français affiché (#2975)', () => {
  it('ne réintroduit pas les mots courants privés de leurs accents', () => {
    const erreurs = Object.entries(fr).flatMap(([cle, valeur]) =>
      motsFautifs(valeur).map(mot => `${cle} : ${mot}`));
    expect(erreurs, 'Mots français sans accents dans les valeurs affichées').toEqual([]);
  });
  it('distingue les paramètres des mots affichés et respecte les frontières Unicode', () => {
    expect(motsFautifs('{deja} déjà présentes, réseau, sélectionné')).toEqual([]);
    expect(motsFautifs('Creer une zone sur le reseau')).toEqual(['Creer', 'reseau']);
  });
});
