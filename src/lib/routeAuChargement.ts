/**
 * LA ROUTE PORTÉE PAR L'ADRESSE AU CHARGEMENT — le lien profond.
 *
 * ## Le défaut, mesuré au navigateur (Bertrand, .18, v0.9.153)
 *
 * `http://192.168.1.18:8888/#library` → la Bibliothèque s'affiche → **F5** →
 * l'application revient sur l'**Accueil**, et l'adresse elle-même est réécrite
 * en `#home`. Aucun lien profond ne survit à un rechargement : un testeur ne
 * peut pas envoyer « regarde cet écran ».
 *
 * ## Qui réécrivait, et pourquoi ce n'était pas un bogue de frappe
 *
 * Les deux coquilles ANCRENT leur entrée d'historique au démarrage, et aucune
 * des deux ne lisait le fragment avant de l'écrire :
 *
 *   • `lib/historiqueCoquille.ts` (coquille v2, le défaut par défaut depuis la
 *     phase 4) — `ecrire(false, get(activeView), …)` au branchement, donc un
 *     `replaceState(…, '#home')` puisque `activeView` naît à `'home'`. Son
 *     propre en-tête le disait : « Rien ne LIT ce fragment au démarrage —
 *     l'aiguillage se fait sur `history.state` ».
 *   • `App.svelte` (coquille actuelle, `?v2=0`) — le premier passage de
 *     `activeView.subscribe` pose `replaceState(ctx, '', '#' + view)`. Le seul
 *     fragment qu'elle lisait est `#tv` (`isTvHash`).
 *
 * Le fragment n'était donc pas ignoré : il était **écrasé**, et c'est pour cela
 * que l'adresse change sous les yeux de l'utilisateur.
 *
 * ## Ce que ce module fait, et ce qu'il n'est pas
 *
 * Il rend une VUE à partir d'un fragment, rien de plus. Ce n'est pas un
 * routeur : il n'invente aucun nom, ne construit aucune adresse, ne touche ni à
 * `history` ni à `location`. Les coquilles l'appellent UNE fois, avant d'ancrer
 * leur entrée — donc jamais depuis un effet réactif, et jamais avec un
 * `pushState`.
 */
import type { View } from './stores/navigation';

/**
 * TOUTES LES VUES, ET CELLES QU'UNE ADRESSE PEUT REPOSER.
 *
 * 🔴 `Record<View, boolean>` et pas un tableau : le type oblige à citer CHAQUE
 * membre de `View`. Ajouter une vue à `stores/navigation` sans trancher ici ne
 * compile pas — sans quoi la table dériverait en silence et une vue neuve
 * deviendrait un « lien mort » que personne ne verrait avant un testeur.
 *
 * `false` ne veut pas dire « inconnue » : ces noms existent, mais aucun n'est
 * une DESTINATION qu'un utilisateur puisse demander à l'ouverture.
 */
const VUES: Record<View, boolean> = {
  home: true,
  nowplaying: true,
  library: true,
  queue: true,
  playlists: true,
  playlistmanager: true,
  smartplaylists: true,
  'smart-ai': true,
  ambiance: true,
  browse: true,
  search: true,
  settings: true,
  history: true,
  streaming: true,
  metadata: true,
  radios: true,
  radiofavorites: true,
  genres: true,
  mediaservers: true,
  favorites: true,
  podcasts: true,
  zonemanager: true,
  diagnostics: true,
  collections: true,
  smartcollections: true,
  dashboard: true,
  services: true,
  genretree: true,
  equalizer: true,
  crossfeed: true,
  plugins: true,
  alarms: true,
  converter: true,
  declick: true,
  shortcuts: true,
  tags: true,
  oxygen: true,
  support: true,
  bandcamp: true,
  concerts: true,
  pontroon: true,

  // ─── Les six que l'adresse NE repose PAS, et pourquoi ────────────────────
  //
  // `tv` a déjà son chemin de démarrage, à part : `App.svelte` lit `#tv`,
  // `#tv&zone=12` et `#tv?zone=12`, force la zone puis entre en Grand écran.
  // Le reposer ici ferait un SECOND mécanisme sur le même fragment, et celui-ci
  // perdrait la zone. Son cas reste entier — y compris le fait que la coquille
  // v2 ne le lit toujours pas.
  tv: false,
  // `login` n'est pas un écran qu'on demande : `clearToken()` posait ce
  // fragment et personne ne le lisait (voir `lib/auth.ts`). La session expirée
  // se dit par un calque partagé, pas par une adresse.
  login: false,
  // `onboarding` est un ÉTAT que l'application constate elle-même. Le reposer
  // depuis l'adresse afficherait l'assistant de première installation à une
  // installation déjà faite.
  //
  // `offline` a disparu avec son écran le 20/09/2026 (Bertrand : « écran
  // écoute hors-ligne à supprimer »).
  onboarding: false,
  // Les fiches de STREAMING tiennent leur contenu dans un magasin
  // (`ficheAlbumService`) que rien ne remplit au chargement : `ShellV2` teste
  // `$activeView === 'streamingalbum' && $ficheAlbumService` et retombe sinon
  // sur son repli « À venir ». Reposer la vue seule promettrait un écran vide.
  streamingalbum: false,
  streamingartist: false,
};

/**
 * LES ADRESSES DE FICHE QUE L'APPLICATION ÉCRIT ELLE-MÊME.
 *
 * Ce ne sont pas des vues : `App.svelte` donne à la fiche d'un album sa propre
 * adresse (`#album/42`, `#artist/12`) pour que « précédent / suivant » soient
 * lisibles dans le menu du navigateur. Recharger dessus doit rendre l'écran qui
 * PORTE la fiche — la Bibliothèque — et surtout pas crier « route inconnue »
 * sur une adresse que Tune a écrite lui-même.
 *
 * La fiche n'est pas rouverte : il faudrait recharger l'album par l'API au
 * démarrage. Même limite, dite au même endroit que les autres.
 */
const FICHES: Record<string, View> = {
  album: 'library',
  artist: 'library',
  // La coquille v2 écrit `#library/artiste:12` : le `/` est coupé par
  // `nomDeRoute`, et `library` suffit. Rien à ajouter ici pour elle.
};

/** Vrai si ce nom est une vue de l'application — restaurable ou non. */
export function estNomDeVue(nom: string): nom is View {
  return Object.prototype.hasOwnProperty.call(VUES, nom);
}

/** Les noms qu'une adresse peut reposer, triés — pour les témoins et la doc. */
export function vuesRestaurables(): View[] {
  return (Object.keys(VUES) as View[]).filter((v) => VUES[v]).sort();
}

/**
 * Le NOM de route porté par un fragment, sans rien décider.
 *
 * `#library` → `library`. `#library/artiste:12` → `library` : le niveau de
 * détail est coupé, parce que le rouvrir demanderait de recharger l'artiste par
 * l'API — ce que ce lot ne fait pas (même limite que `historiqueCoquille`, qui
 * repose la clé sans rouvrir la fiche). `#tv&zone=12` → `tv`, pour que la table
 * ci-dessus puisse dire « pas moi ».
 */
export function nomDeRoute(hash: string): string {
  const nu = hash.startsWith('#') ? hash.slice(1) : hash;
  // Le premier des trois séparateurs gagne : `/` ouvre un détail, `&` et `?`
  // ouvrent les paramètres de `#tv`.
  const coupe = nu.search(/[/&?]/);
  return (coupe === -1 ? nu : nu.slice(0, coupe)).trim();
}

/**
 * LA VUE À POSER AU CHARGEMENT, ou `null` s'il n'y a rien à poser.
 *
 * `null` couvre trois cas volontairement confondus — adresse sans fragment,
 * nom connu mais non restaurable, nom inconnu — parce que l'appelant en fait la
 * même chose : il garde la vue de démarrage habituelle. Ce qui les distingue se
 * dit à la console, pas à l'écran (voir ci-dessous).
 *
 * ⚠️ Fonction PURE. Elle n'écrit ni dans `activeView`, ni dans `history` : la
 * coquille pose la vue elle-même, AVANT d'ancrer son entrée, et l'ancrage
 * réécrit alors l'adresse à l'identique. Aucune entrée n'est empilée.
 */
export function vueDepuisHash(hash: string): View | null {
  const nom = nomDeRoute(hash ?? '');
  if (!nom) return null;
  if (FICHES[nom]) return FICHES[nom];
  if (!estNomDeVue(nom)) {
    // 🔴 UN NOM INCONNU NE PART PAS EN SILENCE.
    //
    // Retomber sur l'Accueil est défendable — il n'y a pas d'écran à montrer —
    // mais se taire ne l'est pas : c'est le second constat de Bertrand, une
    // adresse ramenée à `#home` sans que rien ne le dise. La console nomme la
    // route ET les routes connues, et l'ancrage normalise l'adresse, de sorte
    // que l'utilisateur ne reste pas devant un écran qui contredit sa barre
    // d'adresse.
    //
    // ⚠️ `#playlists`, l'exemple du signalement, n'est PAS ce cas : c'est une
    // vue réelle (`ShellV2` monte `PlaylistsV2`), et elle se repose désormais.
    //
    // Pas de bandeau à l'écran ici : ce serait un texte visible, donc onze
    // langues et une décision d'interface. Elle est proposée, pas prise.
    //
    // Appelé UNE fois par chargement, jamais depuis un effet réactif.
    console.warn(
      `[tune] route inconnue dans l'adresse : « #${nom} » — retour à l'Accueil. ` +
        `Routes connues : ${vuesRestaurables().join(', ')}`,
    );
    return null;
  }
  return VUES[nom] ? nom : null;
}
