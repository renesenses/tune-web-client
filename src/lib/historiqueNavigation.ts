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
  // 🔴 Mesuré dans Chrome : pendant un retour, la vue REPUBLIE le niveau
  // intermédiaire qu'elle rouvre (album refermé → l'artiste redevient le
  // niveau courant). Ne regarder que « une fiche est ouverte » faisait alors
  // empiler une entrée ENTRE le `back()` et le `popstate` :
  //   back(), push #streaming, POP — un cran de plus à chaque retour, et
  // « suivant » détruit. Tant que le retour n'est pas consommé, on n'écrit
  // rien : l'entrée atteinte porte déjà l'état exact.
  if (retourEnCours) return 'aucune';
  return ficheOuverte ? 'push' : 'replace';
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

// ---------------------------------------------------------------------------
// Le contexte d'historique, extensible par vue (N3)
// ---------------------------------------------------------------------------
//
// L'entrée d'historique ne portait que quatre champs : `view`, `albumId`,
// `artistId`, `tab`. Tout ce qui n'est pas la Bibliothèque n'entrait donc PAS
// dans l'historique — Streaming, Playlists, Podcasts et Serveurs multimédia
// tenaient chacun une pile parallèle dans leurs variables locales. Leur
// `goBack()` ne touche pas à `history` du tout : le bouton du NAVIGATEUR, lui,
// quittait la vue entière au lieu de refermer le niveau ouvert.
//
// Plutôt que d'ajouter un cinquième, puis un sixième champ — la mécanique même
// des cinq rechutes (#82, #583, #586, #588, #621) — une vue dépose ici un
// instantané SÉRIALISABLE de son niveau ouvert, et déclare comment le reposer.
// L'entrée le transporte tel quel ; `popstate` le rend à la vue.
//
// `App.svelte` reste la SEULE à écrire dans `history` (5c420af) : une vue
// n'appelle jamais `pushState`, elle publie son niveau et App en tire la même
// décision `opPourFiche` que pour une fiche album.

import { writable } from 'svelte/store';

/** Le niveau ouvert dans une vue, ou `null` si la vue est à sa racine. */
export interface NiveauDeVue {
  vue: string;
  /** Instantané propriété de la vue : elle seule en connaît la forme. */
  etat: unknown;
  /** Fragment d'adresse, si la vue veut une URL parlante (`#podcast/42`). */
  adresse?: string;
}

/** Publié par les vues, lu par App.svelte pour alimenter l'historique. */
export const niveauDeVue = writable<NiveauDeVue | null>(null);

/** Ce qu'une vue doit savoir faire pour que son niveau survive à un retour. */
export interface PorteeDeVue {
  /** Repose l'instantané ; `null` = revenir à la racine de la vue. */
  retablir(etat: unknown): void;
}

const portees = new Map<string, PorteeDeVue>();

/**
 * Une vue se déclare à son montage. Rend la fonction de retrait — à appeler au
 * démontage, sans quoi une vue démontée continuerait de recevoir des états.
 */
export function declarerPorteeDeVue(vue: string, portee: PorteeDeVue): () => void {
  portees.set(vue, portee);
  return () => {
    if (portees.get(vue) === portee) portees.delete(vue);
  };
}

/** Vues actuellement capables de reposer un niveau (diagnostic, tests). */
export function vuesDeclarees(): string[] {
  return [...portees.keys()];
}

/**
 * Rend son instantané à la vue atteinte par une entrée d'historique.
 *
 * Une vue démontée n'est pas une erreur : elle vient peut-être d'être remontée
 * par le changement de vue et se déclarera à la frame suivante. On rend alors
 * `false` pour que l'appelant puisse réessayer.
 */
export function ouvrirNiveauDepuisEntree(niveau: NiveauDeVue | null): boolean {
  if (!niveau) return true;
  const portee = portees.get(niveau.vue);
  if (!portee) return false;
  portee.retablir(niveau.etat);
  return true;
}

/** Referme le niveau de la vue nommée, sans passer par l'historique. */
export function refermerNiveau(vue: string): void {
  portees.get(vue)?.retablir(null);
}

/**
 * Rend un instantané que `history.pushState` accepte.
 *
 * 🔴 Mesuré dans Chrome : passer directement l'état d'une vue Svelte 5 fait
 * jeter `pushState` avec
 * `DataCloneError: #<Object> could not be cloned` — les `$state` sont des
 * PROXIES, et l'algorithme de clonage structuré les refuse. L'entrée n'était
 * alors jamais écrite : le niveau ne survivait pas au retour, sans la moindre
 * erreur visible côté vue.
 *
 * Le tour par JSON traverse le proxy en LISANT ses propriétés, et rend un objet
 * nu. Il perd `undefined`, les fonctions et les dates — ce qu'une entrée
 * d'historique ne doit de toute façon pas transporter.
 */
export function instantaneSerialisable<T>(valeur: T): T {
  if (valeur === null || typeof valeur !== 'object') return valeur;
  try {
    return JSON.parse(JSON.stringify(valeur)) as T;
  } catch {
    // Cycle ou valeur non sérialisable : mieux vaut une entrée sans instantané
    // qu'une entrée jamais écrite.
    return null as unknown as T;
  }
}

/**
 * Une vue ouvre un niveau : l'entrée d'historique qui suit le portera, et le
 * bouton du navigateur le refermera au lieu de quitter la vue.
 */
export function ouvrirNiveau(vue: string, etat: unknown, adresse?: string): void {
  niveauDeVue.set({ vue, etat: instantaneSerialisable(etat), adresse });
}

/**
 * Le `goBack()` d'une vue : reculer d'un cran en annonçant l'intention, comme
 * la Bibliothèque. Les `mutations` sont l'état local que la vue remet à zéro ;
 * elles tournent dans la fenêtre d'intention pour que la souscription
 * d'App.svelte ne détruise pas l'entrée quittée.
 */
export function reculerDansLaVue(
  mutations: () => void = () => {},
  options?: Parameters<typeof reculerAvecIntention>[1],
): void {
  reculerAvecIntention(() => {
    niveauDeVue.set(null);
    mutations();
  }, options);
}
