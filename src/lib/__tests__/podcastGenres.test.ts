import { describe, it, expect } from 'vitest';

import { PODCAST_GENRES, PODCAST_HEADING_KEYS } from '../podcast-genres';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

/**
 * Les categories de podcasts etaient ecrites en dur dans le composant, en
 * francais SANS accents (« Actualites », « Societe », « Comedie »). Une
 * interface en anglais affichait donc des categories francaises, mal
 * orthographiees ; et les titres annoncaient « Tendances France » au-dessus de
 * podcasts americains quand le selecteur de pays etait sur USA.
 * (Signale par Bertrand, 10 aout 2026.)
 *
 * Aucun garde-fou ne pouvait le voir : `check-i18n.mjs` ne lit que le texte du
 * balisage et les attributs, jamais les litteraux d'un tableau JavaScript — et
 * son detecteur de francais cherche les accents, precisement ce que ces
 * chaines n'avaient pas.
 */

// Les dictionnaires sont `as const` : leurs cles sont un type litteral, donc
// les indexer par une `string` quelconque est refuse. On les elargit ici, ce
// qui est precisement ce qu'un test veut faire — chercher une cle absente sans
// que le compilateur decrete d'avance qu'elle ne peut pas manquer.
type Dict = Record<string, string | undefined>;

const LOCALES: Record<string, Dict> = {
  fr,
  en,
  de,
  es,
  it: it_,
  ja,
  ko,
  ro,
  sv,
  zh,
};

const NAMES = Object.keys(LOCALES);

describe('categories de podcasts', () => {
  it('sont declarees par cle, jamais par libelle', () => {
    expect(PODCAST_GENRES.length).toBe(14);
    for (const genre of PODCAST_GENRES) {
      expect(genre.key).toMatch(/^podcasts\.genre\.[a-zA-Z]+$/);
    }
  });

  it('ont des identifiants iTunes distincts', () => {
    const ids = PODCAST_GENRES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(NAMES)('sont toutes traduites en %s', (name) => {
    const dict = LOCALES[name];
    const missing = PODCAST_GENRES.map((g) => g.key).filter((k) => !dict[k]);
    expect(missing).toEqual([]);
  });

  it.each(NAMES)('ont des titres de palmares en %s', (name) => {
    const dict = LOCALES[name];
    const missing = Object.values(PODCAST_HEADING_KEYS).filter((k) => !dict[k]);
    expect(missing).toEqual([]);
  });

  it.each(NAMES)('gardent le pays interpolable en %s', (name) => {
    const dict = LOCALES[name];
    // Une traduction qui perd son marqueur figerait de nouveau le titre — le
    // defaut d'origine, reintroduit par la traduction elle-meme.
    expect(dict[PODCAST_HEADING_KEYS.trendingIn]).toContain('{country}');
    expect(dict[PODCAST_HEADING_KEYS.topIn]).toContain('{country}');
    expect(dict[PODCAST_HEADING_KEYS.topGenre]).toContain('{genre}');
  });

  it('ne laisse aucun libelle francais non accentue cote francais', () => {
    // C'est l'orthographe sans accents qui rendait le defaut invisible aux
    // deux garde-fous. On refuse nommement les formes fautives.
    const fautes = ['Actualites', 'Societe', 'Comedie', 'Education'];
    const labels = PODCAST_GENRES.map((g) => (fr as Dict)[g.key]);
    for (const faute of fautes) {
      expect(labels).not.toContain(faute);
    }
    expect(labels).toContain('Actualités');
    expect(labels).toContain('Société');
    expect(labels).toContain('Comédie');
    expect(labels).toContain('Éducation');
  });
});
