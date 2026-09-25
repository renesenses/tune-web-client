// tune-server-rust#4800, cause 4 — LA LANGUE ACTIVE SE CHARGE À LA DEMANDE.
//
// `locales/index.ts` ré-exportait les onze dictionnaires en statique : 2,5 Mo
// de source dans un bundle principal de 4,1 Mo, chargé d'un bloc avant le
// premier rendu, pour UNE langue lue. Chaque langue est désormais un `import()`
// — un chunk Vite par langue — et `main.ts` attend celui de la langue
// enregistrée, plus l'anglais (repli), avant de monter la coquille.
//
// Trois gardes de source, puis le chargeur lui-même sur un module VIERGE :
// `setupLocales.ts` enregistre les onze dictionnaires avant chaque banc, si
// bien que l'instance partagée de `i18n.ts` a toujours tout en mémoire.
// `vi.resetModules()` en donne une neuve, sans rien — c'est là que le chemin
// réel (clé nue → chunk → traduction) se vérifie.
//
// ⚠️ #1308 : aucun `import()` d'un chemin `locales/` dans ce banc. Le chunk
// est chargé par le code de production (`CHARGEURS` de `locales/index.ts`),
// jamais par le test.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const RACINE = resolve(__dirname, '../../..');
const lire = (p: string) => readFileSync(resolve(RACINE, p), 'utf8');

/** Le fichier sans ses commentaires : la doc cite les formes bannies. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const STATIQUE_VERS_UNE_LANGUE = /^\s*(?:import|export)\b[^;]*\bfrom\s+['"]\.\/[a-z]{2}['"]/m;

describe('#4800 cause 4 — la langue active se charge à la demande', () => {
  it('locales/index.ts n’importe aucun dictionnaire en statique : un import() par langue', () => {
    const corps = sansCommentaires(lire('src/lib/locales/index.ts'));
    expect(corps, 'un `export { default as xx } from "./xx"` remettrait les onze dans le bundle')
      .not.toMatch(STATIQUE_VERS_UNE_LANGUE);
    for (const l of ONZE_LANGUES) {
      expect(corps, `chargeur de ${l}`).toContain(`${l}: () => import('./${l}')`);
    }
  });

  it('le motif reconnaît la forme qui pesait 2,5 Mo', () => {
    expect(STATIQUE_VERS_UNE_LANGUE.test("export { default as fr } from './fr';")).toBe(true);
    expect(STATIQUE_VERS_UNE_LANGUE.test("import fr from './fr';")).toBe(true);
    expect(STATIQUE_VERS_UNE_LANGUE.test("  fr: () => import('./fr'),")).toBe(false);
  });

  it('i18n.ts ne tire aucun dictionnaire en statique, seulement la table des chargeurs', () => {
    const corps = sansCommentaires(lire('src/lib/i18n.ts'));
    expect(corps).not.toMatch(/from\s+['"]\.\/locales\/[a-z]{2}['"]/);
    expect(corps).toMatch(/import \{ CHARGEURS, type Locale, type Dictionnaire \} from '\.\/locales';/);
  });

  it('main.ts attend la langue enregistrée et l’anglais AVANT de monter la coquille', () => {
    const corps = sansCommentaires(lire('src/main.ts'));
    const preparation = corps.indexOf('preparerLocale(');
    const montage = corps.indexOf('mount(ShellV2');
    // 🔴 `indexOf` rend -1 quand la forme est absente, et -1 < n passe : on
    // exige d'abord que les deux existent.
    expect(preparation).toBeGreaterThan(-1);
    expect(montage).toBeGreaterThan(-1);
    expect(preparation).toBeLessThan(montage);
  });

  it('un module vierge rend la clé nue, puis la traduction une fois le chunk arrivé', async () => {
    vi.resetModules();
    const i18n = await import('../i18n');
    expect(i18n.dictionnaireCharge('de')).toBe(false);
    expect(get(i18n.t)('nav.library')).toBe('nav.library');

    await i18n.preparerLocale('de');
    expect(i18n.dictionnaireCharge('de')).toBe(true);
    expect(i18n.dictionnaireCharge('en'), 'l’anglais, langue de repli, vient avec').toBe(true);
    expect(i18n.dictionnaireCharge('fr'), 'le français n’a pas été demandé').toBe(false);

    i18n.locale.set('de');
    expect(get(i18n.locale)).toBe('de');
    expect(get(i18n.t)('nav.library')).toBe(dictionnaire('de')['nav.library']);
    // une clé absente partout rend son nom, jamais une autre langue
    expect(get(i18n.t)('cle.inexistante.4800')).toBe('cle.inexistante.4800');
  }, 30_000);

  it('locale.set d’une langue absente charge son chunk PUIS bascule — jamais l’inverse', async () => {
    vi.resetModules();
    const i18n = await import('../i18n');
    i18n.enregistrerDictionnaire('en', dictionnaire('en'));
    i18n.locale.set('en');
    expect(get(i18n.t)('nav.library')).toBe(dictionnaire('en')['nav.library']);

    i18n.locale.set('it');
    // le temps du transfert, l'écran reste dans la langue qu'il avait
    expect(get(i18n.locale)).toBe('en');
    expect(get(i18n.t)('nav.library')).toBe(dictionnaire('en')['nav.library']);

    await vi.waitFor(() => expect(get(i18n.locale)).toBe('it'), { timeout: 20_000 });
    expect(get(i18n.t)('nav.library')).toBe(dictionnaire('it')['nav.library']);
  }, 30_000);

  it('deux demandes qui se croisent : la dernière gagne', async () => {
    vi.resetModules();
    const i18n = await import('../i18n');
    i18n.enregistrerDictionnaire('en', dictionnaire('en'));
    i18n.locale.set('ja');
    i18n.locale.set('ko');
    await vi.waitFor(() => expect(get(i18n.locale)).toBe('ko'), { timeout: 20_000 });
    await i18n.chargerLocale('ja');
    expect(get(i18n.locale), 'le japonais arrivé après ne détrône pas le coréen').toBe('ko');
    expect(get(i18n.t)('nav.library')).toBe(dictionnaire('ko')['nav.library']);
  }, 30_000);
});
