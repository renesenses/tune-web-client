/**
 * Composition d'une phrase traduite portant une emphase (`i18nEmphase`).
 *
 * Ce qui compte ici n'est pas le cas nominal — il est évident — mais les cas
 * dégradés. Un fichier de langue est relu par un humain, parfois par un
 * contributeur : une astérisque saute, une paire se vide. Le découpage ne doit
 * JAMAIS répondre en avalant du texte, parce que la perte serait silencieuse et
 * qu'aucune porte ne la verrait.
 */
import { describe, it, expect } from 'vitest';
import { emphaseParts } from '../i18nEmphase';

/** Le texte rendu, tous morceaux confondus : rien ne doit disparaître. */
const recompose = (s: string) => emphaseParts(s).map((p) => p.texte).join('');

describe('emphaseParts', () => {
  it('découpe une phrase autour de son passage en emphase', () => {
    const p = emphaseParts('Retirer un dossier ne supprime *aucun fichier* : il sort.');
    expect(p).toEqual([
      { texte: 'Retirer un dossier ne supprime ', fort: false },
      { texte: 'aucun fichier', fort: true },
      { texte: ' : il sort.', fort: false },
    ]);
  });

  it('accepte plusieurs emphases, y compris deux collées', () => {
    const p = emphaseParts('Ne contient *aucun fichier* et *aucun mot de passe*.');
    expect(p.filter((x) => x.fort).map((x) => x.texte)).toEqual([
      'aucun fichier',
      'aucun mot de passe',
    ]);
  });

  it("place l'emphase EN TÊTE quand la traduction l'y met", () => {
    // Tout l'intérêt du procédé : le traducteur déplace l'emphase où sa langue
    // l'exige. Un découpage en trois clés figerait l'ordre français.
    const p = emphaseParts('*Kein einziges Musikstück* wird dabei entfernt.');
    expect(p[0]).toEqual({ texte: 'Kein einziges Musikstück', fort: true });
    expect(p[1].fort).toBe(false);
  });

  it('phrase sans emphase : un seul morceau, rien de perdu', () => {
    const s = 'Une passe rapide, chaque jour, à l’heure choisie.';
    expect(emphaseParts(s)).toEqual([{ texte: s, fort: false }]);
  });

  it('astérisque orpheline : rendue telle quelle, jamais avalée', () => {
    const s = 'Retirer un dossier ne supprime *aucun fichier de la bibliothèque.';
    expect(recompose(s)).toBe(s);
    expect(emphaseParts(s).some((p) => p.fort)).toBe(false);
  });

  it('paire vide : aucun morceau fort vide', () => {
    const p = emphaseParts('Avant ** après');
    expect(p.some((x) => x.fort)).toBe(false);
    expect(recompose('Avant ** après')).toBe('Avant  après');
  });

  it('chaîne vide : un morceau vide, jamais un tableau vide', () => {
    // L'appelant boucle dessus sans garde ; un tableau vide effacerait la ligne.
    expect(emphaseParts('')).toEqual([{ texte: '', fort: false }]);
  });

  it('aucun caractère ne se perd, sur un échantillon large', () => {
    for (const s of [
      'a*b*c',
      '*a*',
      'a*b',
      '**',
      'a**b',
      'Texte simple',
      '*a*b*c*',
      'Copiez-le *maintenant* : il ne sera *plus jamais* affiché.',
    ]) {
      // Référence : on retire les astérisques APPARIÉES, y compris une paire
      // vide (`.*?`, pas `.+?`) — c'est bien ce que fait le découpage. Une
      // astérisque seule, elle, reste dans le texte.
      const attendu = s.replace(/\*(.*?)\*/g, '$1');
      expect(recompose(s), `perte sur « ${s} »`).toBe(attendu);
    }
  });
});
