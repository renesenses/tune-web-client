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

describe('plus aucun écran v2 ne fige la langue des dates', () => {
  it('aucun toLocale*String(\'fr-FR\') dans src/components/v2', () => {
    const dossier = join(process.cwd(), 'src/components/v2');
    const fautifs: string[] = [];
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.svelte'))) {
      const src = readFileSync(join(dossier, f), 'utf8');
      // On vise le CODE DE LANGUE fige, quel qu'il soit : 'fr-FR' comme
      // 'en-US'. Passer de l'un a l'autre ne corrigerait rien.
      for (const m of src.matchAll(/toLocale\w*String\(\s*['"]([a-z]{2}-[A-Z]{2})['"]/g)) {
        fautifs.push(`${f} → ${m[1]}`);
      }
    }
    expect(fautifs, 'ces dates ignoreront la langue choisie').toEqual([]);
  });
});
