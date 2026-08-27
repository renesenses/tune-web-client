/**
 * Petit moteur de cascade CSS, appliqué à la feuille de styles RÉELLE d'un
 * composant Svelte.
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * Plusieurs promesses faites aux testeurs ne tiennent qu'à une déclaration CSS
 * (« l'icône doit rester visible au doigt », « un appui sur la pochette doit
 * ouvrir la fiche »). Sous jsdom, aucun test de RENDU ne les atteint : ni les
 * requêtes de média, ni la cascade, ni `:hover` n'y sont appliqués — un tel
 * test serait vert quoi qu'il arrive, c'est-à-dire une fausse preuve.
 *
 * Ce module résout donc la cascade À LA MAIN sur le fichier livré. Il prouve
 * que **la feuille déclare bien ce qui a été promis** ; il ne prouve pas le
 * rendu pixel d'un navigateur, qui demanderait un test de bout en bout absent
 * de ce dépôt.
 *
 * Extrait de `nowPlayingPaliers.ts` (qui n'en gardait que la `max-width`) pour
 * servir aussi aux propriétés d'interaction : `opacity`, `pointer-events`.
 */

/** Écran considéré, en pixels CSS. */
export interface Ecran {
  largeur: number;
  hauteur: number;
}

/** Une déclaration relevée dans la feuille. */
export interface RegleCss {
  /** Condition de la requête de média englobante, `null` au premier niveau. */
  media: string | null;
  /** Sélecteur simple (les listes séparées par virgule sont éclatées). */
  selecteur: string;
  /** Propriété déclarée, en minuscules. */
  propriete: string;
  /** Valeur brute déclarée, p. ex. `1200px`, `0.55` ou `none`. */
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

/** Valeurs déclarées pour `propriete` dans un corps de règle, dans l'ordre. */
function declarationsDe(corps: string, proprietes: ReadonlySet<string>): { propriete: string; valeur: string }[] {
  const trouvees: { propriete: string; valeur: string }[] = [];
  for (const declaration of corps.split(';')) {
    const separation = declaration.indexOf(':');
    if (separation === -1) continue;
    const propriete = declaration.slice(0, separation).trim().toLowerCase();
    if (!proprietes.has(propriete)) continue;
    trouvees.push({
      propriete,
      valeur: declaration.slice(separation + 1).replace(/!important/i, '').trim(),
    });
  }
  return trouvees;
}

/**
 * Relève toutes les déclarations des `proprietes` demandées, au premier niveau
 * comme à l'intérieur des requêtes de média. Les autres règles-@ (`@keyframes`
 * en particulier, dont le corps contient lui aussi des accolades) sont
 * enjambées en bloc pour ne pas désynchroniser la lecture.
 */
export function releverDeclarations(css: string, proprietes: readonly string[]): RegleCss[] {
  const voulues = new Set(proprietes.map((p) => p.toLowerCase()));
  const propre = retirerCommentaires(css);
  const regles: RegleCss[] = [];
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
          for (const { propriete, valeur } of declarationsDe(corps, voulues)) {
            regles.push({ media, selecteur, propriete, valeur, ordre: (ordre += 1) });
          }
        }
      }

      i = fermeture + 1;
    }
  };

  parcourir(propre, null);
  return regles;
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

/** Vrai si le sélecteur ne s'applique qu'un pointeur survolant l'élément. */
export function exigeSurvol(selecteur: string): boolean {
  return /:hover\b/i.test(selecteur);
}

/** Conditions dans lesquelles on résout la cascade. */
export interface Contexte {
  ecran: Ecran;
  /**
   * `false` = appareil tactile, ou pointeur ailleurs sur la page : les règles
   * en `:hover` ne s'appliquent pas. C'est la situation exacte que décrivent
   * les deux signalements #1081 et #55.
   */
  survol: boolean;
}

/**
 * Règle gagnante de la cascade pour une propriété donnée, parmi la liste
 * EXHAUSTIVE des sélecteurs de la feuille qui visent l'élément considéré.
 *
 * On écarte les règles dont la requête de média ne s'applique pas, et celles
 * en `:hover` quand le contexte est sans survol ; on garde ensuite la
 * spécificité la plus forte, l'ordre de la feuille départageant à égalité.
 * Rend `null` si aucune règle ne s'applique.
 */
export function regleEffective(
  regles: readonly RegleCss[],
  selecteursApplicables: readonly string[],
  propriete: string,
  contexte: Contexte,
): RegleCss | null {
  const vises = new Set(selecteursApplicables.map((s) => s.trim().replace(/\s+/g, ' ')));
  const voulue = propriete.toLowerCase();

  let gagnante: RegleCss | null = null;
  let meilleureSpecificite = -1;

  for (const regle of regles) {
    if (regle.propriete !== voulue) continue;
    if (!vises.has(regle.selecteur)) continue;
    if (!mediaSatisfait(regle.media, contexte.ecran)) continue;
    if (!contexte.survol && exigeSurvol(regle.selecteur)) continue;

    const poids = specificite(regle.selecteur);
    if (
      gagnante === null ||
      poids > meilleureSpecificite ||
      (poids === meilleureSpecificite && regle.ordre > gagnante.ordre)
    ) {
      gagnante = regle;
      meilleureSpecificite = poids;
    }
  }

  return gagnante;
}

/** Valeur effective d'une propriété, ou `null` si aucune règle ne s'applique. */
export function valeurEffective(
  regles: readonly RegleCss[],
  selecteursApplicables: readonly string[],
  propriete: string,
  contexte: Contexte,
): string | null {
  return regleEffective(regles, selecteursApplicables, propriete, contexte)?.valeur ?? null;
}
