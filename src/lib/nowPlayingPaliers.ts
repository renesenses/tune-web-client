/**
 * Paliers d'affichage de l'écran « Lecture en cours » sur très grands écrans.
 *
 * Alain Bonnel, forum fil 1077 — renesenses/tune-server-rust#2249. Il utilise
 * une TV 4K comme écran de son PC musique. On lui a répondu le 19/07/2026 que
 * l'écran « Lecture en cours » agrandirait « nettement la pochette ET la
 * largeur du contenu, la colonne titres compris ». Les deux paliers qui le
 * faisaient (`2400px` / `3200px`) ont disparu de `origin/main` à une
 * résolution de fusion vers la ligne v0.9.
 *
 * Le sujet est du CSS pur : rien à exécuter, donc rien qu'un test de
 * rendu pourrait observer sous jsdom, qui n'applique ni les requêtes de
 * média ni la cascade. Ce module rend malgré tout la promesse VÉRIFIABLE en
 * résolvant, à partir de la feuille de styles RÉELLE du composant, la
 * `max-width` effective d'un élément à une largeur d'écran donnée — c'est
 * exactement la grandeur dont Alain se plaint.
 *
 * On n'y déclare AUCUN palier en dur : tout est lu dans le fichier. Un test
 * fondé sur ce module devient donc rouge dès que les paliers repartent.
 */

/** Écran considéré, en pixels CSS. */
export interface Ecran {
  largeur: number;
  hauteur: number;
}

/** Une déclaration `max-width` trouvée dans la feuille. */
export interface RegleLargeur {
  /** Condition de la requête de média englobante, `null` au premier niveau. */
  media: string | null;
  /** Sélecteur simple (les listes séparées par virgule sont éclatées). */
  selecteur: string;
  /** Valeur brute déclarée, p. ex. `1200px` ou `100%`. */
  valeur: string;
  /** Rang d'apparition dans la feuille, pour départager à spécificité égale. */
  ordre: number;
}

/** Retire les commentaires CSS sans toucher au contenu des chaînes. */
function retirerCommentaires(css: string): string {
  let sortie = '';
  let i = 0;
  let guillemet: string | null = null;

  while (i < css.length) {
    const c = css[i];

    if (guillemet) {
      sortie += c;
      if (c === '\\') {
        sortie += css[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === guillemet) guillemet = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      guillemet = c;
      sortie += c;
      i += 1;
      continue;
    }

    if (c === '/' && css[i + 1] === '*') {
      const fin = css.indexOf('*/', i + 2);
      i = fin === -1 ? css.length : fin + 2;
      continue;
    }

    sortie += c;
    i += 1;
  }

  return sortie;
}

/**
 * Indice de l'accolade fermante appariée à `css[debut]`, en ignorant les
 * accolades situées dans une chaîne. Rend `-1` si la feuille est déséquilibrée.
 */
function accoladeFermante(css: string, debut: number): number {
  let profondeur = 0;
  let guillemet: string | null = null;

  for (let i = debut; i < css.length; i += 1) {
    const c = css[i];

    if (guillemet) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === guillemet) guillemet = null;
      continue;
    }

    if (c === '"' || c === "'") {
      guillemet = c;
      continue;
    }

    if (c === '{') profondeur += 1;
    else if (c === '}') {
      profondeur -= 1;
      if (profondeur === 0) return i;
    }
  }

  return -1;
}

/** Extrait le corps du bloc `<style>` d'un composant Svelte. */
export function extraireFeuilleDeStyle(source: string): string {
  const ouverture = source.indexOf('<style>');
  const fermeture = source.lastIndexOf('</style>');
  if (ouverture === -1 || fermeture === -1 || fermeture < ouverture) {
    throw new Error('bloc <style> introuvable');
  }
  return source.slice(ouverture + '<style>'.length, fermeture);
}

/**
 * Relève toutes les déclarations `max-width` de la feuille, au premier niveau
 * comme à l'intérieur des requêtes de média. Les autres règles-@ (`@keyframes`
 * en particulier, dont le corps contient lui aussi des accolades) sont
 * enjambées en bloc pour ne pas désynchroniser la lecture.
 */
export function releverReglesLargeur(css: string): RegleLargeur[] {
  const propre = retirerCommentaires(css);
  const regles: RegleLargeur[] = [];
  let ordre = 0;

  const parcourir = (portion: string, media: string | null): void => {
    let i = 0;
    while (i < portion.length) {
      const ouverture = portion.indexOf('{', i);
      if (ouverture === -1) return;

      const fermeture = accoladeFermante(portion, ouverture);
      if (fermeture === -1) return;

      const prelude = portion.slice(i, ouverture).trim();
      const corps = portion.slice(ouverture + 1, fermeture);

      if (prelude.startsWith('@media')) {
        parcourir(corps, prelude.slice('@media'.length).trim());
      } else if (!prelude.startsWith('@')) {
        for (const brut of prelude.split(',')) {
          const selecteur = brut.trim().replace(/\s+/g, ' ');
          if (!selecteur) continue;
          for (const valeur of declarationsMaxWidth(corps)) {
            regles.push({ media, selecteur, valeur, ordre: (ordre += 1) });
          }
        }
      }

      i = fermeture + 1;
    }
  };

  parcourir(propre, null);
  return regles;
}

/** Valeurs de `max-width` déclarées dans un corps de règle, dans l'ordre. */
function declarationsMaxWidth(corps: string): string[] {
  const valeurs: string[] = [];
  for (const declaration of corps.split(';')) {
    const separation = declaration.indexOf(':');
    if (separation === -1) continue;
    const propriete = declaration.slice(0, separation).trim().toLowerCase();
    if (propriete !== 'max-width') continue;
    valeurs.push(declaration.slice(separation + 1).replace(/!important/i, '').trim());
  }
  return valeurs;
}

/** Vrai si la condition de média s'applique à cet écran. */
export function mediaSatisfait(media: string | null, ecran: Ecran): boolean {
  if (media === null) return true;

  const conditions = media.split(/\band\b/i);
  return conditions.every((condition) => {
    const trouve = /\(\s*(min|max)-(width|height)\s*:\s*(-?\d+(?:\.\d+)?)px\s*\)/i.exec(condition);
    if (!trouve) return false; // condition non comprise : on ne suppose rien
    const [, borne, axe, brut] = trouve;
    const mesure = axe.toLowerCase() === 'width' ? ecran.largeur : ecran.hauteur;
    const seuil = Number(brut);
    return borne.toLowerCase() === 'min' ? mesure >= seuil : mesure <= seuil;
  });
}

/**
 * Spécificité d'un sélecteur, réduite au comparable : identifiants, puis
 * classes / attributs / pseudo-classes, puis éléments. `:global(…)` de Svelte
 * n'ajoute rien par lui-même — seul son contenu compte.
 */
export function specificite(selecteur: string): number {
  const dedie = selecteur.replace(/:global\(/gi, '(');
  const identifiants = (dedie.match(/#[\w-]+/g) ?? []).length;
  const classes =
    (dedie.match(/\.[\w-]+/g) ?? []).length +
    (dedie.match(/\[[^\]]*\]/g) ?? []).length +
    (dedie.match(/:(?!:)[\w-]+/g) ?? []).length;
  const elements = (dedie.match(/(?:^|[\s>+~(])([a-z][\w-]*)/gi) ?? []).length;
  return identifiants * 10000 + classes * 100 + elements;
}

/**
 * `max-width` effective, en pixels, d'un élément décrit par la liste EXHAUSTIVE
 * des sélecteurs de la feuille qui le visent, à l'écran donné.
 *
 * Cascade appliquée : on écarte les règles dont la requête de média ne
 * s'applique pas, on garde la spécificité la plus forte, et l'ordre de la
 * feuille départage à égalité. Rend `null` si aucune règle ne s'applique ou si
 * la valeur retenue n'est pas exprimée en pixels.
 */
export function largeurMaxEffective(
  regles: RegleLargeur[],
  selecteursApplicables: readonly string[],
  ecran: Ecran,
): number | null {
  const vises = new Set(selecteursApplicables.map((s) => s.trim().replace(/\s+/g, ' ')));

  let gagnante: RegleLargeur | null = null;
  let meilleureSpecificite = -1;

  for (const regle of regles) {
    if (!vises.has(regle.selecteur)) continue;
    if (!mediaSatisfait(regle.media, ecran)) continue;

    const poids = specificite(regle.selecteur);
    if (gagnante === null || poids > meilleureSpecificite || (poids === meilleureSpecificite && regle.ordre > gagnante.ordre)) {
      gagnante = regle;
      meilleureSpecificite = poids;
    }
  }

  if (gagnante === null) return null;
  const pixels = /^(-?\d+(?:\.\d+)?)px$/.exec(gagnante.valeur);
  return pixels ? Number(pixels[1]) : null;
}
