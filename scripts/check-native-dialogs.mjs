#!/usr/bin/env node
// Interdit window.confirm / window.prompt / window.alert dans le client web.
//
// Dans les webviews (weblet iOS/macOS, apps embarquées) la boîte native ne
// s'ouvre pas et le clic ne produit RIEN — pas de message, pas d'erreur
// console. L'utilisateur conclut que le bouton est mort (#166). Le chantier
// #424 a converti les 49 appels du dépôt vers le socle `dialogs` ; ce
// garde-fou empêche qu'un seul revienne par habitude.
//
// Remplacements : `await dialogs.confirm(msg, { danger })` et
// `await dialogs.prompt(msg, valeurParDefaut)` (src/lib/stores/dialogs.ts) ;
// pour un simple message, le bus `notifications`.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = 'src';
const EXTS = ['.svelte', '.ts', '.js'];

// Le socle lui-même DÉFINIT des méthodes nommées `confirm` et `prompt` — c'est
// le remplacement, pas l'interdit. Une regex ne distingue pas une définition de
// méthode d'un appel nu ; exclure ce fichier précis est plus franc que de
// complexifier le motif.
const ALLOWED = new Set(['src/lib/stores/dialogs.ts']);

// Un appel nu à confirm/prompt/alert. Le `[^.\w]` en tête écarte les appels de
// méthode (`foo.confirm(...)`, `dialogs.prompt(...)`) et les identifiants qui
// se terminent par le mot (`shouldConfirm(`).
const CALL = /(^|[^.\w])(window\s*\.\s*)?(confirm|prompt|alert)\s*\(/;

function sourceLines(text) {
  // Retire les commentaires de bloc, puis ignore les lignes de commentaire
  // simple : le garde-fou ne doit pas se déclencher sur une explication.
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlocks.split('\n').map((line) => {
    const i = line.indexOf('//');
    return i === -1 ? line : line.slice(0, i);
  });
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTS.some((e) => entry.endsWith(e))) yield full;
  }
}

const offenders = [];
for (const file of walk(ROOT)) {
  if (ALLOWED.has(relative('.', file).split('\\').join('/'))) continue;
  sourceLines(readFileSync(file, 'utf8')).forEach((line, i) => {
    const m = CALL.exec(line);
    if (m) offenders.push({ file: relative('.', file), line: i + 1, fn: m[3], text: line.trim() });
  });
}

if (offenders.length) {
  console.error(`\nDialogues natifs interdits — ${offenders.length} appel(s) :\n`);
  for (const o of offenders) console.error(`  ${o.file}:${o.line}  ${o.text}`);
  console.error(
    '\nCes boîtes ne s\'ouvrent pas dans les webviews : le clic ne produit rien,' +
      '\nni message ni erreur console (#166). Utiliser le socle dialogs :' +
      '\n  await dialogs.confirm(msg, { danger: true })' +
      '\n  await dialogs.prompt(msg, valeurParDefaut)' +
      '\nou, pour un simple message, notifications.error/success/info.\n'
  );
  process.exit(1);
}

console.log('dialogues natifs : aucun appel window.confirm/prompt/alert.');
