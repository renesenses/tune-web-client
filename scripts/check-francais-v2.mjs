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
  + 'MOZAIKLABS|Radio France|Crossfeed|Podcasts|Playlists|Studio|Oxygen)+$',
);

for (const f of fichiers('src/components/v2')) {
  const src = sansCommentaires(readFileSync(f, 'utf8'));
  const i = src.indexOf('</script>');
  if (i < 0) continue;
  let balisage = src.slice(i + 9);
  // Le bloc <style> ne s'affiche pas.
  const j = balisage.indexOf('<style');
  const fin = j > 0 ? balisage.slice(0, j) : balisage;
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
  console.error(`\n${fautes.length} chaîne(s) française(s) en dur dans le client v2 :\n`);
  for (const l of fautes) console.error('  ' + l);
  console.error(
    "\nUne chaîne en dur ne se traduit jamais : elle reste en francais dans les",
  );
  console.error('onze langues. Ajoutez une cle dans src/lib/locales et passez par $t().');
  process.exit(1);
}

console.log('client v2 : aucun francais en dur.');
