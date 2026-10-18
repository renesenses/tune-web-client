/**
 * web#1715 — l'écran Étiquettes vide doit nommer AUSSI le champ de création.
 *
 * Depuis web#2156, la page porte un champ « Nouvelle étiquette… » et un bouton
 * « Créer », visibles même quand la liste est vide. Le texte d'écran vide
 * (`v2.tags.emptyHint`) ne parlait que de la pochette : il envoyait le lecteur
 * ailleurs alors que le geste était sous ses yeux.
 *
 * Garde : dans chacune des onze langues, le texte vide cite le libellé exact
 * du bouton (`v2.tags.create`) et parle encore de la pochette (le second
 * chemin reste vrai).
 */
import { describe, expect, it } from 'vitest';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

// Le mot « pochette » dans chaque langue, tel que le texte d'origine l'employait.
const POCHETTE: Record<string, string> = {
  fr: 'pochette', en: 'cover', de: 'Cover', es: 'portada', hu: 'borító',
  it: 'copertina', ja: 'ジャケット', ko: '커버', ro: 'coperta', sv: 'omslaget', zh: '封面',
  vi: 'ảnh bìa',
};

describe('web#1715 — texte de la page Étiquettes vide', () => {
  for (const code of ONZE_LANGUES) {
    it(`${code} : cite le bouton « ${dictionnaire(code)['v2.tags.create']} » et la pochette`, () => {
      const d = dictionnaire(code);
      const vide = d['v2.tags.emptyHint'];
      const bouton = d['v2.tags.create'];
      expect(bouton, `v2.tags.create manque en ${code}`).toBeTruthy();
      expect(vide, `le texte vide ne nomme pas le bouton « ${bouton} » en ${code}`).toContain(bouton);
      expect(vide, `le texte vide ne parle plus de la pochette en ${code}`).toContain(POCHETTE[code]);
    });
  }
});
