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
 * ÉTROITE, et élargie UNE FOIS, après mesure.
 *
 * Au départ `src/components/v2` seulement : le client actuel porte la même
 * dette en bien plus gros, et une garde qui échoue des centaines de fois dès
 * le premier jour serait désactivée le lendemain. On tient ce qui est propre.
 *
 * 🔴 Le 18/09/2026, ce trou a coûté un défaut vu AU NAVIGATEUR : l'onglet
 * Transferts du gestionnaire de playlists était peint en anglais dans une
 * interface française. La troisième passe ci-dessous SAIT attraper ça — elle
 * interdit tout texte visible hors `$t()`, anglais compris. Mais l'écran vit
 * dans `src/components/v2-heritage`, un répertoire à côté, et la garde passait
 * devant sans le voir.
 *
 * On a donc MESURÉ avant d'élargir, comme la portée d'origine l'exige :
 *   - `src/components/v2-heritage` (13 fichiers) : 14 occurrences → corrigées,
 *     puis la portée élargie. Bon marché.
 *   - tout `src/components` : 198 occurrences. NON RETENU — c'est exactement
 *     la garde qu'on désactive le lendemain.
 *
 * La liste reste donc explicite : on n'y ajoute un répertoire qu'après avoir
 * compté ce qu'il ferait rougir, et corrigé.
 *
 * Ce qui est ÉCARTÉ, et pourquoi :
 *  - les commentaires : c'est de la documentation, elle est en français exprès ;
 *  - `console.*` : rien de tout cela n'atteint l'écran ;
 *  - une chaîne qui a la forme d'une clé (`v2.lib.sortTitle`) ;
 *  - les chaînes de moins de quatre caractères, trop souvent techniques.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

/** Les répertoires tenus propres. Une entrée s'ajoute APRÈS mesure et correction. */
const PORTEE = ['src/components/v2', 'src/components/v2-heritage'];

function fichiers(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (n.endsWith('.svelte')) out.push(p);
  }
  return out;
}

/** Tous les fichiers de la portée, sans doublon. */
const surveilles = () => [...new Set(PORTEE.flatMap((d) => fichiers(d)))];

/** Les mêmes marqueurs que `check-i18n`, pour que les deux gardes s'accordent. */
const FRANCAIS =
  /(è|é\w|ê|à |ù|ç|œ|\b(?:le|la|les|des|une|un|du|dans|pour|avec|sans|sur|par|est|sont|vers|aucun|aucune|aux|ma|mon|mes|ta|ton|tes|sa|son|ses|notre|nos|votre|vos|leur|leurs|de|au|en|et|ou|ce|cet|cette|ces|que|qui|quoi|pas|plus|tout|toute|tous|toutes|puis|donc|car|mais|chez|entre|selon|depuis|jusqu)\b)/i;
const CLE = /^[a-z0-9]+(\.[A-Za-z0-9_]+)+$/;
const LITTERAL = /'([^'\\\n]{4,})'|"([^"\\\n]{4,})"/g;
const CONSOLE = /console\.\w+\([^)]*\)/g;

/** Le CODE, sans ce qu'on a écrit pour l'expliquer. */
/**
 * Le CODE, sans ce qu'on a écrit pour l'expliquer — et sans décaler les lignes.
 *
 * 🔴 Les retours à la ligne sont PRÉSERVÉS. La première version remplaçait un
 * commentaire par des espaces de même longueur, ce qui mangeait ses sauts de
 * ligne : tout ce qui suivait était rapporté au mauvais numéro, et j'ai
 * cherché quatre chaînes aux mauvais endroits avant de m'en apercevoir
 * (07/09/2026). Une garde qui désigne la mauvaise ligne coûte plus de temps
 * qu'elle n'en fait gagner.
 */
const blanchir = (m) => m.replace(/[^\n]/g, ' ');

function sansCommentaires(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, blanchir)
    .replace(/\/\*[\s\S]*?\*\//g, blanchir)
    .replace(/(^|[^:])\/\/.*$/gm, (m, p1) => p1 + blanchir(m.slice(p1.length)))
    .replace(CONSOLE, blanchir);
}

const fautes = [];
for (const f of surveilles()) {
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
    // Une valeur de `class=` n'atteint pas l'écran : `class="nav tous"`
    // contient « tous » sans rien afficher.
    if (new RegExp(`class=["']${texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(src)) continue;
    const ligne = src.slice(0, m.index).split('\n').length;
    fautes.push(`${f}:${ligne}  ${texte.slice(0, 90)}`);
  }
}

/**
 * 🔴 TROISIÈME passe : le TEXTE NU du balisage.
 *
 * Les deux passes précédentes lisent des chaînes entre guillemets. Or un
 * libellé écrit directement entre deux balises n'en est pas une :
 *
 *     <button ...><svg .../>Ajouter</button>
 *
 * Elles ne pouvaient pas le voir. Et le détecteur de français ne l'aurait pas
 * reconnu non plus : « Ajouter » n'a ni accent ni mot-outil.
 *
 * Alex Campbell l'a photographié le 08/09/2026 — « Ajouter », « Tout (39) »,
 * « Qualité », « Fréquence » au milieu de « Library, Shuffle, Albums,
 * Artists » — après trois signalements de « traductions incomplètes ». Le
 * balayage a trouvé **103 textes nus** dans `components/v2`, dont 58 dans les
 * seuls Réglages.
 *
 * On ne cherche donc plus du français : on interdit **tout texte visible qui
 * ne passe pas par `$t()`**. C'est plus large et c'est plus sûr — un libellé
 * anglais en dur ne se traduirait pas davantage.
 *
 * Ce qui est écarté : la ponctuation, les nombres, les unités et les noms
 * propres (`FLAC`, `Qobuz`, `WASAPI`…). Ils ne se traduisent pas, et exiger
 * une clé pour « dB » ferait fuir la garde.
 */
const INTRADUISIBLE = new RegExp(
  '^(?:[\\W\\d\\s]|dB|kHz|Hz|FLAC|DSD|MP3|WAV|ALAC|AAC|DLNA|UPnP|AirPlay|OK|ID|URL|IP|MAC|EQ|DSP|PCM|LPCM|'
  + 'CSS|HTML|JSON|API|CPU|RAM|Tune|Qobuz|Tidal|Spotify|Deezer|Bandcamp|YouTube|Sonos|BluOS|Chromecast|Roon|'
  + 'Plex|SMB|NAS|USB|bit|kbps|ms|Wi-Fi|Discogs|Last\\.fm|Genius|ListenBrainz|MusicBrainz|WASAPI|ASIO|DoP|Auto|'
  // ISRC : sigle de la norme ISO 3901, identique dans les onze langues. Le
  // Hub l'affiche comme NOM de la méthode d'appariement (« ISRC 12 »), face à
  // « Approximatif » et « Échec » qui, eux, sont traduits. Lui fabriquer une
  // clé produirait onze fois la même valeur.
  + 'ISRC|'
  // SQLite, PostgreSQL : noms de moteurs, affichés par Réglages › Base (#1295).
  + 'SQLite|PostgreSQL|'
  + 'MOZAIKLABS|Radio France|Crossfeed|Podcasts|Playlists?|Studio|Oxygen)+$',
);

/**
 * 🔴 QUATRIÈME passe : les littéraux RENDUS par une expression du balisage
 * (#1295).
 *
 *     onclick={() => connectSvc(name)}>{svcBusy === name ? '…' : 'Se connecter'}</button>
 *
 * est resté en français dans les onze langues, et aucune des trois passes ne
 * l'a vu :
 *  - la PREMIÈRE lit bien le littéral, mais n'y reconnaît pas du français :
 *    « Se connecter » n'a ni accent ni mot-outil de sa liste ;
 *  - la TROISIÈME interdit TOUT texte visible hors `$t()` — mais elle ne lit
 *    que le texte entre deux balises (`>([^<>{}]+)<`) et s'arrête aux
 *    accolades : une expression `{… ? '…' : '…'}` lui échappe entièrement.
 *
 * Cette passe applique la règle de la troisième (tout texte visible passe par
 * `$t()`, anglais compris) aux littéraux qu'une expression de TEXTE rend :
 * branches d'un ternaire (`? 'x' : 'y'`), repli (`?? 'x'`, `|| 'x'`).
 *
 * Ce qui n'est PAS lu, parce que ça n'atteint pas l'écran comme texte :
 *  - les expressions d'ATTRIBUT (`class={on ? 'on' : ''}`) — le parcours
 *    saute l'intérieur des balises ;
 *  - les blocs `{#if}`, `{:else}`, `{/if}`, `{@html}` ;
 *  - les gabarits (`\`playlist.${x}\``) : leur texte est une clé en morceaux.
 *
 * Ce qui est écarté, comme ailleurs : une clé (`v2.set.copy`, que
 * `$t(x ? 'a.b' : 'c.d')` passe en branche), les intraduisibles, et un
 * IDENTIFIANT — un mot seul, sans espace ni accent, commençant par une
 * minuscule (`'local'`, `'notFound'`) : il indexe une table ou compose une
 * clé. Risque résiduel, le même que la première passe : un mot affiché, nu,
 * en minuscules et sans accent (`'inconnu'`) passe.
 *
 * Mesuré à l'ajout (19/09/2026) : 19 littéraux dans la portée, TOUS de vrais
 * textes en dur. « Se connecter » (le défaut de #1295, deux fois) est corrigé ; les
 * dix-sept autres sont GELÉS dans `DETTE_EXPRESSIONS` ci-dessous — la garde
 * rougit sur tout littéral NOUVEAU, et sur toute dette qui réapparaît plus
 * souvent qu'elle n'est gelée. On retire une entrée en la corrigeant ; on
 * n'en ajoute jamais.
 */
function expressionsDeTexte(balisage) {
  const out = [];
  const n = balisage.length;
  // L'index qui suit l'accolade fermante de celle ouverte en `k`, chaînes
  // et accolades imbriquées comprises.
  const finAccolade = (k) => {
    let prof = 0;
    let q = null;
    for (let p = k; p < n; p++) {
      const c = balisage[p];
      if (q) {
        if (c === '\\') { p++; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '{') prof++;
      else if (c === '}' && --prof === 0) return p + 1;
    }
    return n;
  };
  let i = 0;
  while (i < n) {
    const c = balisage[i];
    if (c === '<' && /[A-Za-z\/!]/.test(balisage[i + 1] ?? '')) {
      // Dans une balise : ses attributs ne s'affichent pas comme texte.
      let q = null;
      let p = i + 1;
      for (; p < n; p++) {
        const d = balisage[p];
        if (q) { if (d === q) q = null; continue; }
        if (d === '"' || d === "'") q = d;
        else if (d === '{') p = finAccolade(p) - 1;
        else if (d === '>') break;
      }
      i = p + 1;
    } else if (c === '{') {
      const f = finAccolade(i);
      const expr = balisage.slice(i + 1, f - 1);
      if (!/^\s*[#:\/@]/.test(expr)) out.push({ index: i + 1, expr });
      i = f;
    } else i++;
  }
  return out;
}

/** Littéraux en position de RÉSULTAT : `? 'x'`, `: 'x'`, `?? 'x'`, `|| 'x'`. */
const RENDU = /(?:\?\?|\|\||[?:])\s*(['"])((?:(?!\1)[^\\\n])*)\1/g;

/**
 * Dette mesurée le 19/09/2026 — `fichier|texte` → nombre d'occurrences
 * tolérées. Ne fait que DÉCROÎTRE.
 */
const DETTE_EXPRESSIONS = new Map([
  ['src/components/v2/PlaylistsV2.svelte|Créez-en une avec « Nouvelle playlist ».', 1],
  ['src/components/v2/PluginsV2.svelte|Installer', 1],
  ['src/components/v2/SettingsV2.svelte|établie', 1],
  ['src/components/v2/SettingsV2.svelte|rompue', 1],
  ['src/components/v2/SettingsV2.svelte|Export…', 3],
  ['src/components/v2/SettingsV2.svelte|Albums (CSV)', 1],
  ['src/components/v2/SettingsV2.svelte|Titres (CSV)', 1],
  ['src/components/v2/SettingsV2.svelte|Artistes (CSV)', 1],
  ['src/components/v2/SettingsV2.svelte|Activer', 2],
  ['src/components/v2/SettingsV2.svelte|Désactiver', 1],
  ['src/components/v2/StreamingV2.svelte|Liaison…', 1],
  ['src/components/v2/StreamingV2.svelte|Relier', 1],
  ['src/components/v2-heritage/PlaylistManagerView.svelte|Sync...', 1],
  ['src/components/v2-heritage/PlaylistManagerView.svelte|Sync', 1],
]);
const detteVue = new Map();

for (const f of surveilles()) {
  const src = sansCommentaires(readFileSync(f, 'utf8'));
  const i = src.indexOf('</script>');
  if (i < 0) continue;
  // 🔴 Un composant peut porter DEUX scripts : `<script module>` en plus du
  // script d'instance — `ListePistesV2` depuis #1149, qui exporte la largeur
  // de sa colonne d'actions pour que l'Historique compose la même grille.
  // Couper au PREMIER `</script>` faisait alors lire le script d'INSTANCE
  // comme du balisage, et une signature TypeScript y ressortait en « texte nu
  // » : `void) | null) | null; apres?: Snippet`. On blanchit donc les blocs de
  // script restants, en gardant les sauts de ligne pour que les numéros
  // signalés restent justes.
  let balisage = src.slice(i + 9).replace(/<script[\s\S]*?<\/script>/g, blanchir);
  // Le bloc <style> ne s'affiche pas.
  const j = balisage.indexOf('<style');
  let fin = j > 0 ? balisage.slice(0, j) : balisage;
  // 🔴 `<code>` et `<pre>` ne se traduisent PAS : ils portent de la SYNTAXE.
  //
  // `GenreTreeView` documente le langage de requête avec
  // `<code>genre branch_of "Jazz"</code>` et `<code>albums.genre</code>`.
  // Un utilisateur allemand doit taper `branch_of`, pas sa traduction ; et
  // `albums.genre` est un nom de colonne. Les réclamer en clé i18n produirait
  // une interface qui ment sur ce qu'il faut saisir.
  //
  // On les blanchit comme les commentaires, en gardant les sauts de ligne pour
  // que les numéros signalés restent justes.
  fin = fin.replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/g, blanchir);
  for (const m of fin.matchAll(/>([^<>{}]+)</g)) {
    // Les entités HTML décodées AVANT l'examen : `&times;` n'est pas un mot,
    // et `&lt; 15 m²` est une mesure. Les réclamer en traduction ferait fuir
    // la garde pour rien.
    const texte = m[1]
      .replace(/&(?:times|lt|gt|amp|nbsp|hellip|mdash|ndash|middot|deg|laquo|raquo|times|divide|plusmn|le|ge|ne|rarr|larr|check|bull);/g, ' ')
      .trim();
    if (texte.length < 2) continue;
    if (INTRADUISIBLE.test(texte)) continue;
    if (!/[A-Za-zÀ-ÿ]{2}/.test(texte)) continue;
    const ligne = src.slice(0, i + 9 + m.index).split('\n').length;
    fautes.push(`${f}:${ligne}  texte nu (hors $t) : ${texte.replace(/\s+/g, ' ').slice(0, 80)}`);
  }

  // Quatrième passe (#1295) : voir `expressionsDeTexte`.
  for (const { index, expr } of expressionsDeTexte(fin)) {
    for (const m of expr.matchAll(RENDU)) {
      const texte = m[2].trim();
      if (texte.length < 2 || !/[A-Za-zÀ-ÿ]{2}/.test(texte)) continue;
      if (CLE.test(texte) || INTRADUISIBLE.test(texte)) continue;
      if (/^[a-z][A-Za-z0-9_]*$/.test(texte)) continue;
      const cle = `${f.split(sep).join('/')}|${texte}`;
      const deja = (detteVue.get(cle) ?? 0) + 1;
      detteVue.set(cle, deja);
      if (deja <= (DETTE_EXPRESSIONS.get(cle) ?? 0)) continue;
      const ligne = src.slice(0, i + 9 + index + m.index).split('\n').length;
      fautes.push(`${f}:${ligne}  littéral rendu par une expression (hors $t) : ${texte.slice(0, 80)}`);
    }
  }
}

/**
 * 🔴 Une garde de FORME, en plus de celle des mots.
 *
 * « Label "File d'attente" du menu absent » (Fabien, v0.9.140, 07/09/2026).
 * La conversion de la barre latérale en clés de traduction avait laissé une
 * entrée derrière : `label: "File d'attente"`. Le remplacement automatique
 * lisait `label: (['"])([^'"]+)\1`, et l'apostrophe DANS des guillemets
 * doubles a fait échouer l'appariement sur cette seule ligne.
 *
 * Le rendu appelle `$t(it.labelKey)` : avec `labelKey` indéfini, l'entrée
 * s'affichait SANS AUCUN libellé. Ni la garde des mots — « File d'attente »
 * n'a ni accent ni article — ni `check-i18n` ne pouvaient le voir.
 *
 * On ne cherche donc plus un mot français ici : on interdit la FORME. Dans
 * les fichiers de navigation, une entrée porte `labelKey`, jamais `label`.
 */
const NAVIGATION = ['src/components/v2/Sidebar.svelte', 'src/components/v2/ShellV2.svelte'];
for (const f of NAVIGATION) {
  const src = sansCommentaires(readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/\blabel:\s*['"]/g)) {
    const ligne = src.slice(0, m.index).split('\n').length;
    fautes.push(`${f}:${ligne}  entree de navigation avec 'label:' au lieu de 'labelKey:'`);
  }
}

if (fautes.length) {
  console.error(`\n${fautes.length} chaîne(s) en dur (hors $t) dans ${PORTEE.join(', ')} :\n`);
  for (const l of fautes) console.error('  ' + l);
  console.error(
    "\nUne chaîne en dur ne se traduit jamais : elle reste en francais dans les",
  );
  console.error('onze langues. Ajoutez une cle dans src/lib/locales et passez par $t().');
  process.exit(1);
}

console.log(`aucun texte en dur hors $t() dans ${PORTEE.join(', ')}.`);
