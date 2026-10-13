/**
 * web#2166 (suite de web#1715) — le texte de la page Étiquettes VIDE.
 *
 * Depuis web#2156, la page porte son propre champ « Créer ». Le texte de la
 * page vide disait encore seulement « posez-en une depuis la pochette » : il
 * taisait le moyen le plus direct, qui est juste au-dessus de lui.
 *
 * Garde par le contenu, dans les onze langues : le texte nomme le bouton
 * « Créer » TEL QU'IL EST LIBELLÉ dans la même langue (`v2.tags.create`), et
 * garde la pochette, l'autre chemin.
 */
import { describe, expect, it } from 'vitest';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

/** Le mot de la pochette dans chaque langue, tel que l'ancien texte le portait. */
const POCHETTE: Record<string, string> = {
  de: 'Cover', en: 'cover', es: 'portada', fr: 'pochette', hu: 'borító', it: 'copertina',
  ja: 'ジャケット', ko: '커버', ro: 'coperta', sv: 'omslaget', zh: '封面',
};

describe('web#2166 — la page Étiquettes vide mentionne le champ « Créer »', () => {
  for (const langue of ONZE_LANGUES) {
    it(langue, () => {
      const d = dictionnaire(langue);
      const vide = d['v2.tags.emptyHint'];
      const creer = d['v2.tags.create'];
      expect(vide, `${langue} : v2.tags.emptyHint absent`).toBeTruthy();
      expect(creer, `${langue} : v2.tags.create absent`).toBeTruthy();
      expect(vide.includes(creer), `${langue} : le texte vide ne nomme pas « ${creer} » : ${vide}`).toBe(true);
      expect(vide.includes(POCHETTE[langue]), `${langue} : le chemin par la pochette a disparu : ${vide}`).toBe(true);
    });
  }
});
