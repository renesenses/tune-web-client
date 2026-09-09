#!/usr/bin/env node
/**
 * Tout jeton `var(--v2-…)` employé sans repli doit être DÉFINI quelque part.
 *
 * Un jeton inexistant ne provoque aucune erreur : la déclaration entière est
 * simplement ignorée, et l'élément reste sans couleur, sans fond, sans
 * bordure. Rien dans la console, rien à la compilation, rien aux tests.
 *
 * Vécu deux fois le 06/09/2026, dans la même heure :
 *
 *  - `--v2-surf2` et `--v2-acc` écrits pour le cœur de facette. Les vrais noms
 *    sont `--v2-surface2` et `--v2-acc1` : le cœur en favori serait resté gris,
 *    donc indiscernable du cœur vide — la fonction livrée, l'état invisible.
 *  - `--v2-danger-soft`, employé par deux bandeaux d'erreur (LibraryV2,
 *    MediaServersV2) et jamais défini : fond transparent depuis toujours.
 *
 * ## Portée
 *
 * Étroite, volontairement : les jetons `--v2-` seulement, et seulement dans le
 * `<style>` des composants. Une définition LOCALE au composant compte, comme
 * une définition de `src/styles/`. Un `var(--x, repli)` est hors de portée :
 * le repli est précisément la réponse à l'absence.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function fichiers(dir, ext) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...fichiers(p, ext));
    else if (n.endsWith(ext)) out.push(p);
  }
  return out;
}

const DEF = /(--v2-[A-Za-z0-9-]+)\s*:/g;
// Un `var(` suivi du jeton PUIS d'une parenthèse fermante : la virgule d'un
// repli exclut la ligne, et c'est voulu.
const USAGE = /var\(\s*(--v2-[A-Za-z0-9-]+)\s*\)/g;

const definis = new Set();
for (const f of fichiers('src/styles', '.css'))
  for (const m of readFileSync(f, 'utf8').matchAll(DEF)) definis.add(m[1]);

const inconnus = [];
for (const f of fichiers('src/components', '.svelte')) {
  const src = readFileSync(f, 'utf8');
  const i = src.indexOf('<style>');
  if (i === -1) continue;
  const style = src.slice(i);
  const locaux = new Set([...style.matchAll(DEF)].map((m) => m[1]));
  for (const m of style.matchAll(USAGE)) {
    if (definis.has(m[1]) || locaux.has(m[1])) continue;
    const ligne = src.slice(0, i + m.index).split('\n').length;
    inconnus.push(`${f}:${ligne}  var(${m[1]}) n'est défini nulle part`);
  }
}

if (inconnus.length) {
  console.error(`${inconnus.length} jeton(s) CSS inexistant(s) :\n`);
  for (const l of [...new Set(inconnus)]) console.error('  ' + l);
  console.error(
    "\nUn jeton absent n'echoue pas : la declaration est ignoree en silence.",
  );
  console.error('Definissez-le dans src/styles/, ou donnez un repli : var(--x, #hex).');
  process.exit(1);
}

console.log('jetons CSS : tous definis.');
