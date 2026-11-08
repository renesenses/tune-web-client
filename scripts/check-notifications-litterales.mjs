#!/usr/bin/env node
/**
 * Refuse un message d'erreur ÉCRIT EN DUR passé à `notifications.error(`.
 *
 * `check-i18n.mjs` lit déjà les notifications, mais seulement quand le
 * littéral « a l'air français » (accents, mots-outils). Un message anglais
 * passait donc sans bruit : « Failed to load OAAT groups », « Network error:
 * server unreachable » se sont affichés tels quels à des utilisateurs qui
 * avaient choisi le français, l'allemand ou le japonais (08/11/2026). Et
 * « Enregistrement impossible », sans accent ni mot-outil, passait aussi.
 *
 * La règle ici ne juge pas la langue : un message d'erreur est une phrase
 * TRADUITE. Le premier argument de `notifications.error(` ne peut donc pas
 * être un littéral `'…'` ou `"…"` qui contient des lettres, ni un gabarit
 * `` `…` `` dont la partie fixe (hors `${…}`) contient un mot. Les
 * séparateurs (` : `, ` — `) et les noms propres de la liste `MARQUES`
 * restent permis : `${s.name} : ${…}` et `Last.fm : ${…}` sont légitimes.
 *
 * Remplacement : `notifications.error($t('cle'))`, avec la clé dans les
 * quinze langues (le troisième contrôle de check-i18n exige la parité).
 *
 * Le REPLI est lu aussi : `notifications.error(e?.message ?? 'Erreur')`
 * affiche « Erreur » à un Japonais dès que l'exception n'a pas de message.
 *
 * `I18N_RACINE` déplace la racine balayée, pour la contre-épreuve
 * (`src/lib/__tests__/gardeNotificationsLitterales.test.ts`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RACINE = process.env.I18N_RACINE || 'src';
const EXTS = ['.svelte', '.ts', '.js'];

/** Noms propres affichés tels quels dans toutes les langues. */
const MARQUES = ['Last.fm', 'Tune', 'TIDAL', 'Qobuz', 'Deezer', 'Spotify', 'OAAT', 'AirPlay', 'UPnP', 'DLNA', 'HTTP', 'API'];

const APPEL = /notifications\s*\.\s*error\s*\(/g;
/** Un repli littéral : `e?.message ?? 'Erreur'`, `x || "Failed"`. */
const REPLI = /(\?\?|\|\|)\s*(['"`])/g;
const MOT = /\p{L}{2,}/u;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      yield* walk(full);
    } else if (EXTS.some((e) => entry.endsWith(e)) && !/\.test\.|\.spec\./.test(entry)) {
      yield full;
    }
  }
}

/** Remplace les commentaires par des espaces (les lignes restent alignées). */
function sansCommentaires(text) {
  const blanc = (m) => m.replace(/[^\n]/g, ' ');
  // Les commentaires de ligne d'abord : `// sous-modules api/*.` ouvrirait
  // sinon un faux commentaire de bloc qui avale le fichier jusqu'au prochain
  // `*/`. Un `//` n'en ouvre un qu'en début de ligne ou après un blanc ou une
  // ponctuation de code — pas dans `'http://…'`.
  return text
    .replace(/(^|[\s;{}(),])\/\/[^\n]*/gm, (m, p) => p + blanc(m.slice(p.length)))
    .replace(/\/\*[\s\S]*?\*\//g, blanc)
    .replace(/<!--[\s\S]*?-->/g, blanc);
}

/** Lit le littéral qui commence à `i` (sur le guillemet) ; rend sa partie fixe. */
function partieFixe(src, i) {
  const q = src[i];
  let fixe = '';
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { fixe += src[j + 1] ?? ''; j += 2; continue; }
    if (c === q) break;
    if (q === '`' && c === '$' && src[j + 1] === '{') {
      // saute l'expression, accolades imbriquées comprises
      let prof = 1;
      j += 2;
      while (j < src.length && prof > 0) {
        if (src[j] === '{') prof++;
        else if (src[j] === '}') prof--;
        j++;
      }
      fixe += ' ';
      continue;
    }
    fixe += c;
    j++;
  }
  return fixe;
}

function fautif(fixe) {
  let reste = fixe;
  for (const m of MARQUES) reste = reste.split(m).join(' ');
  return MOT.test(reste);
}

/** Les arguments de l'appel ouvert en `i` (juste après la parenthèse). */
function arguments_(src, i) {
  let prof = 1;
  let j = i;
  while (j < src.length && prof > 0) {
    const c = src[j];
    if (c === "'" || c === '"' || c === '`') {
      // saute le littéral
      let k = j + 1;
      while (k < src.length && src[k] !== c) k += src[k] === '\\' ? 2 : 1;
      j = k + 1;
      continue;
    }
    if (c === '(') prof++;
    else if (c === ')') prof--;
    j++;
  }
  return src.slice(i, j - 1);
}

const fautes = [];
for (const file of walk(RACINE)) {
  const src = sansCommentaires(readFileSync(file, 'utf8'));
  for (const m of src.matchAll(APPEL)) {
    const args = arguments_(src, m.index + m[0].length);
    const ligne = src.slice(0, m.index).split('\n').length;
    const signaler = (fixe) => fautes.push(`${relative('.', file)}:${ligne}  ${fixe.trim().slice(0, 90)}`);
    // 1. le message lui-même est un littéral
    const tete = args.match(/^\s*/)[0].length;
    if (/['"`]/.test(args[tete] ?? '')) {
      const fixe = partieFixe(args, tete);
      if (fautif(fixe)) { signaler(fixe); continue; }
    }
    // 2. un repli littéral derrière `??` ou `||`
    for (const r of args.matchAll(REPLI)) {
      const fixe = partieFixe(args, r.index + r[0].length - 1);
      if (fautif(fixe)) { signaler(fixe); break; }
    }
  }
}

if (fautes.length) {
  console.error(`\nnotifications.error : ${fautes.length} message(s) écrit(s) en dur :\n`);
  for (const f of fautes) console.error(`  ${f}`);
  console.error(
    '\nUn message d\'erreur affiché passe par la traduction :' +
      "\n  notifications.error($t('zone.cle'))" +
      '\navec la clé ajoutée dans les quinze fichiers de src/lib/locales.' +
      '\nLe texte brut d\'une exception va dans le troisième argument (detail).\n'
  );
  process.exit(1);
}
console.log('notifications.error : aucun message écrit en dur.');
