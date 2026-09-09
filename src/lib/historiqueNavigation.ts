/**
 * Qui écrit dans l'historique, et quand.
 *
 * Tracé dans Chrome sur .18 (v0.9.126) en instrumentant `pushState`,
 * `replaceState`, `history.back` et `popstate` :
 *
 *   retour NAVIGATEUR depuis #album/2691 : POP #library                    → 1 opération, propre
 *   retour ÉCRAN      depuis #album/2691 : replace #library, back(), POP   → l'entrée est ÉCRASÉE
 *
 * Cause : l'historique est alimenté par des SOUSCRIPTIONS À DES STORES
 * (`selectedAlbum.subscribe`, `selectedArtist.subscribe`), pas par des
 * intentions de navigation. Le bouton Retour met `selectedAlbum` à `null` ; la
 * souscription y voit « on quitte la fiche » et réécrit l'entrée courante —
 * celle de la fiche — juste avant le `history.back()`. L'entrée de la fiche
 * n'existe plus : « suivant » ne peut plus y revenir, et la pile a un cran de
 * moins que le chemin réellement parcouru.
 *
 * La correction ne touche pas aux souscriptions : elle leur donne ce qui leur
 * manquait, l'INTENTION. Fermer une fiche parce qu'on recule n'écrit rien —
 * le `popstate` qui suit remet l'état de l'entrée précédente. Fermer une fiche
 * autrement (clic ailleurs, changement d'onglet) réécrit l'entrée comme avant.
 */

/** Ce que la souscription doit faire de l'historique. */
export type OpHistorique = 'push' | 'replace' | 'aucune';

let retourEnCours = false;

/** Vrai entre le début d'un retour applicatif et le `popstate` qu'il provoque. */
export function retourProgrammatiqueEnCours(): boolean {
  return retourEnCours;
}

/**
 * Décision d'écriture pour une fiche album/artiste.
 *
 * - fiche ouverte      → `push` : la fiche reçoit sa propre adresse.
 * - fiche fermée à la main → `replace` : l'entrée courante suit l'état.
 * - fiche fermée par un retour → `aucune` : ne PAS détruire l'entrée quittée.
 */
export function opPourFiche(ficheOuverte: boolean): OpHistorique {
  if (ficheOuverte) return 'push';
  return retourEnCours ? 'aucune' : 'replace';
}

/**
 * Reculer d'un cran en annonçant l'intention.
 *
 * `mutations` regroupe les `set(null)` que le retour entraîne : ils doivent
 * tourner DANS la fenêtre où le drapeau est levé, puisque c'est eux qui
 * déclenchent les souscriptions fautives.
 *
 * Le drapeau est baissé par `finDuRetourProgrammatique()` depuis l'écouteur
 * `popstate`. Le filet `delaiDeSecurite` couvre le cas où aucun `popstate`
 * n'arrive (pile vide, entrée hors application) : sans lui, le drapeau resté
 * levé ferait taire l'écriture suivante, légitime celle-là.
 */
export function reculerAvecIntention(
  mutations: () => void,
  options: {
    historique?: Pick<History, 'back'>;
    delaiDeSecurite?: number;
    programmerFilet?: (cb: () => void, ms: number) => void;
  } = {},
): void {
  const historique = options.historique ?? (typeof window !== 'undefined' ? window.history : undefined);
  const filet = options.programmerFilet ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  retourEnCours = true;
  try {
    mutations();
  } finally {
    historique?.back();
    filet(() => { retourEnCours = false; }, options.delaiDeSecurite ?? 1000);
  }
}

/** Appelé par l'écouteur `popstate` : le retour est consommé. */
export function finDuRetourProgrammatique(): void {
  retourEnCours = false;
}
