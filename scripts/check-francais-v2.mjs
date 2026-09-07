#!/usr/bin/env node
/**
 * Aucun texte FRANÇAIS en dur dans le nouveau client.
 *
 * `check-i18n.mjs` ne lit que trois formes : le texte entre balises, les
 * attributs, et les notifications. Trois angles morts restaient, et c'est là
 * que vivaient les cent cinq chaînes trouvées le 06/09/2026 :
 *
 *  1. Les TABLEAUX DE LIBELLÉS du `<script>` — `{ view: 'library', label:
 *     'Bibliothèque' }`. Toute la barre latérale et tous les titres d'en-tête
 *     y étaient : le chrome permanent du client restait en français quelle que
 *     soit la langue choisie.
 *  2. Les MESSAGES D'ERREUR — `error = 'Découverte réseau indisponible.'`.
 *  3. Les expressions `{a ? 'x' : 'y'}` du balisage, que `VISIBLE` ne lit pas
 *     parce qu'elle s'arrête aux accolades.
 *
 * « Traductions incomplètes : merci de tout vérifier » (Bertrand).
 *
 * ## Portée
 *
 * ÉTROITE : `src/components/v2` seulement. Le client actuel porte la même
 * dette en bien plus gros, et une garde qui échoue des centaines de fois dès
 * le premier jour serait désactivée le lendemain. On tient ce qui est propre.
 *
 * Ce qui est ÉCARTÉ, et pourquoi :
 *  - les commentaires : c'est de la documentation, elle est en français exprès ;
 *  - `console.*` : rien de tout cela n'atteint l'écran ;
 *  - une chaîne qui a la forme d'une clé (`v2.lib.sortTitle`) ;
 *  - les chaînes de moins de quatre caractères, trop souvent techniques.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function fichiers(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (n.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** Les mêmes marqueurs que `check-i18n`, pour que les deux gardes s'accordent. */
const FRANCAIS =
  /(è|é\w|ê|à |ù|ç|œ|\b(?:le|la|les|des|une|un|du|dans|pour|avec|sans|sur|par|est|sont|vers|aucun|aucune|aux)\b)/i;
const CLE = /^[a-z0-9]+(\.[A-Za-z0-9_]+)+$/;
const LITTERAL = /'([^'\\\n]{4,})'|"([^"\\\n]{4,})"/g;
const CONSOLE = /console\.\w+\([^)]*\)/g;

/** Le CODE, sans ce qu'on a écrit pour l'expliquer. */
function sansCommentaires(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/(^|[^:])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
    .replace(CONSOLE, (m) => ' '.repeat(m.length));
}

const fautes = [];
for (const f of fichiers('src/components/v2')) {
  const brut = readFileSync(f, 'utf8');
  const src = sansCommentaires(brut);
  for (const m of src.matchAll(LITTERAL)) {
    const texte = (m[1] ?? m[2] ?? '').trim();
    if (!FRANCAIS.test(texte)) continue;
    if (CLE.test(texte) || texte.startsWith('.') || texte.startsWith('#')) continue;
    // Un IDENTIFIANT, pas une phrase.
    //
    // Ce dépôt nomme en français : `'aucune'` comme membre d'une union de type
    // (`numerotation?: 'piste' | 'rang' | 'aucune'`) n'atteint aucun écran.
    // Un seul mot, en minuscules, sans espace et SANS ACCENT est donc écarté.
    //
    // L'accent est le discriminant qui compte : « désactivé », « connecté »,
    // « résolu » sont des mots isolés bel et bien affichés — ils portent tous
    // un accent et restent attrapés. Une phrase, elle, porte un espace.
    //
    // Risque résiduel assumé : un mot affiché, isolé, en minuscules et sans
    // accent (« sans », « aucun ») passerait. On le prend : la garde reste
    // utile, et le mot nu affiché est rare — la traduction du 06/09 n'en a pas
    // rencontré un seul sur 105 chaînes.
    if (/^[a-z]{1,12}$/.test(texte)) continue;
    const ligne = src.slice(0, m.index).split('\n').length;
    fautes.push(`${f}:${ligne}  ${texte.slice(0, 90)}`);
  }
}

if (fautes.length) {
  console.error(`\n${fautes.length} chaîne(s) française(s) en dur dans le client v2 :\n`);
  for (const l of fautes) console.error('  ' + l);
  console.error(
    "\nUne chaîne en dur ne se traduit jamais : elle reste en francais dans les",
  );
  console.error('onze langues. Ajoutez une cle dans src/lib/locales et passez par $t().');
  process.exit(1);
}

console.log('client v2 : aucun francais en dur.');
