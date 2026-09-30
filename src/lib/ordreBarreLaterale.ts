/**
 * L'ordre de la barre latérale, choisi par l'utilisateur — web#1827.
 *
 * Demande de Bertrand du 30/09/2026 (point 4), avec son go : glisser-déposer
 * dans Réglages › Interface, monter / descendre au clavier, masquer une
 * entrée, « Rétablir l'ordre par défaut », rangé dans `ui_preferences`
 * (synchronisé serveur) sous `barreLaterale`.
 *
 * 🔴 L'ordre se règle À L'INTÉRIEUR d'un groupe. Les groupes de la barre
 * (`noyau`, `avance`, `selections`, `studio`) gardent leur place et leur
 * niveau d'affichage : une entrée Avancée ne se retrouve jamais dans le
 * noyau d'un débutant, et le principe de stabilité spatiale de la barre
 * (« le noyau ne bouge jamais d'un niveau à l'autre ») tient toujours.
 *
 * Trois règles qui protègent un ordre ENREGISTRÉ :
 *   - une entrée que ce client ne connaît pas (écrite par une version plus
 *     récente, ou retirée depuis) est écartée à l'affichage, sans erreur ;
 *   - une entrée NOUVELLE (livrée après l'enregistrement) apparaît à sa place
 *     par défaut : juste après la voisine qui la précède dans l'ordre livré ;
 *   - un doublon est retiré (la barre rend ses entrées par `{#each … (view)}`,
 *     qui refuse deux clés identiques — voir `chainesUniques`, #1775).
 *
 * Module sans dépendance : `stores/preferences` le lit, et ne doit pas tirer
 * la couche API (voir le commentaire de `profileHeader` là-bas).
 */

export type GroupeBarre = 'noyau' | 'avance' | 'selections' | 'studio';
export const GROUPES_BARRE: readonly GroupeBarre[] = ['noyau', 'avance', 'selections', 'studio'];

/** Accueil ne se masque pas. Réglages non plus, mais ce n'est pas une entrée
 *  de liste : c'est la roue de l'en-tête, qui ne se déplace pas. */
export const ENTREES_TOUJOURS_VISIBLES: readonly string[] = ['home'];

export interface ChoixBarre {
  /** L'ordre enregistré, groupe par groupe. Un groupe absent suit le défaut. */
  ordre: Partial<Record<GroupeBarre, string[]>>;
  /** Les vues masquées. Jamais Accueil. */
  masquees: string[];
}

function chaines(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const vues: string[] = [];
  for (const x of v) if (typeof x === 'string' && x && !vues.includes(x)) vues.push(x);
  return vues;
}

/**
 * Une valeur enregistrée — donc venue du SERVEUR : ses seuls groupes connus,
 * des listes de chaînes sans doublon ; `null` si ce n'est pas un objet.
 */
export function normaliserChoixBarre(v: unknown): ChoixBarre | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const ordre: ChoixBarre['ordre'] = {};
  const brut = o.ordre;
  if (brut && typeof brut === 'object' && !Array.isArray(brut)) {
    for (const g of GROUPES_BARRE) {
      const liste = (brut as Record<string, unknown>)[g];
      if (Array.isArray(liste)) ordre[g] = chaines(liste);
    }
  }
  const masquees = chaines(o.masquees).filter((vue) => !ENTREES_TOUJOURS_VISIBLES.includes(vue));
  return { ordre, masquees };
}

/**
 * Les entrées d'un groupe dans l'ordre enregistré.
 *
 * `defaut` est la liste LIVRÉE (déjà filtrée des entrées absentes : greffon
 * arrêté, etc.) ; `enregistre` l'ordre choisi. Sans ordre, `defaut` tel quel.
 */
export function ordonnerEntrees<T extends { view: string }>(
  defaut: readonly T[],
  enregistre: readonly string[] | undefined | null,
): T[] {
  if (!enregistre || !enregistre.length) return [...defaut];
  const parVue = new Map(defaut.map((it) => [it.view, it]));
  const resultat: T[] = [];
  for (const vue of enregistre) {
    const it = parVue.get(vue);
    if (it && !resultat.includes(it)) resultat.push(it);
  }
  // Les entrées que l'ordre enregistré ne connaît pas encore : chacune juste
  // après sa voisine par défaut déjà placée, sinon en tête.
  defaut.forEach((it, i) => {
    if (resultat.includes(it)) return;
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = resultat.indexOf(defaut[j]);
      if (k >= 0) { pos = k + 1; break; }
    }
    resultat.splice(pos, 0, it);
  });
  return resultat;
}

export function estMasquee(vue: string, choix: ChoixBarre | null | undefined): boolean {
  if (ENTREES_TOUJOURS_VISIBLES.includes(vue)) return false;
  return !!choix?.masquees.includes(vue);
}

/** Ce que la barre affiche d'un groupe : l'ordre choisi, sans les masquées. */
export function entreesAffichees<T extends { view: string }>(
  groupe: GroupeBarre,
  defaut: readonly T[],
  choix: ChoixBarre | null | undefined,
): T[] {
  const c = normaliserChoixBarre(choix);
  return ordonnerEntrees(defaut, c?.ordre[groupe]).filter((it) => !estMasquee(it.view, c));
}

/** Déplace l'élément d'indice `de` à l'indice `vers` (bornés). */
export function deplacer<T>(liste: readonly T[], de: number, vers: number): T[] {
  const copie = [...liste];
  if (de < 0 || de >= copie.length) return copie;
  const cible = Math.max(0, Math.min(copie.length - 1, vers));
  const [el] = copie.splice(de, 1);
  copie.splice(cible, 0, el);
  return copie;
}

/** Le nouveau choix après un réordonnancement du groupe. */
export function avecOrdre(choix: ChoixBarre | null | undefined, groupe: GroupeBarre, vues: readonly string[]): ChoixBarre {
  const c = normaliserChoixBarre(choix) ?? { ordre: {}, masquees: [] };
  return { ordre: { ...c.ordre, [groupe]: chaines(vues) }, masquees: c.masquees };
}

/** Le nouveau choix après avoir coché / décoché une entrée. */
export function avecVisibilite(choix: ChoixBarre | null | undefined, vue: string, visible: boolean): ChoixBarre {
  const c = normaliserChoixBarre(choix) ?? { ordre: {}, masquees: [] };
  if (ENTREES_TOUJOURS_VISIBLES.includes(vue)) return c;
  const masquees = c.masquees.filter((v) => v !== vue);
  if (!visible) masquees.push(vue);
  return { ordre: c.ordre, masquees };
}
