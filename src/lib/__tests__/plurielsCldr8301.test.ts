/**
 * Pluriels CLDR — discussion tune-server-rust#8301, issue web#2412.
 *
 * Contre-épreuve : sans `pluriel.ts` ni `$tn`, le polonais affichait
 * « Utwory: 5 » et « 5 aktywne strefy » (forme 2-4 pour 5), l'anglais
 * « 0 track », le français « 0 titres » là où le code testait `n === 1`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { formaterPluriel, blocsPluriels, categoriesExigees } from '../pluriel';
import { tn, locale } from '../i18n';
import { libelleNbTitres } from '../nbTitresPlaylist';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

afterEach(() => locale.set('fr'));

describe('formaterPluriel', () => {
  const pl = '{n, plural, one {# utwór} few {# utwory} many {# utworów} other {# utworu}}';
  it('choisit la catégorie CLDR du polonais : 1 / 2-4 / 5+ / 22', () => {
    expect(formaterPluriel(pl, 1, 'pl')).toBe('1 utwór');
    expect(formaterPluriel(pl, 3, 'pl')).toBe('3 utwory');
    expect(formaterPluriel(pl, 5, 'pl')).toBe('5 utworów');
    expect(formaterPluriel(pl, 12, 'pl')).toBe('12 utworów');
    expect(formaterPluriel(pl, 22, 'pl')).toBe('22 utwory');
    expect(formaterPluriel(pl, 0, 'pl')).toBe('0 utworów');
  });
  it('roumain : « de » à partir de 20', () => {
    const ro = '{n, plural, one {# piesă} few {# piese} other {# de piese}}';
    expect(formaterPluriel(ro, 1, 'ro')).toBe('1 piesă');
    expect(formaterPluriel(ro, 7, 'ro')).toBe('7 piese');
    expect(formaterPluriel(ro, 20, 'ro')).toBe('20 de piese');
  });
  it('zéro : singulier en français, pluriel en anglais', () => {
    expect(formaterPluriel('{n, plural, one {# titre} other {# titres}}', 0, 'fr')).toBe('0 titre');
    expect(formaterPluriel('{n, plural, one {# track} other {# tracks}}', 0, 'en')).toBe('0 tracks');
  });
  it('=0 exact, texte autour du bloc, message sans bloc rendu tel quel', () => {
    expect(formaterPluriel('{n, plural, =0 {aucun} one {# x} other {# xs}} ici', 0, 'fr')).toBe('aucun ici');
    expect(formaterPluriel('Utwory: {n}', 5, 'pl')).toBe('Utwory: {n}');
  });
  it('refuse un bloc sans « other » ou à catégorie inconnue', () => {
    expect(() => blocsPluriels('{n, plural, one {# x}}')).toThrow();
    expect(() => blocsPluriels('{n, plural, plusieurs {# x} other {# y}}')).toThrow();
  });
});

describe('$tn', () => {
  it('rend la vraie phrase dans la langue active', () => {
    locale.set('pl');
    expect(get(tn)('v2.common.trackCountN', 5)).toBe('5 utworów');
    expect(get(tn)('multiroom.zonesActiveN', 5)).toBe('5 aktywnych stref');
    expect(get(tn)('genreTree.subGenresN', 5)).toBe('5 podgatunków');
    locale.set('en');
    expect(get(tn)('v2.common.trackCountN', 0)).toBe('0 tracks');
    locale.set('fr');
    expect(get(tn)('v2.common.trackCountN', 12)).toBe('12 titres');
    expect(libelleNbTitres(1, get(tn))).toBe('1 titre');
  });
});

describe('garde : chaque clé plurielle a toutes les formes de SA langue', () => {
  for (const l of ONZE_LANGUES) {
    it(l, () => {
      const exigees = categoriesExigees(l);
      const fautes: string[] = [];
      for (const [cle, valeur] of Object.entries(dictionnaire(l))) {
        if (!/\{\s*\w+\s*,\s*plural\s*,/.test(valeur)) continue;
        try {
          for (const b of blocsPluriels(valeur)) {
            const manque = exigees.filter((c) => !b.formes.has(c));
            if (manque.length) fautes.push(`${cle} : ${manque.join(', ')}`);
          }
        } catch (e) {
          fautes.push(`${cle} : ${(e as Error).message}`);
        }
      }
      expect(fautes).toEqual([]);
    });
  }
  it('le polonais exige bien one, few, many, other', () => {
    expect(categoriesExigees('pl')).toEqual(['one', 'few', 'many', 'other']);
  });
});

// Suite #2932 : une grille rend souvent le même compteur pour des nombres
// différents. Le cache porte les règles et le message, jamais le résultat.
describe('cache des pluriels', () => {
  it('réutilise les objets Intl par langue et analyse chaque message une seule fois', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    const { formaterPluriel: rendre } = await import('../pluriel');
    const Regles = Intl.PluralRules;
    const Nombre = Intl.NumberFormat;
    const regles = vi.spyOn(Intl, 'PluralRules').mockImplementation(function (lang, options) {
      return new Regles(lang, options);
    });
    const nombres = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (lang, options) {
      return new Nombre(lang, options);
    });
    const exec = RegExp.prototype.exec;
    let analyses = 0;
    const espion = vi.spyOn(RegExp.prototype, 'exec').mockImplementation(function (this: RegExp, s: string) {
      if (this.source === String.raw`\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*plural\s*,` && this.lastIndex === 0) analyses++;
      return exec.call(this, s);
    });
    try {
      const message = '{n, plural, one {# album} few {# albumy} many {# albumów} other {# albums}}';
      expect(rendre(message, 1, 'pl')).toBe('1 album');
      expect(rendre(message, 5, 'pl')).toBe('5 albumów');
      expect(rendre(message, 22, 'pl')).toBe('22 albumy');
      expect(rendre(message, 0, 'en')).toBe('0 albums');
      expect(rendre(message, 1, 'pl')).toBe('1 album');
      expect(analyses).toBe(1);
      expect(regles).toHaveBeenCalledTimes(2);
      expect(nombres).toHaveBeenCalledTimes(2);
      expect(rendre('{n, plural, one {# x} other {# xs}}', 3, 'en')).toBe('3 xs');
      expect(analyses).toBe(2);
      expect(regles).toHaveBeenCalledTimes(2);
      expect(nombres).toHaveBeenCalledTimes(2);
    } finally {
      espion.mockRestore(); regles.mockRestore(); nombres.mockRestore();
    }
  });
});

describe('compteurs migrés après #2932', () => {
  it('accorde les résultats en polonais et les albums en roumain', () => {
    locale.set('pl');
    expect(get(tn)('v2.ms.resultsN', 1)).toBe('1 wynik');
    expect(get(tn)('v2.ms.resultsN', 3)).toBe('3 wyniki');
    expect(get(tn)('v2.ms.resultsN', 5)).toBe('5 wyników');
    expect(get(tn)('v2.ms.resultsN', 22)).toBe('22 wyniki');
    locale.set('ro');
    expect(get(tn)('v2.lib.yearAlbumsN', 3)).toBe('3 albume');
    expect(get(tn)('v2.lib.yearAlbumsN', 20)).toBe('20 de albume');
    expect(get(tn)('v2.lib.yearAlbumsN', 101)).toBe('101 albume');
  });
  it('préserve les messages de sélection vide et les variables du message choisi', () => {
    locale.set('fr');
    expect(get(tn)('v2.selection.countN', 0)).toBe('Aucune piste sélectionnée');
    expect(get(tn)('v2.why.ownedArtistN', 3).replace('{artiste}', 'Bach')).toBe('Bach : 3 albums dans votre bibliothèque');
    locale.set('en');
    expect(get(tn)('settings.macRangesCountN', 0)).toBe('0 ranges');
  });
});
