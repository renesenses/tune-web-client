/**
 * Les dates suivent la LANGUE, et aucun écran v2 ne fige plus « fr-FR ».
 *
 * Six sites appelaient `toLocaleDateString('fr-FR', …)` en dur : un
 * utilisateur en anglais lisait « 3 sept. 2026 » au milieu d'une interface
 * anglaise. `check-i18n.mjs` ne peut pas l'attraper — il cherche du texte
 * français littéral, or la chaîne fautive est un code de langue.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { locale } from '../i18n';
import { dateCourte, dateEtHeure, heureSeule, dateSimple } from '../dates';

afterEach(() => locale.set('fr'));

describe('les formateurs suivent la langue', () => {
  it('la même date se lit différemment en fr et en en', () => {
    const iso = '2026-09-03T21:59:50Z';
    locale.set('fr');
    const fr = get(dateCourte)(iso);
    locale.set('en');
    const en = get(dateCourte)(iso);
    expect(fr).not.toBe('');
    expect(en).not.toBe('');
    expect(fr).not.toBe(en);
  });

  it('accepte une chaîne, un nombre ou une Date', () => {
    const t = Date.UTC(2026, 8, 3, 12, 0, 0);
    locale.set('fr');
    expect(get(dateCourte)(t)).toBe(get(dateCourte)(new Date(t)));
    expect(get(dateCourte)(new Date(t).toISOString())).toBe(get(dateCourte)(t));
  });

  it('rend une chaîne vide plutôt qu’« Invalid Date »', () => {
    // Un episode sans date publiait « Invalid Date » a l'ecran.
    for (const f of [dateCourte, dateEtHeure, heureSeule, dateSimple]) {
      expect(get(f)(null)).toBe('');
      expect(get(f)(undefined)).toBe('');
      expect(get(f)('')).toBe('');
      expect(get(f)('pas une date')).toBe('');
    }
  });
});

/** Retire commentaires de bloc et de ligne : une doc qui CITE le defaut ne
 *  doit pas passer pour le defaut. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Tous les `.svelte` et `.ts` sous une racine, sauf les tests. */
function fichiers(racine: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(racine, { withFileTypes: true })) {
    const p = join(racine, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') out.push(...fichiers(p)); }
    else if (/\.(svelte|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('plus aucun écran ne fige la langue des dates ni des nombres', () => {
  /*
   * Périmètre élargi le 04/09/2026 : il ne couvrait que `src/components/v2`.
   * Or `formatNumber` et `formatAlbumYear` figeaient `fr-FR` dans
   * `src/lib/utils.ts`, hors de portée — 50 et 12 appelants respectivement.
   * Une garde qui ne regarde qu'un dossier laisse le défaut vivre à côté.
   *
   * `AiChat.svelte` est la seule exception, et elle est légitime : il y tient
   * une TABLE de correspondance langue → BCP-47 (`fr: 'fr-FR', en: 'en-US'…`),
   * qui est justement le contraire d'un code figé.
   */
  const EXCEPTIONS = ['AiChat.svelte'];

  it('aucun code de langue figé dans src/components ni src/lib', () => {
    const fautifs: string[] = [];
    for (const racine of ['src/components', 'src/lib']) {
      for (const f of fichiers(join(process.cwd(), racine))) {
        if (EXCEPTIONS.some((e) => f.endsWith(e))) continue;
        const src = sansCommentaires(readFileSync(f, 'utf8'));
        // On vise le CODE DE LANGUE figé, quel qu'il soit : 'fr-FR' comme
        // 'en-US'. Passer de l'un à l'autre ne corrigerait rien.
        for (const m of src.matchAll(/toLocale\w*String\(\s*['"]([a-z]{2}-[A-Z]{2})['"]/g)) {
          fautifs.push(`${f.slice(f.indexOf('src/'))} → ${m[1]}`);
        }
      }
    }
    expect(fautifs, 'ces valeurs ignoreront la langue choisie').toEqual([]);
  });

  it('le balayage voit bien des fichiers (sinon il ne garde rien)', () => {
    expect(fichiers(join(process.cwd(), 'src/components')).length).toBeGreaterThan(50);
    expect(fichiers(join(process.cwd(), 'src/lib')).length).toBeGreaterThan(10);
  });

  it('utils.ts n’expose plus de formateur figé', () => {
    // Les laisser en place, même inutilisés, inviterait à les réutiliser.
    const utils = readFileSync(join(process.cwd(), 'src/lib/utils.ts'), 'utf8');
    expect(utils.includes('export function formatNumber'), 'formatNumber est revenu').toBe(false);
    expect(utils.includes('export function formatAlbumYear'), 'formatAlbumYear est revenu').toBe(false);
  });
});
