/**
 * L'ordre de la barre latérale, choisi par l'utilisateur — web#1827.
 *
 * Demande de Bertrand du 30/09/2026 (point 4), avec son go : glisser-déposer
 * dans Réglages › Interface, monter / descendre au clavier, masquer une
 * entrée, « Rétablir l'ordre par défaut », rangé dans `ui_preferences`
 * (synchronisé serveur) sous `barreLaterale`.
 *
 * 🔴 UNE SEULE LISTE, LIBRE — arbitrage de Bertrand du 30/09/2026 : toute
 * entrée peut aller n'importe où, y compris d'un groupe à l'autre. Le niveau
 * d'affichage, lui, ne change pas : une entrée Avancée placée en tête reste
 * cachée au niveau Essentiel, et apparaît À SA PLACE choisie dès qu'elle est
 * visible. Tant que l'ordre est celui livré, la barre garde ses groupes et
 * leurs intertitres. Dès qu'il en diffère, la liste libre est DÉCOUPÉE en
 * groupes (`repartirEnGroupes`) : les intertitres « Sélections » et « Studio »
 * restent visibles (recette rc12 de Bertrand du 13/11/2026), et l'ordre
 * enregistré est rendu tel quel, entrées venues d'un autre groupe comprises.
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

/** Accueil ne se masque pas. Réglages non plus, mais ce n'est pas une entrée
 *  de liste : c'est la roue de l'en-tête, qui ne se déplace pas. */
export const ENTREES_TOUJOURS_VISIBLES: readonly string[] = ['home'];

export interface ChoixBarre {
  /** L'ordre enregistré, toutes entrées confondues. Vide : l'ordre livré. */
  ordre: string[];
  /** Les vues masquées. Jamais Accueil. */
  masquees: string[];
}

/**
 * Les entrées RENOMMÉES depuis qu'un ordre a pu être enregistré : l'ancien nom
 * prend la place du nouveau, au même rang (masquée si elle l'était).
 *
 * web#2971 — l'entrée « Playlists » menait à `playlistmanager` du 14/09 au
 * 13/11/2026 ; elle mène à `playlists`. Sans cette table, un ordre enregistré
 * entre-temps perdrait sa place choisie (l'entrée retomberait à sa place par
 * défaut) et une entrée masquée réapparaîtrait.
 */
export const ENTREES_RENOMMEES: Readonly<Record<string, string>> = {
  playlistmanager: 'playlists',
};

function chaines(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const vues: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string' || !x) continue;
    const vue = ENTREES_RENOMMEES[x] ?? x;
    if (!vues.includes(vue)) vues.push(vue);
  }
  return vues;
}

/**
 * Une valeur enregistrée — donc venue du SERVEUR : un ordre et des masquées,
 * des listes de chaînes sans doublon ; `null` si ce n'est pas un objet.
 */
export function normaliserChoixBarre(v: unknown): ChoixBarre | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const masquees = chaines(o.masquees).filter((vue) => !ENTREES_TOUJOURS_VISIBLES.includes(vue));
  return { ordre: chaines(o.ordre), masquees };
}

/**
 * Les entrées dans l'ordre enregistré.
 *
 * `defaut` est la liste LIVRÉE, complète ; `enregistre` l'ordre choisi. Sans
 * ordre, `defaut` tel quel. Filtrer (niveau, greffon, masquées) APRÈS : une
 * entrée nouvelle se place par rapport à la liste complète.
 */
export function ordonnerEntrees<T extends { view: string }>(
  defaut: readonly T[],
  enregistre: readonly string[] | undefined | null,
): T[] {
  if (!enregistre || !enregistre.length) return [...defaut];
  const parVue = new Map(defaut.map((it) => [it.view, it]));
  const resultat: T[] = [];
  for (const vue of enregistre) {
    const it = parVue.get(ENTREES_RENOMMEES[vue] ?? vue);
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
  return !!choix?.masquees.some((m) => (ENTREES_RENOMMEES[m] ?? m) === vue);
}

/** L'ordre choisi diffère-t-il de l'ordre livré ? Masquer seul ne compte pas. */
export function ordreModifie(defaut: readonly { view: string }[], choix: ChoixBarre | null | undefined): boolean {
  const c = normaliserChoixBarre(choix);
  if (!c?.ordre.length) return false;
  const r = ordonnerEntrees(defaut, c.ordre);
  return r.some((it, i) => it !== defaut[i]);
}

/** Une tranche de la barre en liste libre : son groupe (son intertitre) et ses entrées. */
export interface Tranche<T> {
  groupe: number;
  entrees: T[];
}

function permutations(l: number[]): number[][] {
  if (l.length <= 1) return [l];
  return l.flatMap((x, i) => permutations([...l.slice(0, i), ...l.slice(i + 1)]).map((r) => [x, ...r]));
}

/**
 * Recette rc12 (Bertrand, 13/11/2026) — une liste libre garde ses intertitres.
 *
 * Avant, un ordre personnalisé rendait la barre en UNE liste sans intertitre :
 * « Sélections » et « Studio » disparaissaient pour quiconque avait réordonné
 * sa barre, même d'une seule entrée. On découpe désormais la liste ordonnée en
 * `n` tranches CONTIGUËS : la première est le noyau (groupe 0, sans
 * intertitre), les suivantes portent chacune un groupe (1 = Sélections,
 * 2 = Studio), dans l'ordre où l'utilisateur les a mis — des Sélections
 * descendues sous le Studio gardent leur intertitre, sous celui du Studio.
 *
 * L'ordre n'est jamais touché : « l'entrée reste où je l'ai mise » (Bertrand,
 * 13/11) ; seuls les intertitres se placent, au plus près de leur place
 * habituelle. Les coupures (et l'ordre des groupes) se choisissent, dans cet
 * ordre de priorité :
 *   1. aucune tranche sans entrée VISIBLE de son groupe quand ce groupe en a
 *      une (sinon l'intertitre disparaît : relecture de web#2960, ordres
 *      « noyau, Sélections, Avancé, Studio » et « Sélections après Studio ») ;
 *   2. le plus d'entrées dans leur groupe d'origine ;
 *   3. une tranche qui commence par une entrée de son groupe (l'intertitre
 *      coiffe les siens) ; à égalité encore, l'ordre livré des groupes, puis
 *      la coupure la plus tôt.
 * Une tranche sans aucune entrée visible de son groupe (le Studio au niveau
 * Essentiel) n'a pas d'intertitre à porter : ses entrées rejoignent la
 * tranche précédente, à leur place.
 *
 * `visible` : les entrées réellement affichées (niveau, greffons, masquées).
 * Par défaut, toutes. Le résultat compte toujours `n` tranches, la première
 * du groupe 0 ; leur concaténation est `liste`, telle quelle.
 */
export function repartirEnGroupes<T>(
  liste: readonly T[],
  groupe: (it: T) => number,
  n: number,
  visible: (it: T) => boolean = () => true,
): Tranche<T>[] {
  const L = liste.length;
  // Sommes cumulées par groupe : entrées du groupe, et entrées VISIBLES du groupe.
  const chez: number[][] = [];
  const vus: number[][] = [];
  for (let k = 0; k < n; k++) {
    const c = [0];
    const v = [0];
    for (let x = 0; x < L; x++) {
      const g = groupe(liste[x]) === k;
      c.push(c[x] + (g ? 1 : 0));
      v.push(v[x] + (g && visible(liste[x]) ? 1 : 0));
    }
    chez.push(c);
    vus.push(v);
  }
  // Ordre lexicographique ramené à un seul nombre : la règle 3 vaut au plus
  // n points, la règle 2 en vaut n + 1 par entrée, la règle 1 plus que tout.
  const P2 = n + 1;
  const P1 = (L + 1) * P2 * (n + 1);
  const note = (k: number, j: number, i: number) =>
    P2 * (chez[k][i] - chez[k][j])
    + (j < i && groupe(liste[j]) === k ? 1 : 0)
    - (vus[k][L] > 0 && vus[k][i] - vus[k][j] === 0 ? P1 : 0);

  let retenu: { note: number; groupes: number[]; bornes: number[] } | null = null;
  const autres = Array.from({ length: n - 1 }, (_, i) => i + 1);
  for (const suite of permutations(autres)) {
    const groupes = [0, ...suite];
    // meilleur[p][i] : la meilleure note des i premières entrées réparties
    // dans les tranches 0..p ; coupe[p][i] : début de la tranche p.
    const meilleur: number[][] = [];
    const coupe: number[][] = [];
    for (let p = 0; p < n; p++) {
      meilleur.push(new Array(L + 1).fill(0));
      coupe.push(new Array(L + 1).fill(0));
      for (let i = 0; i <= L; i++) {
        if (p === 0) { meilleur[0][i] = note(0, 0, i); continue; }
        let best = -Infinity;
        let bestJ = 0;
        for (let j = 0; j <= i; j++) {
          const v = meilleur[p - 1][j] + note(groupes[p], j, i);
          if (v > best) { best = v; bestJ = j; }
        }
        meilleur[p][i] = best;
        coupe[p][i] = bestJ;
      }
    }
    const total = meilleur[n - 1][L];
    if (retenu && total <= retenu.note) continue;
    const bornes = new Array(n + 1).fill(0);
    bornes[n] = L;
    for (let p = n - 1; p >= 1; p--) bornes[p] = coupe[p][bornes[p + 1]];
    retenu = { note: total, groupes, bornes };
  }
  const { groupes, bornes } = retenu!;
  const tranches: Tranche<T>[] = groupes.map((g, p) => ({ groupe: g, entrees: liste.slice(bornes[p], bornes[p + 1]) }));
  // Pas d'intertitre sans au moins une entrée visible du groupe : la tranche
  // se fond dans la précédente, à sa place.
  for (let p = n - 1; p >= 1; p--) {
    const t = tranches[p];
    if (!t.entrees.some((it) => groupe(it) === t.groupe && visible(it))) {
      tranches[p - 1].entrees.push(...t.entrees);
      t.entrees = [];
    }
  }
  return tranches;
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

/** Le nouveau choix après un réordonnancement. */
export function avecOrdre(choix: ChoixBarre | null | undefined, vues: readonly string[]): ChoixBarre {
  const c = normaliserChoixBarre(choix) ?? { ordre: [], masquees: [] };
  return { ordre: chaines(vues), masquees: c.masquees };
}

/** Le nouveau choix après avoir coché / décoché une entrée. */
export function avecVisibilite(choix: ChoixBarre | null | undefined, vue: string, visible: boolean): ChoixBarre {
  const c = normaliserChoixBarre(choix) ?? { ordre: [], masquees: [] };
  if (ENTREES_TOUJOURS_VISIBLES.includes(vue)) return c;
  const masquees = c.masquees.filter((v) => v !== vue);
  if (!visible) masquees.push(vue);
  return { ordre: c.ordre, masquees };
}

// ---------------------------------------------------------------------------
// Un réglage du PROFIL, pas du navigateur — fil 2109 du forum (Levente Toth,
// ticket 220) : « ce serait bien que ce soit un réglage global, comme l'image
// de profil ».
//
// Le transport existait déjà : `barreLaterale` vit dans `ui_preferences`,
// rangé PAR PROFIL côté serveur et réécrit par `PATCH /system/config` à chaque
// geste. C'est la RELECTURE qui le gardait au navigateur :
// `syncPreferencesFromServer` fusionne `{ ...defaults, ...server, ...local }`,
// et le blob local porte `barreLaterale: null` dès la première ouverture — le
// défaut, pas un choix. Une barre réglée sur la machine A n'apparaissait donc
// jamais sur la machine B déjà ouverte une fois : même piège que la photo de
// profil (#1673).
//
// « Adopter le serveur quand le local est vide », le remède de la photo, ne
// suffit pas ici : la barre se règle PUIS se modifie et se rétablit. Avec ce
// remède, B garderait sa première copie, la renverrait au serveur au moindre
// réglage, et un « Rétablir » fait sur A serait défait par B. On date donc le
// dernier geste (`barreLateraleMaj`, en millisecondes) et le plus RÉCENT des
// deux gagne, quel qu'il soit — un « Rétablir » compris. La fusion elle-même
// réécrit le blob au serveur (le magasin envoie chaque émission) : l'appareil
// qui portait le geste le plus frais répare le serveur à son prochain
// chargement, même si un onglet resté ouvert ailleurs l'avait écrasé.
// ---------------------------------------------------------------------------

/** Horodatage relu (local ou SERVEUR) : un nombre fini positif, sinon 0 —
 *  « jamais daté », c'est-à-dire écrit avant ce correctif. */
export function horodatageBarre(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** La barre telle qu'elle se range dans les préférences. */
export interface EtatBarre {
  barreLaterale: ChoixBarre | null;
  barreLateraleMaj: number;
}

/** Les deux champs à poser après un geste sur la barre. */
export function gesteBarre(choix: ChoixBarre | null, maintenant: number = Date.now()): EtatBarre {
  return { barreLaterale: choix, barreLateraleMaj: horodatageBarre(maintenant) };
}

/**
 * La barre à retenir entre cet appareil et le serveur.
 *
 * - Le serveur ne dit rien de la barre (blob antérieur à web#1827, ou valeur
 *   abîmée déjà écartée) : celle de l'appareil.
 * - Sinon, le geste le plus RÉCENT gagne, y compris un retour à l'ordre livré
 *   (`null` daté).
 * - À égalité — en pratique deux blobs jamais datés, écrits avant ce
 *   correctif : un choix fait quelque part l'emporte sur un défaut que
 *   personne n'a choisi, le serveur d'abord.
 */
export function arbitrerBarre(
  local: EtatBarre,
  serveur: { barreLaterale?: unknown; barreLateraleMaj?: unknown },
): EtatBarre {
  if (!('barreLaterale' in serveur)) return local;
  const choixServeur = serveur.barreLaterale === null ? null : normaliserChoixBarre(serveur.barreLaterale);
  if (serveur.barreLaterale !== null && choixServeur === null) return local;
  const majServeur = horodatageBarre(serveur.barreLateraleMaj);
  const majLocale = horodatageBarre(local.barreLateraleMaj);
  const duServeur = { barreLaterale: choixServeur, barreLateraleMaj: majServeur };
  if (majServeur > majLocale) return duServeur;
  if (majLocale > majServeur) return local;
  return choixServeur !== null || local.barreLaterale === null ? duServeur : local;
}
