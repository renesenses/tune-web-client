/**
 * Les préfixes de clés i18n COMPOSÉS DYNAMIQUEMENT, lus dans le code source.
 *
 * ── POURQUOI CE MODULE EXISTE ────────────────────────────────────────────
 *
 * `check-i18n.mjs` sait dire qu'une clé appelée n'existe pas. Il a longtemps
 * ignoré l'inverse — une clé qui existe et que personne n'appelle. Elles
 * s'accumulaient sans bruit : la phase 5 a retiré 64 vues, leurs libellés sont
 * restés derrière (`docs/garanties-sans-temoin-phase5.md`).
 *
 * Chercher les clés sans référence par une recherche de LITTÉRAUX ne suffit
 * pas : une partie des clés n'est jamais écrite en entier dans le code. Elle
 * est composée — `$t('oxygen.facet.' + f)`, `` $t(`dashboard.period.${p}`) ``.
 * Une recherche de littéraux les déclare toutes orphelines, et une purge
 * aveugle afficherait « oxygen.facet.genre » en plein écran. Rien ne
 * l'attraperait : le contrôle des références ne voit pas les appels
 * dynamiques, et aucun test ne rend ces écrans dans les onze langues.
 *
 * ── 🔴 POURQUOI ELLE EST DÉRIVÉE, ET JAMAIS ÉCRITE À LA MAIN ─────────────
 *
 * Une liste de préfixes tenue à la main pourrit au premier écran neuf : le
 * jour où quelqu'un ajoute `$t(`toto.${x}`)`, la garde accuse ses clés à tort
 * et la porte rougit sans faute — ou, pire, quelqu'un élargit la liste « pour
 * que ça passe » et le plafond devient décoratif. Les préfixes sont donc
 * EXTRAITS du source, à chaque exécution.
 *
 * ── 🔴 POURQUOI ELLE EST ÉTROITE ─────────────────────────────────────────
 *
 * Un préfixe exempte TOUTE sa famille. `playlist.` exempterait à lui seul six
 * clés, alors que le seul gabarit qui le compose —
 * `` `playlist.${s === 'not_found' ? 'notFound' : …}` `` — ne peut en produire
 * que trois, nommées là, en clair. D'où les deux resserrements :
 *
 *   - `valeursLitterales` : quand toutes les valeurs que l'interpolation peut
 *     prendre sont des littéraux, on ÉNUMÈRE les clés produites au lieu
 *     d'exempter la famille ;
 *   - `siteDeTraduction` : un gabarit n'est retenu que si sa valeur part bien
 *     vers `$t`. `` `playlist.${format}` `` dans `api.ts` est un NOM DE
 *     FICHIER (`a.download`), pas une clé ; le retenir aurait exempté la
 *     famille `playlist.` pour rien.
 *
 * Et un dernier filtre, gratuit : un préfixe dont AUCUNE clé déclarée ne
 * porte le nom n'exempte rien et n'a pas à figurer (`window.`, `button.`,
 * `tune.v2.vue.` — des clés de stockage local, des sélecteurs CSS).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** La tête statique d'une clé : `oxygen.facet`, `v2.sources.etat`. */
const TETE = '[a-z][a-zA-Z0-9]*(?:\\.[a-zA-Z0-9_]+)*';

/**
 * 🔴 Le début statique d'une clé composée — et il NE FINIT PAS toujours par un
 * point.
 *
 * Une première version n'acceptait que `'x.y.' + v`. Elle rendait donc
 * orphelines les neuf clés `zoneConfig.channels_*`, composées dans
 * `SettingsV2.svelte` par `$t('zoneConfig.channels_' + d.id)` : le sélecteur de
 * canaux (Réglages › Appareils) aurait affiché « zoneConfig.channels_stereo »
 * dans sa liste déroulante, dans les onze langues, sans qu'aucun test ne le
 * voie. Le point final n'est pas une règle du dépôt, c'est une habitude —
 * `v2.smart.fav${prefixe}${quoi}` en est un autre contre-exemple.
 *
 * On exige donc seulement UN point, et n'importe quoi de nommable ensuite.
 */
const DEBUT = '[a-z][a-zA-Z0-9]*(?:\\.[a-zA-Z0-9_]*)+';

/** Un littéral de clé entier, les deux guillemets du même genre. */
const LITTERAL_CLE = new RegExp(`(['"])(${TETE}(?:\\.[a-zA-Z0-9_]+)+)\\1`, 'g');

/**
 * La même clé entre accents graves — mais SEULEMENT dans un appel de
 * traduction.
 *
 * Neuf clés de ce dépôt ne sont nommées que dans un COMMENTAIRE, entre accents
 * graves, souvent pour dire qu'elles ne servent plus (« `v2.fav.queueFailed` :
 * cet écran portait sa propre mise en file… »). Compter une prose comme une
 * référence, c'est offrir un moyen d'éteindre cette garde en écrivant la clé
 * dans un commentaire. Un gabarit sans interpolation — `` $t(`v2.foo.bar`) ``
 * — reste une vraie référence, lui.
 */
const LITTERAL_GABARIT = new RegExp(`\`(${TETE}(?:\\.[a-zA-Z0-9_]+)+)\``, 'g');

/** Forme 1 — le gabarit : `` `oxygen.facet.${f}` ``, `` `zoneConfig.channels_${d}` ``. */
const GABARIT = new RegExp(`\`(${DEBUT})\\$\\{`, 'g');

/** Forme 2 — la concaténation : `'oxygen.facet.' + f`, `'zoneConfig.channels_' + id`. */
const CONCAT = new RegExp(`(['"])(${DEBUT})\\1\\s*\\+`, 'g');

/** Forme 3 — la constante de préfixe : `const PREFIXE = 'smartCollection.default.';`. */
const CONSTANTE = new RegExp(
  `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=\\n]*)?=\\s*(['"])(${DEBUT})\\2`,
  'g'
);

/** Forme 4 — le préfixe reçu en paramètre : `` const cle = `${prefixe}.${valeur}`; ``. */
const COMPOSE_PARAM = /`\$\{([A-Za-z_$][\w$]*)\}\.\$\{/;

/** Un appel de traduction. `get(t)(cle)` compte autant que `$t(cle)`. */
const APPEL_T = /(?<![\w$])(?:\$t|\$tr|t|tr|traduire|translate)\s*\(|\(\s*t\s*\)\s*\(/;

/** Le nom qui reçoit la clé composée, quand la ligne l'affecte. */
const AFFECTATION = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=/;

/** Une comparaison — l'endroit où un littéral n'est PAS une valeur produite. */
const COMPARAISON = /[A-Za-z_$][\w$.?![\]']*\s*(?:===|!==|==|!=)\s*(?:'[^']*'|"[^"]*"|[\w$.]+)/g;

/**
 * Les fichiers de `racine` et leur contenu, lus UNE fois.
 *
 * Les deux passes (préfixes, puis littéraux) parcourent le même arbre ; sans
 * cette mémoire, `check-i18n` relisait 1 228 fichiers deux fois.
 *
 * @type {Map<string, {chemin: string, texte: string}[]>}
 */
const lus = new Map();

/**
 * @param {string} racine
 * @returns {{chemin: string, texte: string}[]}
 */
function fichiersLus(racine) {
  const memo = lus.get(racine);
  if (memo) return memo;
  const liste = [...fichiersSource(racine)].map((chemin) => ({
    chemin,
    texte: readFileSync(chemin, 'utf8'),
  }));
  lus.set(racine, liste);
  return liste;
}

/**
 * Les fichiers de code sous `dir`, `locales/` exclu.
 *
 * @param {string} dir
 * @returns {Generator<string>}
 */
export function* fichiersSource(dir) {
  for (const nom of readdirSync(dir)) {
    const complet = join(dir, nom);
    if (statSync(complet).isDirectory()) {
      if (nom === 'locales') continue;
      yield* fichiersSource(complet);
    } else if (/\.(?:svelte|ts|js)$/.test(nom)) yield complet;
  }
}

/**
 * Le gabarit entier, depuis son accent grave ouvrant. Les gabarits de clé de
 * ce dépôt tiennent tous sur une ligne ; on s'arrête donc à la fin de ligne.
 *
 * @param {string} ligne
 * @param {number} debut
 * @returns {string | null}
 */
function gabaritEntier(ligne, debut) {
  for (let i = debut + 1; i < ligne.length; i++) {
    if (ligne[i] === '\\') i++;
    else if (ligne[i] === '`') return ligne.slice(debut + 1, i);
  }
  return null;
}

/**
 * Les corps des `${…}` d'un gabarit, sans imbrication profonde.
 *
 * @param {string} gabarit
 * @returns {string[]}
 */
function interpolations(gabarit) {
  const corps = [];
  for (let i = 0; i < gabarit.length; i++) {
    if (gabarit[i] !== '$' || gabarit[i + 1] !== '{') continue;
    let profondeur = 1;
    let j = i + 2;
    for (; j < gabarit.length && profondeur > 0; j++) {
      if (gabarit[j] === '{') profondeur++;
      else if (gabarit[j] === '}') profondeur--;
    }
    corps.push(gabarit.slice(i + 2, j - 1));
    i = j - 1;
  }
  return corps;
}

/**
 * 🔴 Les valeurs qu'une interpolation peut prendre, quand ce sont TOUTES des
 * littéraux — sinon `null`, et le préfixe entier est exempté.
 *
 * On retire d'abord les comparaisons : dans
 * `s === 'not_found' ? 'notFound' : 'matched'`, `'not_found'` est une valeur
 * TESTÉE, jamais produite. Ce qui reste doit être fait de littéraux, de `?`,
 * de `:` et de rien d'autre — un identifiant nu signifierait qu'une valeur
 * inconnue peut sortir, et alors on ne sait plus ce que le gabarit produit.
 *
 * @param {string} expression
 * @returns {string[] | null} les suffixes possibles, ou `null` si on ne sait pas
 */
export function valeursLitterales(expression) {
  const sansComparaisons = expression.replace(COMPARAISON, ' ');
  const litteraux = [...sansComparaisons.matchAll(/'([^'\\]*)'|"([^"\\]*)"/g)].map(
    (m) => m[1] ?? m[2]
  );
  if (litteraux.length === 0) return null;
  const squelette = sansComparaisons.replace(/'[^'\\]*'|"[^"\\]*"/g, '');
  if (/[\w$]/.test(squelette)) return null; // un identifiant subsiste
  return litteraux;
}

/**
 * La valeur composée part-elle vers `$t` ? Trois cas, dans l'ordre :
 *   - l'appel de traduction est sur la ligne même (`$t(`tv.${i}`)`) ;
 *   - la ligne affecte un nom, et ce nom est traduit ou rendu juste après ;
 *   - la ligne n'affecte rien : la valeur s'échappe (retour, ternaire, objet,
 *     argument) et on ne peut pas la suivre — on la retient, faute de mieux.
 *
 * @param {string[]} lignes
 * @param {number} index
 * @returns {boolean}
 */
function siteDeTraduction(lignes, index) {
  const ligne = lignes[index];
  if (APPEL_T.test(ligne)) return true;
  const affectation = ligne.match(AFFECTATION);
  if (!affectation) return true;
  const nom = affectation[1];
  const usage = new RegExp(`(?<![\\w$])${nom}(?![\\w$])`);
  for (let i = index + 1; i <= index + 5 && i < lignes.length; i++) {
    if (!usage.test(lignes[i])) continue;
    if (APPEL_T.test(lignes[i]) || /\breturn\b/.test(lignes[i])) return true;
  }
  return false;
}

/**
 * Les noms des fonctions qui composent une clé à partir d'un PARAMÈTRE.
 *
 * @param {string} texte
 * @returns {Set<string>}
 */
function fonctionsAPrefixe(texte) {
  const noms = new Set();
  const lignes = texte.split('\n');
  lignes.forEach((ligne, index) => {
    const m = ligne.match(COMPOSE_PARAM);
    if (!m) return;
    const parametre = m[1];
    for (let i = index; i >= 0 && i > index - 30; i--) {
      const f = lignes[i].match(
        /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)|\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(([^)]*)\)\s*(?::[^=]*)?=>/
      );
      if (!f) continue;
      const nom = f[1] ?? f[3];
      const args = f[2] ?? f[4] ?? '';
      if (new RegExp(`(?<![\\w$])${parametre}(?![\\w$])`).test(args)) noms.add(nom);
      break;
    }
  });
  return noms;
}

/**
 * Les préfixes dynamiques et les clés énumérées, lus sous `racine`.
 *
 * @param {string} racine
 * @param {Set<string>} declarees les clés de `fr.ts` — un préfixe qu'aucune
 *   d'elles ne porte n'exempte rien.
 * @returns {{prefixes: Map<string, string[]>, enumerees: Map<string, string>}}
 *   les sites (`fichier:ligne`) de chaque préfixe, et de chaque clé énumérée.
 */
export function prefixesDynamiques(racine, declarees) {
  const fichiers = fichiersLus(racine);

  // Forme 4 : d'abord les fonctions qui composent, puis leurs appels.
  const composeuses = new Set();
  for (const { texte } of fichiers) for (const n of fonctionsAPrefixe(texte)) composeuses.add(n);
  const appelsComposeuses =
    composeuses.size > 0
      ? new RegExp(
          `(?<![\\w$])(?:${[...composeuses].join('|')})\\s*\\(\\s*(['"])(${TETE})\\1`,
          'g'
        )
      : null;

  /** Le nom d'une fonction composeuse est-il écrit sur cette ligne ? */
  const aAppel = (/** @type {string} */ ligne) => {
    for (const nom of composeuses) if (ligne.includes(nom)) return true;
    return false;
  };

  /** @type {Map<string, string[]>} préfixe -> sites */
  const brut = new Map();
  /** @type {Map<string, string>} clé -> site */
  const enumerees = new Map();
  /** @param {string} prefixe @param {string} site */
  const noter = (prefixe, site) => {
    const sites = brut.get(prefixe);
    if (sites) sites.push(site);
    else brut.set(prefixe, [site]);
  };

  for (const { chemin, texte } of fichiers) {
    const lignes = texte.split('\n');
    /** @type {Map<string, {prefixe: string, site: string}>} nom -> préfixe */
    const constantes = new Map();
    lignes.forEach((ligne, index) => {
      // Préfiltres : sur 257 000 lignes, lancer quatre expressions régulières
      // par ligne coûte huit secondes, et ce contrôleur est appelé par un test
      // borné à cinq secondes (`gardesTexteColle`). `indexOf` répond mille fois
      // plus vite que la même question posée à un moteur d'expressions.
      // Une clé composée porte forcément un point ET un délimiteur de chaîne.
      if (!ligne.includes('.')) return;
      const aCitation = ligne.includes("'") || ligne.includes('"');
      const aGabarit = ligne.includes('${') && ligne.includes('`');
      const aConcat = aCitation && ligne.includes('+');
      const aDeclaration =
        aCitation && (ligne.includes('const ') || ligne.includes('let ') || ligne.includes('var '));
      if (!aGabarit && !aConcat && !aDeclaration && !aAppel(ligne)) return;
      const site = `${chemin}:${index + 1}`;

      // Forme 1 — le gabarit.
      if (aGabarit) for (const m of ligne.matchAll(GABARIT)) {
        const prefixe = m[1];
        const gabarit = gabaritEntier(ligne, m.index ?? 0);
        const corps = gabarit === null ? [] : interpolations(gabarit);
        const valeurs = corps.length === 1 ? valeursLitterales(corps[0]) : null;
        if (!siteDeTraduction(lignes, index)) continue;
        if (valeurs) {
          // 🔴 Resserrement : on sait exactement ce que ce gabarit produit.
          for (const v of valeurs) enumerees.set(`${prefixe}${v}`, site);
        } else noter(prefixe, site);
      }

      // Forme 2 — la concaténation.
      if (aConcat) for (const m of ligne.matchAll(CONCAT)) {
        if (siteDeTraduction(lignes, index)) noter(m[2], site);
      }

      // Forme 3 — la constante, retenue seulement si elle COMPOSE ensuite.
      if (aDeclaration) {
        for (const m of ligne.matchAll(CONSTANTE)) constantes.set(m[1], { prefixe: m[3], site });
      }

      // Forme 4 — le préfixe passé en argument.
      if (appelsComposeuses && aAppel(ligne)) {
        for (const m of ligne.matchAll(appelsComposeuses)) noter(`${m[2]}.`, site);
      }
    });

    for (const [nom, { prefixe, site }] of constantes) {
      const compose = new RegExp(
        `\\$\\{${nom}\\}(?:\\$\\{|[a-zA-Z0-9_.])|(?<![\\w$])${nom}\\s*\\+|(?<![\\w$])${nom}\\.concat\\(`
      );
      if (compose.test(texte)) noter(prefixe, site);
    }
  }

  // Dernier filtre : un préfixe qu'aucune clé déclarée ne porte n'exempte rien.
  /** @type {Map<string, string[]>} */
  const prefixes = new Map();
  for (const [prefixe, sites] of brut) {
    if ([...declarees].some((k) => k.startsWith(prefixe) && k.length > prefixe.length)) {
      prefixes.set(prefixe, sites);
    }
  }
  return { prefixes, enumerees };
}

/**
 * Les clés écrites EN ENTIER quelque part sous `racine`, tests compris.
 *
 * 🔴 Les tests comptent comme des références. Une clé que seul
 * `src/lib/__tests__` cite n'est pas orpheline : la supprimer casserait ce
 * témoin, et c'est souvent le témoin qui garde la clé vivante pour un écran que
 * le contrôle ne sait pas lire.
 *
 * @param {string} racine
 * @returns {Map<string, string>} clé -> premier site qui l'écrit
 */
export function clesLitterales(racine) {
  /** @type {Map<string, string>} */
  const vues = new Map();
  for (const { chemin, texte } of fichiersLus(racine)) {
    texte.split('\n').forEach((ligne, index) => {
      // Une clé porte un point ; sans lui, rien à chercher sur cette ligne.
      if (!ligne.includes('.')) return;
      if (ligne.includes("'") || ligne.includes('"')) {
        for (const m of ligne.matchAll(LITTERAL_CLE)) {
          if (!vues.has(m[2])) vues.set(m[2], `${chemin}:${index + 1}`);
        }
      }
      if (!ligne.includes('`') || !APPEL_T.test(ligne)) return;
      for (const m of ligne.matchAll(LITTERAL_GABARIT)) {
        if (!vues.has(m[1])) vues.set(m[1], `${chemin}:${index + 1}`);
      }
    });
  }
  return vues;
}
