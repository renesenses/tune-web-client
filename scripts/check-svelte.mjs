#!/usr/bin/env node
/**
 * Garde-fou svelte-check : interdit toute NOUVELLE erreur de type.
 *
 * Pourquoi il existe. Deux bugs identiques ont atteint la production le même
 * jour — `streamingRef` (favoris, #1335) et `albumWall` (onglet Albums, cassé
 * en 0.9.62) : un identifiant utilisé et jamais déclaré. `npm run build` les
 * laisse passer, parce qu'esbuild transpile un bloc <script> Svelte sans
 * résoudre ses identifiants. L'erreur n'existe que dans le navigateur de
 * l'utilisateur, une fois la version publiée.
 *
 * svelte-check les voit. Mais le dépôt en compte déjà plusieurs dizaines
 * d'autres, si bien qu'exiger zéro erreur reviendrait à bloquer tout le monde,
 * et personne ne lit une sortie qui échoue toujours.
 *
 * D'où un socle figé : on enregistre les erreurs connues, et on n'échoue que
 * sur celles qui n'y sont pas. Le dépôt reste dans l'état où il est, mais il
 * ne peut plus se dégrader — et un `albumWall` serait arrêté avant la release.
 *
 *   node scripts/check-svelte.mjs            vérifie
 *   node scripts/check-svelte.mjs --update   régénère le socle (après nettoyage)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASELINE = new URL('../svelte-check-baseline.json', import.meta.url);

/** Signature stable d'une erreur : fichier + message, SANS ligne ni colonne.
 *  Le numéro de ligne bouge au moindre ajout au-dessus ; l'y inclure ferait
 *  hurler le garde-fou à chaque édition anodine et le rendrait inutilisable. */
function signature(file, message) {
  return `${file} :: ${message.replace(/\s+/g, ' ').trim()}`;
}

function collect() {
  let out = '';
  try {
    out = execFileSync('npx', ['svelte-check', '--output', 'machine'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // svelte-check sort en code non nul dès qu'il y a une erreur : c'est le cas
    // nominal ici, la sortie reste exploitable.
    out = e.stdout ?? '';
    if (!out) {
      console.error('svelte-check n’a produit aucune sortie :', e.message);
      process.exit(2);
    }
  }
  const errors = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^\d+ ERROR "(.+?)" \d+:\d+ "(.*)"$/);
    if (m) errors.push(signature(m[1], m[2]));
  }
  return errors;
}

const found = collect();

if (process.argv.includes('--update')) {
  const sorted = [...new Set(found)].sort();
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`socle svelte-check régénéré : ${sorted.length} erreur(s) connue(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('socle absent — lancez : node scripts/check-svelte.mjs --update');
  process.exit(2);
}

const baseline = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')));
const fresh = [...new Set(found)].filter((s) => !baseline.has(s));

if (fresh.length > 0) {
  console.error(`\n${fresh.length} NOUVELLE(S) erreur de type, absente(s) du socle :\n`);
  for (const s of fresh) console.error('  ' + s);
  console.error(
    '\nCes erreurs ne font PAS échouer le build : esbuild transpile sans résoudre.\n' +
      'Elles n’apparaîtraient que chez l’utilisateur, une fois la version publiée.\n' +
      'Corrigez-les, ou — si c’est délibéré — régénérez le socle avec :\n' +
      '  node scripts/check-svelte.mjs --update\n',
  );
  process.exit(1);
}

const healed = [...baseline].filter((s) => !found.includes(s)).length;
console.log(
  `svelte-check : aucune nouvelle erreur` +
    (healed > 0 ? ` (${healed} du socle ont disparu — pensez à --update).` : '.'),
);
