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
