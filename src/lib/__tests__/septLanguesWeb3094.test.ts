/**
 * web#3094 — sept langues de plus : russe, ukrainien, néerlandais, portugais
 * du Brésil, tchèque, finnois, thaï.
 *
 * La parité des clés est tenue par `scripts/check-i18n.mjs` (langues
 * découvertes sur disque) ; la présence des formes plurielles de CHAQUE langue
 * par `plurielsCldr8301.test.ts` (qui itère `ONZE_LANGUES`). Ce banc-ci garde
 * ce que ces deux-là ne voient pas : la détection du navigateur, les règles
 * plurielles slaves rendues pour de vrai, le séparateur décimal, la police
 * du cyrillique et du thaï, et l'anglais laissé en silence.
 *
 * Contre-épreuve : retirer `ru` de `CHARGEURS` fait tomber « ru-RU → ru » ;
 * retirer `:root:lang(th)` du thème fait tomber la police thaïe ; remettre la
 * liste figée de `localiserDecimale` fait tomber « 44,1 » en russe.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { langueDuNavigateur } from '../langueParDefaut';
import { localeNames, locale, tn } from '../i18n';
import { formaterPluriel, categoriesExigees } from '../pluriel';
import { localiserDecimale } from '../libellesFrequence';
import { langueDictee } from '../commandeVocale';
import { dictionnaire } from './onzeDictionnaires';

const SEPT = ['ru', 'uk', 'nl', 'pt', 'cs', 'fi', 'th'] as const;

afterEach(() => locale.set('fr'));

describe('détection du navigateur', () => {
  const cas: [string[], string][] = [
    [['ru-RU', 'ru'], 'ru'],
    [['uk-UA'], 'uk'],
    [['uk'], 'uk'],
    [['nl-NL'], 'nl'],
    [['nl-BE', 'fr-BE'], 'nl'],
    [['pt-BR', 'pt'], 'pt'],
    [['pt'], 'pt'],
    [['pt-PT'], 'pt'],
    [['cs-CZ'], 'cs'],
    [['fi-FI'], 'fi'],
    [['th-TH'], 'th'],
  ];
  it.each(cas)('%j → %s', (languages, attendu) => {
    expect(langueDuNavigateur({ languages, language: languages[0] })).toBe(attendu);
  });
  it('une langue non parlée retombe toujours sur l’anglais', () => {
    expect(langueDuNavigateur({ languages: ['tr-TR'], language: 'tr-TR' })).toBe('en');
  });
});

describe('sélecteur : chaque langue s’annonce dans sa propre langue', () => {
  it('localeNames', () => {
    expect(localeNames.ru).toBe('Русский');
    expect(localeNames.uk).toBe('Українська');
    expect(localeNames.nl).toBe('Nederlands');
    expect(localeNames.pt).toBe('Português (Brasil)');
    expect(localeNames.cs).toBe('Čeština');
    expect(localeNames.fi).toBe('Suomi');
    expect(localeNames.th).toBe('ไทย');
  });
  it('la dictée vocale suit (pt → pt-BR)', () => {
    expect(langueDictee('pt')).toBe('pt-BR');
    expect(langueDictee('uk')).toBe('uk-UA');
    expect(langueDictee('th')).toBe('th-TH');
  });
});

describe('pluriels slaves : one / few / many', () => {
  it('les catégories exigées', () => {
    expect(categoriesExigees('ru')).toEqual(['one', 'few', 'many', 'other']);
    expect(categoriesExigees('uk')).toEqual(['one', 'few', 'many', 'other']);
    // Le `many` tchèque ne vise que les fractions : il n'est pas exigé pour
    // les entiers, mais les dictionnaires le portent quand même.
    expect(categoriesExigees('cs')).toEqual(['one', 'few', 'other']);
    expect(categoriesExigees('th')).toEqual(['other']);
  });
  it('russe : 1, 2-4, 5-20, 21, 22, 111', () => {
    const m = '{n, plural, one {# трек} few {# трека} many {# треков} other {# трека}}';
    expect(formaterPluriel(m, 1, 'ru')).toBe('1 трек');
    expect(formaterPluriel(m, 3, 'ru')).toBe('3 трека');
    expect(formaterPluriel(m, 5, 'ru')).toBe('5 треков');
    expect(formaterPluriel(m, 11, 'ru')).toBe('11 треков');
    expect(formaterPluriel(m, 21, 'ru')).toBe('21 трек');
    expect(formaterPluriel(m, 22, 'ru')).toBe('22 трека');
    expect(formaterPluriel(m, 111, 'ru')).toBe('111 треков');
  });
  it('ukrainien : même découpage', () => {
    const m = '{n, plural, one {# трек} few {# треки} many {# треків} other {# треку}}';
    expect(formaterPluriel(m, 1, 'uk')).toBe('1 трек');
    expect(formaterPluriel(m, 4, 'uk')).toBe('4 треки');
    expect(formaterPluriel(m, 12, 'uk')).toBe('12 треків');
  });
  it('tchèque : 1 / 2-4 / 5+', () => {
    const m = '{n, plural, one {# skladba} few {# skladby} many {# skladby} other {# skladeb}}';
    expect(formaterPluriel(m, 1, 'cs')).toBe('1 skladba');
    expect(formaterPluriel(m, 3, 'cs')).toBe('3 skladby');
    expect(formaterPluriel(m, 5, 'cs')).toBe('5 skladeb');
    expect(formaterPluriel(m, 0, 'cs')).toBe('0 skladeb');
  });
  it('portugais du Brésil : 0 et 1 au singulier', () => {
    const m = '{n, plural, one {# faixa} other {# faixas}}';
    expect(formaterPluriel(m, 0, 'pt')).toBe('0 faixa');
    expect(formaterPluriel(m, 2, 'pt')).toBe('2 faixas');
  });
  it('$tn rend trois formes distinctes en russe, ukrainien et tchèque', () => {
    for (const l of ['ru', 'uk', 'cs'] as const) {
      locale.set(l);
      const un = get(tn)('v2.common.trackCountN', 1);
      const deux = get(tn)('v2.common.trackCountN', 2);
      const cinq = get(tn)('v2.common.trackCountN', 5);
      expect(un.startsWith('1'), `${l} : ${un}`).toBe(true);
      expect(new Set([un.replace(/\d+/, ''), deux.replace(/\d+/, ''), cinq.replace(/\d+/, '')]).size, `${l} : ${un} / ${deux} / ${cinq}`).toBe(3);
    }
  });
});

describe('nombres : le séparateur décimal vient d’Intl', () => {
  it.each([['ru', '44,1 kHz'], ['uk', '44,1 kHz'], ['nl', '44,1 kHz'], ['pt', '44,1 kHz'], ['cs', '44,1 kHz'], ['fi', '44,1 kHz'], ['th', '44.1 kHz'], ['en', '44.1 kHz'], ['fr', '44,1 kHz'], ['ja', '44.1 kHz']])('%s', (l, attendu) => {
    expect(localiserDecimale('44.1 kHz', l)).toBe(attendu);
  });
});

describe('polices : le cyrillique et le thaï ont leurs glyphes', () => {
  const theme = readFileSync(resolve(process.cwd(), 'src/styles/tune-theme.css'), 'utf8');
  const index = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  it('ru et uk basculent sur Inter (Lato n’a pas de cyrillique)', () => {
    const bloc = theme.match(/((?::root:lang\(\w+\),?\s*)+)\{[^}]*--font-body:\s*'Inter'/);
    expect(bloc?.[1]).toContain(':root:lang(ru)');
    expect(bloc?.[1]).toContain(':root:lang(uk)');
  });
  it('le thaï a Noto Sans Thai dans chaque pile, et la feuille Google Fonts la déclare', () => {
    const th = theme.match(/:root:lang\(th\)\s*\{([^}]*)\}/)?.[1] ?? '';
    for (const v of ['--font-display', '--font-body', '--font-label', '--font-primary']) {
      expect(th, v).toMatch(new RegExp(`${v}:[^;]*'Noto Sans Thai'`));
    }
    expect(index).toMatch(/fonts\.googleapis\.com\/css2\?[^"]*family=Noto\+Sans\+Thai/);
  });
  it('aucun word-break: keep-all n’empêche le découpage du thaï', () => {
    const fautes: string[] = [];
    const parcourir = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) { if (n !== '__tests__') parcourir(p); continue; }
        if (!/\.(css|svelte)$/.test(n)) continue;
        if (/word-break\s*:\s*keep-all/.test(readFileSync(p, 'utf8'))) fautes.push(p);
      }
    };
    parcourir(resolve(process.cwd(), 'src'));
    expect(fautes).toEqual([]);
  });
});

describe('rien en anglais en silence', () => {
  // Une chaîne identique à l'anglais est légitime pour une marque, un sigle
  // ou un terme technique (« FLAC », « Qobuz », « DSD ») — pas au-delà. Le
  // néerlandais partage en plus beaucoup de mots courts avec l'anglais
  // (Album, Genre, Label, Radio, Status) : mesuré à 4,5 % le 16/11, plafond 6 %.
  // Mesures du 16/11 : ru 0,7 %, uk 0,7 %, pt 2,1 %, cs 1,8 %, fi 1,2 %.
  const en = dictionnaire('en');
  const PLAFOND: Record<string, number> = { nl: 0.06 };
  it.each(SEPT)('%s : peu de chaînes identiques à l’anglais', (l) => {
    const d = dictionnaire(l);
    const avecMots = Object.keys(en).filter((k) => /[A-Za-z]{4,}/.test(en[k].replace(/\{[^{}]*\}/g, '')));
    const pareilles = avecMots.filter((k) => d[k] === en[k]);
    expect(pareilles.length / avecMots.length, pareilles.slice(0, 20).join(', ')).toBeLessThan(PLAFOND[l] ?? 0.04);
  });
  it.each(['ru', 'uk', 'th'] as const)('%s : l’écriture de la langue est partout où l’anglais fait une phrase', (l) => {
    const d = dictionnaire(l);
    const ecriture = l === 'th' ? /[฀-๿]/ : /[Ѐ-ӿ]/;
    const phrases = Object.keys(en).filter((k) => (en[k].replace(/\{[^{}]*\}/g, '').match(/\b[a-z]{3,}\b/g) ?? []).length >= 3);
    const sans = phrases.filter((k) => !ecriture.test(d[k]));
    expect(sans.length / phrases.length, sans.slice(0, 20).join(', ')).toBeLessThan(0.01);
  });
});
