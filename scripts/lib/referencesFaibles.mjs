/**
 * Les références qui GARDENT UNE CLÉ VIVANTE SANS L'AFFICHER.
 *
 * ── POURQUOI CE MODULE EXISTE ────────────────────────────────────────────
 *
 * `check-i18n.mjs` refuse depuis le 26/09 une clé déclarée que personne
 * n'appelle, plafond à zéro. Il décide « appelée » par `clesLitterales()` :
 * la clé est écrite EN ENTIER quelque part sous `src`. C'est volontairement
 * généreux — un témoin compte comme une référence, parce que c'est souvent le
 * témoin qui garde vivante la clé d'un écran que le contrôle ne sait pas lire.
 *
 * Généreux, mais pas gratuit : trois façons d'écrire une clé la rendent
 * vivante aux yeux de la porte SANS que le moindre pixel s'affiche. Mesurées
 * le 27/09/2026 sur `main`, pas supposées :
 *
 *   (a) UN COMMENTAIRE SUFFIT. `clesLitterales` exclut déjà la forme entre
 *       accents graves, et son commentaire dit pourquoi — « compter une prose
 *       comme une référence, c'est offrir un moyen d'éteindre cette garde ».
 *       Mais elle accepte sans condition la forme entre GUILLEMETS, y compris
 *       dans un commentaire, y compris dans un fichier de production. Trois
 *       clés ne vivaient que par là — et l'un des trois commentaires est FAUX :
 *       `forcerImagesArtistes.test.ts` affirme que l'infobulle a été
 *       « RÉIMPLÉMENTÉE via `use:tip={'tip.rescanArtwork'}` », alors qu'aucun
 *       `use:tip` de ce genre n'existe sur `main`.
 *
 *   (b) UNE ASSERTION D'ABSENCE MAINTIENT LA CLÉ EN VIE. C'est l'exact
 *       contraire d'une référence : `expect(settingsV2).not.toContain(
 *       'settings.crossfadeHint')` dit que cette clé n'est PAS rendue, et cet
 *       aveu-là suffisait à la déclarer vivante.
 *
 *   (c) 🔴 DU CODE DE PRODUCTION MORT. Le pire, et celui qu'aucune mesure ne
 *       voyait, parce qu'il ne vit pas dans `__tests__`. Le cas qui a motivé ce
 *       mécanisme : `volumeLockLabelKey()` et `volumeLockOriginKey()`
 *       (`lib/audiophileLockBadge.ts`) rendaient quatre clés
 *       `devices.volumeLock*` en clair, et `volumeLockBadge()` n'avait aucun
 *       appelant de production, seulement son témoin. Une clé rangée dans une
 *       fonction exportée que personne n'appelle est indistinguable d'une clé
 *       affichée.
 *
 *       ✅ CE CAS-LÀ EST RÉPARÉ depuis le 27/09/2026 : le badge de verrou est
 *       remonté sur la carte de zone (`components/v2/BadgeVerrouVolumeZone.svelte`)
 *       et les quatre clés s'affichent pour de vrai — le plafond `fonctionMorte`
 *       est passé de 20 à 16. L'exemple reste écrit ici parce qu'il dit ce que le
 *       mécanisme cherche ; il ne décrit plus l'état de l'arbre.
 *
 * ── CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS ───────────────────────
 *
 * (a) et (b) sont de l'ANALYSE DE TEXTE : on peut être exact, et on l'est.
 *
 * (c) est de l'ATTEIGNABILITÉ, et une analyse complète est hors de portée d'un
 * contrôleur de ce genre. On tient donc une approximation NOMMÉE, volontairement
 * prudente — elle rate des fonctions mortes plutôt que d'en inventer :
 *
 *   - seuls les modules `.ts`/`.js` de `src` sont découpés en fonctions ; un
 *     `.svelte` est traité comme un bloc d'appels, jamais comme du code mort ;
 *   - l'atteignabilité est NOMINALE, pas fondée sur le graphe d'imports : deux
 *     modules qui exportent le même nom sont confondus, et le vivant sauve le
 *     mort. Prudent, dans le bon sens ;
 *   - une citation dans `__tests__` ne rend RIEN vivant — c'est tout le sujet ;
 *   - une citation dans un commentaire non plus, sinon (a) rouvrirait par (c) ;
 *   - une citation dans un `import` non plus : importer n'est pas appeler ;
 *   - la racine est le code hors fonction (il s'exécute à l'import) et tout
 *     `.svelte` ; de là on propage par point fixe.
 *
 * 🔴 CE QU'IL NE VOIT PAS, ET IL FAUT LE DIRE :
 *
 *   - un appel INDIRECT — `table[clef]()`, `fn.call()`, un réexport sous un
 *     autre nom, un `import()` dynamique : la fonction paraît morte à tort, et
 *     ce serait un faux positif. Aucun cas sur `main` au 27/09, mais la forme
 *     existe ;
 *   - une fonction vivante appelée depuis un `.svelte` lui-même INATTEIGNABLE
 *     (composant jamais monté) : elle paraît vivante à tort ;
 *   - une clé rangée hors de toute fonction, dans un module que personne
 *     n'importe : invisible à (c) ;
 *   - une méthode de classe, un export par défaut, une fonction anonyme
 *     affectée autrement que par `const nom = (…) =>` ;
 *   - un composant `.svelte` entier jamais routé : ses clés passent pour vives.
 *
 * Et une limite qui vaut pour les trois : une ligne portant un littéral
 * d'expression régulière avec un guillemet — `/['"]/` — est lue comme une chaîne
 * jamais refermée, et le commentaire qui la suit SUR CETTE LIGNE n'est pas vu.
 * Le dégât s'arrête là : l'état des chaînes est remis à zéro à chaque fin de
 * ligne. Le témoin le dit à voix haute plutôt que de prétendre l'inverse.
 */
import { fichiersLus } from './prefixesDynamiques.mjs';

/** La tête statique d'une clé : `devices.volumeLockOn`, `v2.sources.etat`. */
const TETE = '[a-z][a-zA-Z0-9]*(?:\\.[a-zA-Z0-9_]+)+';

/** Un littéral de clé entier, les deux guillemets du même genre. */
const LITTERAL_CLE = new RegExp(`(['"])(${TETE})\\1`, 'g');

/** Une déclaration de fonction nommée, exportée ou non. */
const FONCTION = new RegExp(
  '(?:^|[^\\w$.])(?:export\\s+)?(?:async\\s+)?function\\s*\\*?\\s*([A-Za-z_$][\\w$]*)\\s*(?:<[^>]*>)?\\s*\\(' +
    '|(?:^|[^\\w$.])(?:export\\s+)?(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=\\n]*)?=\\s*(?:async\\s*)?(?:<[^>]*>\\s*)?\\(',
  'g'
);

/** Une ligne d'import ou de réexport : citer un nom là n'est pas l'appeler. */
const IMPORTATION = /^\s*(?:import\b|export\s*(?:\{|\*))/;

/* ------------------------------------------------------------------------- *
 * 1. Les commentaires, repérés par un vrai balayage.
 * ------------------------------------------------------------------------- */

/**
 * Les seuls endroits où l'état peut changer : une ouverture de chaîne, de
 * gabarit, ou de commentaire.
 *
 * 🔴 Une affaire de coût, encore. Avancer d'un caractère à la fois sur les
 * 10,6 Mo de `src` coûtait 0,9 s à ce seul balayage — plus que les trois
 * détections réunies. Le moteur d'expressions régulières saute d'un jeton au
 * suivant en code natif ; seul l'intérieur des chaînes reste parcouru à la
 * main, et il ne pèse presque rien.
 */
const INTERESSANT = /['"`]|\/\/|\/\*|<!--/g;

/**
 * Les plages de commentaire de `texte`, en décalages absolus.
 *
 * 🔴 L'état des chaînes `'…'` et `"…"` est REMIS À ZÉRO à chaque fin de ligne.
 * Une expression régulière comme `/['"]/` désynchronise n'importe quel
 * balayeur naïf ; borner la désynchronisation à la ligne où elle naît empêche
 * qu'une seule ligne tordue fabrique un faux commentaire trente lignes plus
 * bas. Les blocs `/* … *\/` et les gabarits, eux, traversent les lignes pour de
 * vrai et sont donc suivis d'une ligne à l'autre.
 *
 * Un gabarit est OPAQUE : on n'y cherche pas de commentaire. Cela évite de
 * prendre le `//` d'une URL pour une fin de ligne commentée.
 *
 * @param {string} texte
 * @returns {[number, number][]} plages `[début, fin)` triées
 */
export function plagesDeCommentaire(texte) {
  /** @type {[number, number][]} */
  const plages = [];
  const n = texte.length;
  let i = 0;

  for (;;) {
    INTERESSANT.lastIndex = i;
    const m = INTERESSANT.exec(texte);
    if (!m) break;
    i = m.index;
    const jeton = m[0];

    if (jeton === "'" || jeton === '"') {
      // Chaîne bornée à la LIGNE : une chaîne non refermée — ou un `/['"]/`
      // pris pour une ouverture — ne contamine pas la suite du fichier.
      let j = i + 1;
      while (j < n) {
        const c = texte[j];
        if (c === '\\') j += 2;
        else if (c === jeton || c === '\n') break;
        else j++;
      }
      i = texte[j] === jeton ? j + 1 : j;
      continue;
    }
    if (jeton === '`') {
      // Gabarit OPAQUE, et multiligne : on n'y cherche pas de commentaire, ce
      // qui évite de prendre le `//` d'une URL pour une fin de ligne commentée.
      let j = i + 1;
      while (j < n) {
        const c = texte[j];
        if (c === '\\') j += 2;
        else if (c === '`') break;
        else j++;
      }
      i = j + 1;
      continue;
    }
    if (jeton === '//') {
      const f = texte.indexOf('\n', i);
      plages.push([i, f === -1 ? n : f]);
      i = f === -1 ? n : f;
      continue;
    }
    if (jeton === '/*') {
      const f = texte.indexOf('*/', i + 2);
      const fin = f === -1 ? n : f + 2;
      plages.push([i, fin]);
      i = fin;
      continue;
    }
    // `<!--` : commentaire de balisage Svelte.
    const f = texte.indexOf('-->', i);
    const fin = f === -1 ? n : f + 3;
    plages.push([i, fin]);
    i = fin;
  }
  return plages;
}

/**
 * Les plages de commentaire d'un fichier, mémorisées : les deux passes de (c)
 * et la passe des littéraux posent la même question au même fichier.
 *
 * @type {Map<string, [number, number][]>}
 */
const plagesConnues = new Map();

/**
 * @param {string} chemin
 * @param {string} texte
 * @returns {[number, number][]}
 */
function plagesDe(chemin, texte) {
  let p = plagesConnues.get(chemin);
  if (!p) {
    p = plagesDeCommentaire(texte);
    plagesConnues.set(chemin, p);
  }
  return p;
}

/**
 * Le même texte, COMMENTAIRES BLANCHIS — mêmes décalages, mêmes lignes.
 *
 * 🔴 C'est une affaire de coût, et le coût de ce contrôleur est une contrainte
 * du dépôt. La première version appariait les accolades du corps d'une fonction
 * en demandant « suis-je dans un commentaire ? » À CHAQUE CARACTÈRE, soit une
 * recherche dichotomique par caractère sur les huit mégaoctets de `src`. En
 * blanchissant une fois par fichier, l'appariement redevient une comparaison de
 * caractères, et les expressions régulières ne peuvent plus apparier dans un
 * commentaire — la question ne se pose plus du tout.
 *
 * Les retours à la ligne sont conservés : les numéros de ligne restent justes.
 *
 * @type {Map<string, string>}
 */
const codes = new Map();

/**
 * @param {string} chemin
 * @param {string} texte
 * @returns {string}
 */
function codeSeul(chemin, texte) {
  let code = codes.get(chemin);
  if (code !== undefined) return code;
  const plages = plagesDe(chemin, texte);
  if (plages.length === 0) code = texte;
  else {
    const morceaux = [];
    let precedent = 0;
    for (const [d, f] of plages) {
      const commentaire = texte.slice(d, f);
      morceaux.push(
        texte.slice(precedent, d),
        // La grande majorité des plages sont des `//` d'une seule ligne :
        // `repeat` y suffit, et évite une expression régulière par plage — il y
        // en a 29 457 sur `src`.
        commentaire.includes('\n') ? commentaire.replace(/[^\n]/g, ' ') : ' '.repeat(f - d)
      );
      precedent = f;
    }
    morceaux.push(texte.slice(precedent));
    code = morceaux.join('');
  }
  codes.set(chemin, code);
  return code;
}

/**
 * Les mêmes plages, triées et FUSIONNÉES.
 *
 * `dans()` cherche par dichotomie, ce qui suppose des plages disjointes. Les
 * corps de fonction, eux, s'imbriquent : une fonction morte déclarée dans une
 * autre fonction morte donne deux plages emboîtées, et la dichotomie répondait
 * alors « non » pour un décalage pourtant couvert.
 *
 * @param {[number, number][]} plages
 * @returns {[number, number][]}
 */
function fusionner(plages) {
  if (plages.length < 2) return plages;
  const triees = [...plages].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  /** @type {[number, number][]} */
  const sortie = [triees[0]];
  for (const [d, f] of triees.slice(1)) {
    const derniere = sortie[sortie.length - 1];
    if (d <= derniere[1]) derniere[1] = Math.max(derniere[1], f);
    else sortie.push([d, f]);
  }
  return sortie;
}

/**
 * @param {[number, number][]} plages triées et disjointes
 * @returns {(index: number) => boolean} par recherche dichotomique
 */
function dans(plages) {
  return (index) => {
    let bas = 0;
    let haut = plages.length - 1;
    while (bas <= haut) {
      const milieu = (bas + haut) >> 1;
      const [d, f] = plages[milieu];
      if (index < d) haut = milieu - 1;
      else if (index >= f) bas = milieu + 1;
      else return true;
    }
    return false;
  };
}

/* ------------------------------------------------------------------------- *
 * 2. Les assertions d'ABSENCE.
 * ------------------------------------------------------------------------- */

/** `.not.toContain(…)`, `.not.toMatch(…)` — la négation précède la clé. */
const NEGATION = /\.\s*not\s*\.\s*to/;

/** Un matcher qui affirme le VIDE, quand la clé est dans l'argument d'`expect`. */
const MATCHER_ABSENT =
  /^\s*\.\s*(?:toBeUndefined\s*\(\s*\)|toBeNull\s*\(\s*\)|toBeFalsy\s*\(\s*\)|toHaveLength\s*\(\s*0\s*\)|toBe\s*\(\s*(?:undefined|null|0|false)\s*\))/;

/**
 * La fin de l'argument d'`expect(` ouvert à `debut`, par appariement de
 * parenthèses en ignorant celles des chaînes.
 *
 * @param {string} texte
 * @param {number} debut index du `(` d'`expect(`
 * @returns {number} index du `)` fermant, ou `-1`
 */
function finArgument(texte, debut) {
  let profondeur = 0;
  for (let i = debut; i < texte.length; i++) {
    const c = texte[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < texte.length && texte[i] !== q) i += texte[i] === '\\' ? 2 : 1;
      continue;
    }
    if (c === '(') profondeur++;
    else if (c === ')') {
      profondeur--;
      if (profondeur === 0) return i;
    }
  }
  return -1;
}

/**
 * La clé écrite à `index` dans `contexte` n'est-elle QU'UNE ASSERTION
 * D'ABSENCE ?
 *
 * Deux formes, et seulement celles-là :
 *   - `expect(x).not.toContain('cle')` — la négation est écrite AVANT la clé ;
 *   - `expect(f(fr['cle'])).toBeUndefined()` — la clé est dans l'argument
 *     d'`expect`, et le matcher affirme le vide.
 *
 * Une assertion normale — `expect(html).toContain('cle')`, `expect(fr['cle'])
 * .toBeDefined()` — reste une vraie référence. C'est le second sens de la
 * preuve, et sans lui une détection vide passerait pour une garde.
 *
 * @param {string} contexte l'instruction, éventuellement sur plusieurs lignes
 * @param {number} index position de la clé dans `contexte`
 * @returns {boolean}
 */
export function estAssertionDAbsence(contexte, index) {
  if (!contexte.includes('expect')) return false;
  if (NEGATION.test(contexte.slice(0, index))) return true;

  let depuis = 0;
  for (;;) {
    const e = contexte.indexOf('expect(', depuis);
    if (e === -1) return false;
    const ouvre = e + 'expect'.length;
    const ferme = finArgument(contexte, ouvre);
    depuis = ouvre + 1;
    if (ferme === -1) continue;
    if (index > ouvre && index < ferme) return MATCHER_ABSENT.test(contexte.slice(ferme + 1));
  }
}

/* ------------------------------------------------------------------------- *
 * 3. Le code de production MORT.
 * ------------------------------------------------------------------------- */

/**
 * Les fonctions nommées de `texte`, avec l'étendue de leur corps.
 *
 * L'étendue va du `{` qui suit la signature à son `}` apparié ; une flèche sans
 * accolade (`const f = (x) => x + 1`) s'arrête en fin de ligne. Les chaînes et
 * les commentaires sont sautés pendant l'appariement, sinon une accolade dans
 * une phrase refermerait la fonction trop tôt.
 *
 * 🔴 `enTete` couvre la signature, du début du match au `(` des paramètres.
 * Sans elle, `export function volumeLockBadge(` se comptait COMME UN APPEL de
 * `volumeLockBadge` : la fonction se déclarait vivante toute seule, hors de tout
 * corps, donc à la racine. La première mesure annonçait ainsi « 0 fonction sans
 * appelant » sur 2 438 — un vert qui ne gardait rien.
 *
 * @param {string} texte le code COMMENTAIRES BLANCHIS (`codeSeul`) : une
 *   signature écrite dans un commentaire n'y apparaît plus, et l'appariement
 *   des accolades n'a plus à se demander où il est.
 * @returns {{nom: string, debut: number, fin: number, enTete: [number, number]}[]}
 */
export function fonctionsDe(texte) {
  /** @type {{nom: string, debut: number, fin: number, enTete: [number, number]}[]} */
  const trouvees = [];
  for (const m of texte.matchAll(FONCTION)) {
    const nom = m[1] ?? m[2];
    const depart = (m.index ?? 0) + m[0].length - 1; // le `(` des paramètres
    /** @type {[number, number]} */
    const enTete = [m.index ?? 0, depart];
    const finParams = finArgument(texte, depart);
    if (finParams === -1) continue;

    // Ce qui suit les paramètres : `{`, ou `: Type {`, ou `=> {`, ou `=> expr`.
    let i = finParams + 1;
    while (i < texte.length && texte[i] !== '{' && texte[i] !== '\n') i++;
    if (texte[i] !== '{') {
      // Flèche d'une seule expression : bornée à la ligne.
      let fin = texte.indexOf('\n', finParams);
      trouvees.push({ nom, debut: depart, fin: fin === -1 ? texte.length : fin, enTete });
      continue;
    }

    let profondeur = 0;
    let j = i;
    for (; j < texte.length; j++) {
      const c = texte[j];
      if (c === "'" || c === '"' || c === '`') {
        const q = c;
        j++;
        while (j < texte.length && texte[j] !== q) j += texte[j] === '\\' ? 2 : 1;
        continue;
      }
      if (c === '{') profondeur++;
      else if (c === '}' && --profondeur === 0) break;
    }
    trouvees.push({ nom, debut: depart, fin: Math.min(j + 1, texte.length), enTete });
  }
  return trouvees;
}

/** Un module `.ts`/`.js` de production : ni témoin, ni dictionnaire. */
const estProduction = (/** @type {string} */ chemin) =>
  !chemin.includes('__tests__') && !chemin.includes(`locales`) && !/\.test\.[tj]s$/.test(chemin);

/**
 * Les étendues des lignes d'`import` / de réexport de `texte`.
 *
 * @param {string} texte
 * @returns {[number, number][]}
 */
function lignesDImport(texte) {
  /** @type {[number, number][]} */
  const plages = [];
  let decalage = 0;
  for (const ligne of texte.split('\n')) {
    if (IMPORTATION.test(ligne)) plages.push([decalage, decalage + ligne.length]);
    decalage += ligne.length + 1;
  }
  return plages;
}

/**
 * Les fonctions dont le nom n'est atteint par AUCUNE racine de production.
 *
 * Racines : tout ce que cite un `.svelte`, et tout ce que cite un module hors
 * de ses propres fonctions (le code de premier niveau s'exécute à l'import).
 * Les commentaires et les `import` ne citent rien. Puis point fixe : une
 * fonction vivante rend vivant ce que son corps cite.
 *
 * @param {{chemin: string, texte: string}[]} fichiers
 * @returns {{mortes: Map<string, {chemin: string, debut: number, fin: number}[]>, total: number}}
 */
export function fonctionsSansAppelant(fichiers) {
  const production = fichiers.filter((f) => estProduction(f.chemin));

  /**
   * 🔴 `NOM` compte TOUT identifiant, `api.getIngestSettings` compris.
   *
   * La première version excluait un identifiant précédé d'un point, pour ne
   * lire que les appels nus. Elle déclarait donc mortes les trente fonctions de
   * `lib/api/ingest.ts` et `lib/api/metadata.ts`, appelées partout sous la forme
   * `api.applyIngest(…)` : 862 fonctions « sans appelant » sur 2 438, soit plus
   * du tiers de l'arbre — un chiffre qui n'aurait tenu devant personne. Le motif
   * actuel compte aussi une citation dans une chaîne : on rate ainsi des
   * fonctions mortes, et c'est le sens dans lequel il faut se tromper.
   */
  const NOM = /(?<![\w$])[A-Za-z_$][\w$]*(?![\w$])/g;

  /** @type {Map<string, {chemin: string, debut: number, fin: number, cite: Set<string>}[]>} */
  const declarees = new Map();
  /** @type {Map<string, {nom: string, debut: number, fin: number, enTete: [number, number]}[]>} */
  const parFichier = new Map();

  // Passe 1 — les déclarations. Il faut les connaître TOUTES avant de lire les
  // citations : c'est ce qui permet d'écarter d'un `has`, avant toute autre
  // question, la grande majorité des 374 645 identifiants de l'arbre — ceux qui
  // ne nomment aucune fonction.
  for (const { chemin, texte } of production) {
    if (chemin.endsWith('.svelte')) continue;
    const fonctions = fonctionsDe(codeSeul(chemin, texte));
    parFichier.set(chemin, fonctions);
    for (const f of fonctions) {
      const liste = declarees.get(f.nom) ?? [];
      liste.push({ chemin, debut: f.debut, fin: f.fin, cite: new Set() });
      declarees.set(f.nom, liste);
    }
  }

  // Passe 2 — les citations, attribuées à la fonction la plus INTÉRIEURE qui
  // les contient. Les décalages croissent, donc un balayage à pile suffit :
  // interroger chaque étendue pour chaque identifiant coûtait le carré.
  /** @type {Set<string>} */
  const racines = new Set();

  for (const { chemin, texte } of production) {
    const svelte = chemin.endsWith('.svelte');
    const fonctions = svelte ? [] : (parFichier.get(chemin) ?? []);
    const tries = [...fonctions].sort((a, b) => a.debut - b.debut);
    const signatures = fusionner(tries.map((f) => f.enTete));
    const dansUneSignature = dans(signatures);

    let prochaine = 0;
    /** @type {{nom: string, debut: number, fin: number}[]} */
    const pile = [];
    /** Les étendues sont bien imbriquées : la pile se dépile par le haut. */
    const hoteDe = (/** @type {number} */ index) => {
      while (prochaine < tries.length && tries[prochaine].debut <= index) pile.push(tries[prochaine++]);
      while (pile.length > 0 && pile[pile.length - 1].fin <= index) pile.pop();
      return pile.length > 0 ? pile[pile.length - 1] : null;
    };

    // Le code blanchi : un nom cité dans un commentaire a déjà disparu. On
    // l'apparie d'UN SEUL COUP, pas ligne à ligne : la même recherche relancée
    // 257 000 fois coûtait deux fois plus cher pour le même résultat.
    const code = codeSeul(chemin, texte);
    const estUnImport = dans(lignesDImport(code));
    for (const m of code.matchAll(NOM)) {
      const nom = m[0];
      if (!declarees.has(nom)) continue; // ne nomme aucune fonction
      const index = m.index ?? 0;
      if (estUnImport(index)) continue; // importer n'est pas appeler
      if (!svelte && dansUneSignature(index)) continue;
      const hote = svelte ? null : hoteDe(index);
      if (!hote) {
        racines.add(nom); // premier niveau, ou balisage : ça s'exécute
        continue;
      }
      if (hote.nom === nom) continue;
      for (const d of declarees.get(hote.nom) ?? []) {
        if (d.chemin === chemin && d.debut === hote.debut) d.cite.add(nom);
      }
    }
  }

  // Point fixe : une fonction vivante rend vivant ce que son corps cite.
  const vivantes = new Set([...racines].filter((n) => declarees.has(n)));
  for (const nom of vivantes) {
    for (const d of declarees.get(nom) ?? []) {
      for (const cite of d.cite) if (declarees.has(cite)) vivantes.add(cite);
    }
  }

  /** @type {Map<string, {chemin: string, debut: number, fin: number}[]>} */
  const mortes = new Map();
  let total = 0;
  for (const [nom, liste] of declarees) {
    total += liste.length;
    if (!vivantes.has(nom)) mortes.set(nom, liste);
  }
  return { mortes, total };
}

/* ------------------------------------------------------------------------- *
 * 4. Le verdict.
 * ------------------------------------------------------------------------- */

/**
 * Les trois mécanismes, dans l'ordre où une clé leur est attribuée. Un seul
 * par clé : les trois comptes s'additionnent sans jamais se recouvrir, et le
 * témoin `referencesFaiblesI18n.test.ts` le vérifie.
 */
export const MECANISMES = /** @type {const} */ ([
  'fonctionMorte',
  'commentaire',
  'assertionAbsence',
]);

/**
 * Les clés que l'un des trois mécanismes garde vivantes, par mécanisme.
 *
 * 🔴 DEUX SÉMANTIQUES, ET IL FAUT LE DIRE PLUTÔT QUE DE LES MÉLANGER.
 *
 * `commentaire` et `assertionAbsence` exigent qu'AUCUN site solide ne subsiste.
 * Une clé nommée dans un commentaire et par ailleurs correctement affichée
 * n'est pas une dette : la signaler serait un faux positif, et c'est le second
 * sens de la preuve.
 *
 * `fonctionMorte`, non. Le site EST du code de production sans appelant : la
 * dette existe quoi qu'il arrive à la clé ailleurs. C'est pour cela que les
 * quatre `devices.volumeLock*` ÉTAIENT comptées, alors qu'un tableau de leur
 * témoin les nommait aussi — ce tableau ne prouvait rien, sa boucle d'assertion
 * était VIDE (`verrouVolumeBadgeAppareil.test.ts`). Si l'on exigeait ici
 * l'absence de site solide, le mécanisme le plus grave des trois serait
 * justement celui qu'on ne verrait pas.
 *
 * (Ces quatre clés sont sorties du compte le 27/09/2026 : leur fonction a
 * retrouvé son appelant, et la boucle du témoin a été remplie. La règle, elle,
 * ne change pas — c'est elle qui avait rendu le défaut visible.)
 *
 * @param {string} racine
 * @returns {{faibles: Map<string, {mecanisme: string, site: string}>, fonctionsMortes: number, fonctionsTotal: number}}
 */
export function referencesFaibles(racine) {
  const fichiers = fichiersLus(racine);
  const { mortes, total } = fonctionsSansAppelant(fichiers);

  /** Les corps morts, indexés par fichier et triés — un balayage, pas un carré. */
  /** @type {Map<string, [number, number][]>} */
  const mortsParFichier = new Map();
  for (const [, liste] of mortes) {
    for (const d of liste) {
      const plages = mortsParFichier.get(d.chemin) ?? [];
      plages.push([d.debut, d.fin]);
      mortsParFichier.set(d.chemin, plages);
    }
  }
  for (const [chemin, plages] of mortsParFichier) mortsParFichier.set(chemin, fusionner(plages));

  /** @type {Map<string, {faiblesses: Set<string>, sites: Map<string, string>, solide: boolean}>} */
  const parCle = new Map();

  for (const { chemin, texte } of fichiers) {
    if (!texte.includes('.')) continue;
    if (!texte.includes("'") && !texte.includes('"')) continue;

    const estCommentaire = dans(plagesDe(chemin, texte));
    const estDansUnCorpsMort = dans(mortsParFichier.get(chemin) ?? []);

    const lignes = texte.split('\n');
    let decalage = 0;
    lignes.forEach((ligne, index) => {
      const base = decalage;
      decalage += ligne.length + 1;
      if (!ligne.includes('.')) return;
      if (!ligne.includes("'") && !ligne.includes('"')) return;

      for (const m of ligne.matchAll(LITTERAL_CLE)) {
        const cle = m[2];
        const position = base + (m.index ?? 0);
        const site = `${chemin}:${index + 1}`;

        /** @type {string | null} */
        let faiblesse = null;
        if (estCommentaire(position)) faiblesse = 'commentaire';
        else if (estDansUnCorpsMort(position)) faiblesse = 'fonctionMorte';
        else {
          // L'instruction : la ligne, et jusqu'à trois lignes au-dessus quand
          // `expect(` s'y trouve — une assertion tient souvent sur plusieurs.
          let debut = index;
          while (debut > index - 3 && debut > 0 && !lignes[debut].includes('expect')) debut--;
          const contexte = lignes.slice(debut, index + 3).join('\n');
          const dansContexte =
            lignes.slice(debut, index).reduce((n, l) => n + l.length + 1, 0) + (m.index ?? 0);
          if (estAssertionDAbsence(contexte, dansContexte)) faiblesse = 'assertionAbsence';
        }

        let etat = parCle.get(cle);
        if (!etat) {
          etat = { faiblesses: new Set(), sites: new Map(), solide: false };
          parCle.set(cle, etat);
        }
        if (faiblesse === null) etat.solide = true;
        else {
          etat.faiblesses.add(faiblesse);
          if (!etat.sites.has(faiblesse)) etat.sites.set(faiblesse, site);
        }
      }
    });
  }

  /** @type {Map<string, {mecanisme: string, site: string}>} */
  const faibles = new Map();
  for (const [cle, etat] of parCle) {
    // `fonctionMorte` d'abord, et sans condition : le site est du code mort.
    if (etat.faiblesses.has('fonctionMorte')) {
      faibles.set(cle, { mecanisme: 'fonctionMorte', site: etat.sites.get('fonctionMorte') ?? '?' });
      continue;
    }
    if (etat.solide) continue; // un vrai affichage subsiste : rien à signaler
    const mecanisme = MECANISMES.find((m) => etat.faiblesses.has(m));
    if (!mecanisme) continue;
    faibles.set(cle, { mecanisme, site: etat.sites.get(mecanisme) ?? '?' });
  }
  return { faibles, fonctionsMortes: mortes.size, fonctionsTotal: total };
}
