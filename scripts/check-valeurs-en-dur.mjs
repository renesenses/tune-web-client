#!/usr/bin/env node
/**
 * Couleurs, tailles de police et familles de police ÉCRITES EN DUR, hors des
 * fichiers de jetons — garde à cliquet.
 *
 * Harmonisation de l'interface, phase 1 (décision de Bertrand du 26/11/2026) :
 * une base commune (`src/styles/fondations.css`) porte désormais l'échelle des
 * tailles, les rayons, les graisses, les familles et la palette nommée. Un
 * composant qui écrit `#1E1E1E`, `font-size: 13px` ou `font-family: Lato`
 * échappe à cette base : il ne suit ni le thème, ni la « Taille du texte », ni
 * un changement de police décidé ailleurs. C'est exactement ce qui avait
 * laissé Lato dans une vingtaine de composants affichés au milieu d'écrans
 * en Inter.
 *
 * ## Pourquoi un cliquet et pas une interdiction
 *
 * Le jour où cette garde est née, le client en comptait plusieurs centaines.
 * Une garde qui échoue des centaines de fois dès le premier jour serait
 * désactivée le lendemain (même raisonnement que `check-francais-v2.mjs`).
 * Elle relève donc les cas, et compare chaque compte à un PLAFOND
 * (`scripts/valeurs-en-dur-plafond.json`), égal au compte du jour :
 *
 *  - compte > plafond : on a ajouté une valeur en dur. Écrire un jeton de
 *    `fondations.css` (ou `--v2-*` / `--tune-*`) à la place. En rc14 c'est un
 *    AVERTISSEMENT (code de sortie 0) ; ÉCHEC avec `--bloquant` ou
 *    `VALEURS_EN_DUR_BLOQUANT=1`. TODO rc15 : bloquante par défaut.
 *  - compte < plafond : succès, et la garde demande d'ABAISSER le plafond dans
 *    le même commit, pour que le terrain gagné ne se reperde pas.
 *  - compte = plafond : succès silencieux.
 *
 * La migration écran par écran (phases suivantes) fait baisser les plafonds.
 *
 * ## Ce qui est compté
 *
 *  - couleurs : `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, et les fonctions
 *    `rgb()/rgba()/hsl()/hsla()` dont un argument est un nombre littéral.
 *    Le repli d'un `var(--x, #hex)` COMPTE : c'est une couleur que le
 *    composant décide lui-même quand le jeton manque.
 *  - tailles : toute valeur de `font-size`, ou la taille d'un raccourci
 *    `font:`, qui contient un nombre suivi de px/rem/em/pt — y compris la
 *    forme `calc(13px * var(--v2-txt-echelle, 1))`, qui suit l'échelle du
 *    texte mais pas l'échelle des tailles.
 *  - familles : toute valeur de `font-family` (ou famille d'un raccourci
 *    `font:`) qui nomme une police au lieu de lire un `var(--…)`.
 *    `inherit` et `initial` ne comptent pas.
 *
 * ## Portée
 *
 *  - le `<style>` et les attributs `style=` / `style:` de tous les `.svelte`
 *    de `src/components` (le `<script>` est hors de portée : les toiles et
 *    les tables de couleurs JS se lisent dans `dessinVuMetre.ts` et
 *    `v2Jetons.ts`, qui ont leurs propres gardes) ;
 *  - les feuilles de `src/styles/` SAUF les fichiers de jetons ci-dessous.
 *  Les commentaires CSS et HTML sont retirés avant de compter.
 *
 * ## Usage
 *
 *  node scripts/check-valeurs-en-dur.mjs            # la garde (npm test)
 *  node scripts/check-valeurs-en-dur.mjs --bloquant # échoue au-dessus du plafond
 *  node scripts/check-valeurs-en-dur.mjs --releve   # détail JSON sur stdout
 *  node scripts/check-valeurs-en-dur.mjs --plafond  # réécrit le plafond
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FICHIERS_DE_JETONS = new Set([
  'src/styles/fondations.css',
  'src/styles/polices.css', // @font-face : chaque bloc nomme la police qu'il déclare
  'src/styles/tune-theme.css',
  'src/styles/tune-v2.css',
]);
const PLAFOND = 'scripts/valeurs-en-dur-plafond.json';

function fichiers(dir, ext) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...fichiers(p, ext));
    // Chemins en `/` même sous Windows : ils se comparent à FICHIERS_DE_JETONS.
    else if (n.endsWith(ext) && !/\.test\./.test(n)) out.push(p.replaceAll('\\', '/'));
  }
  return out.sort();
}

/** Remplace un passage par des blancs de même longueur (lignes conservées). */
const blanchir = (s) => s.replace(/[^\n]/g, ' ');

/** Le texte CSS d'un `.svelte`, positions conservées pour les numéros de ligne. */
function cssDuSvelte(src) {
  let s = src.replace(/<!--[\s\S]*?-->/g, blanchir);
  s = s.replace(/<script[\s\S]*?<\/script>/g, blanchir);
  // Hors <style>, on ne garde que les attributs style="…" et style:prop="…".
  const out = s.split('').map((c) => (c === '\n' ? '\n' : ' '));
  const garder = (debut, fin) => {
    for (let i = debut; i < fin; i++) out[i] = s[i];
  };
  for (const m of s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    garder(m.index, m.index + m[0].length);
  }
  for (const m of s.matchAll(/\bstyle="[^"]*"/g)) garder(m.index, m.index + m[0].length);
  for (const m of s.matchAll(/\bstyle:([a-z-]+)="([^"]*)"/g)) {
    // `style:font-size="13px"` : gardé tel quel, `DECL` lit aussi cette forme.
    garder(m.index, m.index + m[0].length);
  }
  return out.join('').replace(/\/\*[\s\S]*?\*\//g, blanchir);
}

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g;
const FONC = /\b(?:rgba?|hsla?)\(\s*[0-9.]/g;
// `font-size: …` ; `style:font-size="…"` ; raccourci `font: …`.
const DECL = /(?:^|[\s;{"'])(?:style:)?(font-size|font-family|font)\s*[:=]\s*"?([^;}"\n]+)/g;
const TAILLE = /(\d*\.?\d+)\s*(px|rem|em|pt)\b/;
const MOTS_CLES = /^(inherit|initial|unset|revert|var\(.*)$/;

function analyser(fichier, css) {
  const ligne = (i) => css.slice(0, i).split('\n').length;
  const r = { couleurs: [], tailles: [], familles: [] };
  for (const m of css.matchAll(HEX)) {
    // `#id` dans un sélecteur : un hex se suit d'un ; , ) espace ou fin de valeur.
    const avant = css.slice(Math.max(0, css.lastIndexOf('\n', m.index)), m.index);
    if (!/[:,(\s]$/.test(avant) && !/=\s*"?$/.test(avant)) continue;
    if (/^\s*#/.test(avant + m[0]) && /\{\s*$/.test(css.slice(m.index, css.indexOf('\n', m.index)))) continue;
    r.couleurs.push({ fichier, ligne: ligne(m.index), valeur: m[0].toLowerCase() });
  }
  for (const m of css.matchAll(FONC)) {
    const fin = css.indexOf(')', m.index);
    r.couleurs.push({ fichier, ligne: ligne(m.index), valeur: css.slice(m.index, fin + 1).replace(/\s+/g, '') });
  }
  for (const m of css.matchAll(DECL)) {
    const [, prop, brut] = m;
    const valeur = brut.trim();
    const i = m.index + m[0].indexOf(prop);
    if (prop === 'font-size') {
      const t = valeur.match(TAILLE);
      if (t) r.tailles.push({ fichier, ligne: ligne(i), valeur: `${+t[1]}${t[2]}` });
    } else if (prop === 'font-family') {
      if (!MOTS_CLES.test(valeur)) r.familles.push({ fichier, ligne: ligne(i), valeur });
    } else {
      // Raccourci `font:` — `[style] [graisse] taille[/interligne] famille`.
      if (MOTS_CLES.test(valeur)) continue;
      // Une taille en `clamp()/min()/max()` : chaque borne littérale compte.
      for (const b of valeur.matchAll(/\b(?:clamp|min|max)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
        for (const t of b[1].matchAll(new RegExp(TAILLE, 'g'))) {
          r.tailles.push({ fichier, ligne: ligne(i), valeur: `${+t[1]}${t[2]}` });
        }
      }
      // Famille lue d'un jeton (`… var(--v2-sans)`) : rien d'autre à compter.
      if (/var\(--[\w-]+(?:\s*,[^)]*)?\)\s*$/.test(valeur)) {
        if (!/\b(?:clamp|min|max)\(/.test(valeur)) {
          const t = valeur.match(TAILLE);
          if (t) r.tailles.push({ fichier, ligne: ligne(i), valeur: `${+t[1]}${t[2]}` });
        }
        continue;
      }
      const t = valeur.match(TAILLE);
      if (t) r.tailles.push({ fichier, ligne: ligne(i), valeur: `${+t[1]}${t[2]}` });
      // La famille est ce qui suit la taille (et l'interligne).
      const apres = t ? valeur.slice(valeur.indexOf(t[0]) + t[0].length) : valeur;
      const fam = apres.replace(/^\s*(\*\s*var\([^)]*\)\s*\)?)?\s*(\/\s*[\d.]+[a-z%]*)?\s*/, '').trim();
      if (fam && !/^var\(/.test(fam) && !MOTS_CLES.test(fam)) {
        r.familles.push({ fichier, ligne: ligne(i), valeur: fam });
      }
    }
  }
  return r;
}

const tous = { couleurs: [], tailles: [], familles: [] };
const ajouter = (r) => {
  for (const k of Object.keys(tous)) tous[k].push(...r[k]);
};
for (const f of fichiers('src/components', '.svelte')) {
  ajouter(analyser(f, cssDuSvelte(readFileSync(f, 'utf8'))));
}
for (const f of fichiers('src/styles', '.css')) {
  if (FICHIERS_DE_JETONS.has(f)) continue;
  const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, blanchir);
  ajouter(analyser(f, css));
}

const comptes = Object.fromEntries(Object.entries(tous).map(([k, v]) => [k, v.length]));

if (process.argv.includes('--releve')) {
  console.log(JSON.stringify(tous, null, 1));
  process.exit(0);
}
if (process.argv.includes('--plafond')) {
  writeFileSync(PLAFOND, JSON.stringify(comptes, null, 2) + '\n');
  console.log('plafond réécrit :', comptes);
  process.exit(0);
}

const plafond = JSON.parse(readFileSync(PLAFOND, 'utf8'));
const depasse = [];
const abaisser = [];
for (const [k, n] of Object.entries(comptes)) {
  if (n > plafond[k]) depasse.push(`${k} : ${n} pour un plafond de ${plafond[k]}`);
  else if (n < plafond[k]) abaisser.push(`${k} : ${plafond[k]} → ${n}`);
}

// TODO rc15 : rendre la garde BLOQUANTE par défaut. En rc14 elle AVERTIT
// seulement : son plafond est le compte exact de main, et les PR rc14 encore
// ouvertes ajoutent quelques valeurs en dur — un échec ferait passer main au
// rouge à leur fusion. Bloquante sur demande : `--bloquant` ou
// `VALEURS_EN_DUR_BLOQUANT=1`.
const BLOQUANT = process.argv.includes('--bloquant') || process.env.VALEURS_EN_DUR_BLOQUANT === '1';

if (depasse.length) {
  const dire = BLOQUANT ? console.error : console.warn;
  dire(`valeurs en dur : plafond dépassé${BLOQUANT ? '' : ' (AVERTISSEMENT — bloquante en rc15)'}.\n`);
  for (const l of depasse) dire('  ' + l);
  dire("\nUne couleur, une taille ou une police écrite en dur échappe aux thèmes et à l'échelle.");
  dire('Lisez un jeton de src/styles/fondations.css (ou --v2-* / --tune-*) à la place.');
  dire('Détail : node scripts/check-valeurs-en-dur.mjs --releve');
  if (BLOQUANT) process.exit(1);
}
if (abaisser.length) {
  console.log('valeurs en dur : en baisse, abaissez le plafond dans ce commit :');
  for (const l of abaisser) console.log('  ' + l);
  console.log('  (node scripts/check-valeurs-en-dur.mjs --plafond)');
} else if (!depasse.length) {
  console.log(
    `valeurs en dur : ${comptes.couleurs} couleurs, ${comptes.tailles} tailles, ${comptes.familles} familles (au plafond).`,
  );
}
