#!/usr/bin/env node
/**
 * Fails when a Svelte component ships user-visible French text outside the
 * translation system.
 *
 * This defect has now shipped three times — ported twice already (#275, #276),
 * and reported again by Alex Campbell on 8 Aug 2026, who saw the Equalizer
 * wizard and the whole Oxygen settings block in French on an English UI. It
 * keeps coming back because nothing catches it: the string renders fine in
 * development, where the reviewer reads French anyway.
 *
 * The heuristic is deliberately narrow — visible text only (between tags, or in
 * a title/placeholder/aria-label/label attribute), and only unambiguous French
 * markers. It is meant to catch the careless case, not to police prose.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const VISIBLE = />([^<>{}]*[a-zà-ÿ][^<>{}]*)<|(?:title|placeholder|aria-label|label)="([^"{}]+)"/g;
const FRENCH = /(è|é\w|ê|à |ù|ç|œ|\b(?:le|la|les|des|une|un|du|dans|pour|avec|sans|sur|par|est|sont|vers|aucun|aucune)\b)/i;

function* svelteFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* svelteFiles(full);
    else if (name.endsWith('.svelte')) yield full;
  }
}

const offences = [];
for (const file of svelteFiles('src')) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<!--')) return;
    if (line.includes('$t(')) return;
    for (const m of line.matchAll(VISIBLE)) {
      const text = (m[1] ?? m[2] ?? '').trim();
      if (text.length < 4) continue;
      if (FRENCH.test(text)) offences.push(`${file}:${idx + 1}  ${text.slice(0, 90)}`);
    }
  });
}

if (offences.length > 0) {
  console.error(`\n${offences.length} user-visible French string(s) outside $t():\n`);
  for (const o of offences) console.error(`  ${o}`);
  console.error(`
Every visible string goes through the translation system. Add a key to
src/lib/locales/fr.ts and en.ts, then render it with {$t('your.key')}.
Missing keys fall back to French, so other locales lose nothing.
`);
  process.exit(1);
}
console.log('i18n check: no hardcoded French in visible text.');

/* -------------------------------------------------------------------------
 * Deuxième contrôle : une clé appelée doit exister.
 *
 * `t()` resout `dict[key] ?? fr[key] ?? key` : une clé absente de fr.ts n'est
 * pas rattrapée, elle s'affiche TELLE QUELLE. La fenêtre d'appairage AirPlay
 * a longtemps eu « airplay.pairTitle » pour titre, et l'écran des profils
 * affichait ses onze libellés en clair — 21 clés au total, invisibles parce
 * que le premier contrôle ne cherche que du français en dur, jamais l'inverse.
 *
 * fr.ts est la source : elle sert de repli à toutes les langues, donc une clé
 * qui y manque est cassée partout. en.ts est exigée aussi, sans quoi une
 * interface anglaise retombe en français sans prévenir.
 * ---------------------------------------------------------------------- */

const KEY_CALL = /\$?t\(\s*'([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+)'/g;

function localeKeys(locale) {
  const src = readFileSync(join('src', 'lib', 'locales', `${locale}.ts`), 'utf8');
  return new Set([...src.matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)].map((m) => m[1]));
}

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'locales' || name === '__tests__') continue;
      yield* sourceFiles(full);
    } else if (name.endsWith('.svelte') || name.endsWith('.ts')) yield full;
  }
}

const fr = localeKeys('fr');
const en = localeKeys('en');
const unknown = new Map();

for (const file of sourceFiles('src')) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(KEY_CALL)) {
      const key = m[1];
      const missing = [];
      if (!fr.has(key)) missing.push('fr');
      if (!en.has(key)) missing.push('en');
      if (missing.length > 0 && !unknown.has(key)) {
        unknown.set(key, `${file}:${idx + 1}  (absente de ${missing.join(', ')})`);
      }
    }
  });
}

if (unknown.size > 0) {
  console.error(`\n${unknown.size} clé(s) appelée(s) mais absente(s) des traductions :\n`);
  for (const [key, where] of [...unknown].sort()) console.error(`  ${key}\n      ${where}`);
  console.error(`
Une clé absente de fr.ts n'a AUCUN repli : elle s'affiche telle quelle à
l'écran. Ajoutez-la à src/lib/locales/fr.ts et en.ts.
`);
  process.exit(1);
}
console.log(`i18n check: ${fr.size} clés, aucune référence orpheline.`);

/* -------------------------------------------------------------------------
 * Troisième contrôle : parité des onze langues.
 *
 * Les huit langues non françaises ont longtemps stagné autour de 89 % — 282 à
 * 307 clés manquantes chacune. Ce défaut-là ne se voit pas : la clé absente
 * retombe silencieusement sur le français, si bien qu'un utilisateur allemand
 * lisait du français au milieu de son interface sans que rien ne le signale.
 *
 * Elles sont désormais à 100 %. Ce contrôle est ce qui les y garde : ajouter
 * une clé à fr.ts sans la traduire partout échoue ici, tout de suite, plutôt
 * que de se découvrir des mois plus tard sur une capture d'écran.
 * ---------------------------------------------------------------------- */

const LOCALES = ['en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];
const gaps = [];

for (const locale of LOCALES) {
  const keys = localeKeys(locale);
  const missing = [...fr].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !fr.has(k));
  if (missing.length > 0 || extra.length > 0) gaps.push({ locale, missing, extra });
}

if (gaps.length > 0) {
  console.error('\nLes traductions ont divergé du français :\n');
  for (const { locale, missing, extra } of gaps) {
    if (missing.length > 0) {
      console.error(`  ${locale} — ${missing.length} clé(s) manquante(s) :`);
      for (const k of missing.slice(0, 10)) console.error(`      ${k}`);
      if (missing.length > 10) console.error(`      … et ${missing.length - 10} autre(s)`);
    }
    if (extra.length > 0) {
      console.error(`  ${locale} — ${extra.length} clé(s) absente(s) de fr.ts (orpheline ?) :`);
      for (const k of extra.slice(0, 10)) console.error(`      ${k}`);
    }
  }
  console.error(`
fr.ts fait référence. Une clé qui y est doit être dans les dix autres —
sans quoi la langue concernée retombe sur le français, en silence.
`);
  process.exit(1);
}
console.log(`i18n check: ${LOCALES.length + 1} langues à 100 %, aucune dérive.`);
