/**
 * rc14 — quatre langues de plus : néerlandais (nl), chinois traditionnel
 * (zh-Hant), russe (ru) et ukrainien (uk). L'interface passe de 16 à 20.
 *
 * La parité des clés est tenue par `scripts/check-i18n.mjs` (langues
 * découvertes sur disque) ; la présence des formes CLDR par
 * `plurielsCldr8301.test.ts` (qui itère `ONZE_LANGUES`). Ce banc-ci garde ce
 * que ces deux-là ne voient pas : la détection du navigateur (`zh-TW` et
 * `zh-HK` vers le traditionnel), les noms du sélecteur, la dictée, le
 * séparateur décimal, les pluriels slaves, et que l'ukrainien n'est pas du
 * russe ni le traditionnel du simplifié.
 *
 * Contre-épreuve : ramener `langueDuNavigateur` à la seule base fait tomber
 * « zh-TW → zh-Hant » ; retirer `'ru'` de `localiserDecimale` fait tomber
 * « 44,1 kHz » ; recopier ru.ts dans uk.ts fait tomber les deux derniers cas
 * slaves.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { langueDuNavigateur } from '../langueParDefaut';
import { localeNames, locale, tn } from '../i18n';
import { categoriesExigees } from '../pluriel';
import { localiserDecimale } from '../libellesFrequence';
import { langueDictee } from '../commandeVocale';
import { dictionnaire } from './onzeDictionnaires';

afterEach(() => locale.set('fr'));

describe('détection du navigateur', () => {
  it.each([
    [['nl-NL'], 'nl'], [['nl-BE', 'fr'], 'nl'], [['ru-RU'], 'ru'], [['uk-UA', 'ru'], 'uk'],
    [['zh-TW'], 'zh-Hant'], [['zh-HK'], 'zh-Hant'], [['zh-MO'], 'zh-Hant'], [['zh-Hant'], 'zh-Hant'],
    [['zh-Hant-CN'], 'zh-Hant'],
    [['zh-CN'], 'zh'], [['zh-SG'], 'zh'], [['zh-Hans-HK'], 'zh'], [['zh'], 'zh'],
  ] as [string[], string][])('%j → %s', (languages, attendu) => {
    expect(langueDuNavigateur({ languages, language: languages[0] })).toBe(attendu);
  });
});

describe('sélecteur, dictée, décimales', () => {
  it('le nom natif de chaque langue', () => {
    expect(localeNames.nl).toBe('Nederlands');
    expect(localeNames['zh-Hant']).toBe('繁體中文');
    expect(localeNames.ru).toBe('Русский');
    expect(localeNames.uk).toBe('Українська');
    // Deux chinois dans la liste : le simplifié se nomme comme tel.
    expect(localeNames.zh).toBe('简体中文');
    expect(Object.keys(localeNames)).toHaveLength(20);
  });
  it('la dictée suit la langue', () => {
    expect(langueDictee('nl')).toBe('nl-NL');
    expect(langueDictee('zh-Hant')).toBe('zh-TW');
    expect(langueDictee('ru')).toBe('ru-RU');
    expect(langueDictee('uk')).toBe('uk-UA');
  });
  it('virgule en nl, ru, uk ; point en chinois traditionnel', () => {
    for (const l of ['nl', 'ru', 'uk']) expect(localiserDecimale('44.1 kHz', l)).toBe('44,1 kHz');
    expect(localiserDecimale('44.1 kHz', 'zh-Hant')).toBe('44.1 kHz');
  });
});

describe('pluriels', () => {
  it('CLDR : one/few/many/other en russe et en ukrainien', () => {
    expect(categoriesExigees('ru')).toEqual(['one', 'few', 'many', 'other']);
    expect(categoriesExigees('uk')).toEqual(['one', 'few', 'many', 'other']);
    expect(categoriesExigees('nl')).toEqual(['one', 'other']);
    expect(categoriesExigees('zh-Hant')).toEqual(['other']);
  });
  it('russe : 1 трек, 3 трека, 5 треков, 21 трек', () => {
    locale.set('ru');
    const n = get(tn);
    expect(n('v2.common.trackCountN', 1)).toBe('1 трек');
    expect(n('v2.common.trackCountN', 3)).toBe('3 трека');
    expect(n('v2.common.trackCountN', 5)).toBe('5 треков');
    expect(n('v2.common.trackCountN', 21)).toBe('21 трек');
  });
  it('ukrainien : 1 трек, 3 треки, 5 треків', () => {
    locale.set('uk');
    const n = get(tn);
    expect(n('v2.common.trackCountN', 1)).toBe('1 трек');
    expect(n('v2.common.trackCountN', 3)).toBe('3 треки');
    expect(n('v2.common.trackCountN', 5)).toBe('5 треків');
  });
});

describe('quatre langues distinctes', () => {
  it("l'ukrainien n'est pas du russe : aucune lettre propre au russe, et presque aucun texte commun", () => {
    const uk = dictionnaire('uk');
    const ru = dictionnaire('ru');
    expect(Object.entries(uk).filter(([, v]) => /[ыэъё]/u.test(v)).map(([k]) => k)).toEqual([]);
    expect(Object.entries(ru).filter(([, v]) => /[іїєґ]/u.test(v)).map(([k]) => k)).toEqual([]);
    const longues = Object.keys(uk).filter((k) => uk[k].length > 25 && /\p{Script=Cyrillic}/u.test(uk[k]));
    const communes = longues.filter((k) => uk[k] === ru[k]);
    expect(communes.length / longues.length).toBeLessThan(0.01);
  });
  it("le chinois traditionnel n'emploie aucun caractère simplifié courant", () => {
    const SIMPLIFIES = /[这为们个时说发设网络选择软档务显开关载删编辑转换乐专页无将从处与应让认证览线连储数声频输备动态级号码]/u;
    const fautes = Object.entries(dictionnaire('zh-Hant')).filter(([, v]) => SIMPLIFIES.test(v)).map(([k]) => k);
    expect(fautes).toEqual([]);
    const zh = dictionnaire('zh');
    const zht = dictionnaire('zh-Hant');
    expect(zht['settings.tabAccess']).toBe('存取與權杖');
    expect(zht['settings.tabAccess']).not.toBe(zh['settings.tabAccess']);
  });
  it('aucun texte laissé en anglais au-delà des noms propres et des sigles', () => {
    const en = dictionnaire('en');
    for (const l of ['nl', 'zh-Hant', 'ru', 'uk']) {
      const d = dictionnaire(l);
      // Les longues phrases : un nom propre ou un sigle n'en fait jamais 40 caractères.
      // Exceptions : un pluriel ICU qui s'écrit pareil (« # album » en nl) et
      // l'exemple de syntaxe de requête, qui se tape tel quel.
      const identiques = Object.keys(en).filter((k) => en[k].length > 40 && d[k] === en[k]
        && !en[k].includes('plural,') && k !== 'requeteAvancee.placeholder');
      expect(identiques, l).toEqual([]);
    }
  });
});
