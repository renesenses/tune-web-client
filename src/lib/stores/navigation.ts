import { writable, get } from 'svelte/store';

export type View = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'playlistmanager' | 'playlistshub' | 'smartplaylists' | 'smart-ai' | 'ambiance' | 'browse' | 'search' | 'settings' | 'history' | 'streaming' | 'metadata' | 'radios' | 'radiofavorites' | 'genres' | 'mediaservers' | 'favorites' | 'podcasts' | 'zonemanager' | 'diagnostics' | 'collections' | 'smartcollections' | 'dashboard' | 'services' | 'genretree' | 'equalizer' | 'crossfeed' | 'plugins' | 'onboarding' | 'offline' | 'alarms' | 'login' | 'converter' | 'declick' | 'shortcuts' | 'tags' | 'oxygen' | 'support' | 'tv' | 'bandcamp' | 'concerts';
export const activeView = writable<View>('home');
export const previousView = writable<View | null>(null);

// Mode « sans distraction » : masque la barre latérale, la recherche globale et
// la barre d'onglets mobile pour ne laisser que la vue et le lecteur (demandé
// par Alex Campbell sur Oxygen : « a very clean window in to only your music »).
// Volontairement NON persisté : sans barre latérale la sortie ne tient qu'au
// bouton de la vue et à Échap, donc un rechargement doit toujours revenir à
// l'interface complète.
export const focusMode = writable(false);

// Track previous view on every navigation
let _lastView: View = 'home';
activeView.subscribe(v => {
  if (v !== _lastView) {
    previousView.set(_lastView);
    _lastView = v;
    // Changer de vue rend la navigation indispensable : une vue qui n'expose
    // pas le bouton laisserait l'utilisateur enfermé sans barre latérale.
    focusMode.set(false);
  }
});

// Bumped when a sidebar nav item is clicked, so a list/detail view (playlists,
// collections) can reset to its list when the user clicks its nav entry while
// already inside a detail. Views watch this and clear their local selection.
export const listResetNonce = writable(0);
/**
 * 🔴 La vue vers laquelle le bouton « Retour » d'une FICHE doit ramener.
 *
 * « Menu recherche : si je clique sur un artiste cela me renvoie à la
 * bibliothèque de l'artiste et si je clique sur le bouton Retour ça me renvoie
 * à l'accueil de la bibliothèque alors que le comportement attendu devrait
 * être un retour vers la page de recherche » (FabienM, fil 1749, v0.9.145 —
 * renesenses/tune-server-rust#3824).
 *
 * Le chemin aller existe déjà et ne change pas : la Recherche POSE sa cible
 * (`pendingLibraryArtist`) puis change de vue. Ce qui manquait est le chemin
 * RETOUR — la fiche refermait son calque (`ouvert = null`) et découvrait la
 * grille de la Bibliothèque, parce que rien ne lui disait d'où l'on venait.
 *
 * ⚠️ Pourquoi PAS `previousView`, qui existe pourtant juste au-dessus.
 * `previousView` suit TOUT changement de vue, y compris ceux que l'utilisateur
 * fait après être arrivé : il dit « la vue d'avant », pas « la vue à laquelle
 * ce geste-ci doit rendre la main ». Il n'est d'ailleurs lu par aucun composant
 * `v2/`. Ce dépôt-ci est explicite, posé par l'émetteur du geste, et consommé
 * UNE fois par la fiche qui porte le bouton.
 *
 * Effacé par `requestListReset()` : un clic délibéré dans la barre latérale
 * quitte le parcours, et le « retour » d'un parcours abandonné ne doit pas
 * téléporter l'écran suivant.
 */
export const vueDeRetour = writable<View | null>(null);
export function requestListReset() {
  listResetNonce.update(n => n + 1);
  viewStateStash.clear();
  vueDeRetour.set(null);
}

// One-shot stash of a view's intra-drill state (open collection, …) so that
// browser-back from another view lands back inside the drill instead of on the
// root list (#1215). Cleared by requestListReset(): a deliberate sidebar click
// must still open the root list.
const viewStateStash = new Map<string, unknown>();
export function stashViewState(key: string, state: unknown) {
  viewStateStash.set(key, state);
}
export function takeViewState<T>(key: string): T | undefined {
  const v = viewStateStash.get(key) as T | undefined;
  viewStateStash.delete(key);
  return v;
}

// Contexte de navigation PERSISTANT par vue (#bug-bouton-retour).
//
// Contrairement à `viewStateStash` (one-shot, effacé par `requestListReset`),
// ceci SURVIT au démontage/remontage. App.svelte monte les vues dans une
// chaîne `{#if activeView === …}` : quitter une vue la démonte et perd son
// `$state` local ; y revenir la remonte à neuf, à la racine. C'était « le
// bouton retour réinitialise toute la navigation ». Une vue enregistre ici un
// instantané SÉRIALISABLE de sa position (onglet, album/artiste ouvert, fil de
// genres, recherche) et le rétablit à son montage suivant.
//
// La clé est la vue ; la valeur est opaque, propriété de la vue (chaque vue
// connaît la forme de son propre contexte). Volontairement en mémoire (pas de
// localStorage) : le contexte vaut pour la session de navigation, un
// rechargement complet repart proprement de l'accueil.
const viewContexts = new Map<View, unknown>();

export function saveViewContext(view: View, ctx: unknown): void {
  if (ctx == null) {
    viewContexts.delete(view);
  } else {
    viewContexts.set(view, ctx);
  }
}

export function loadViewContext<T>(view: View): T | undefined {
  return viewContexts.get(view) as T | undefined;
}

export function clearViewContext(view: View): void {
  viewContexts.delete(view);
}

// Optional tab to open when navigating to settings (consumed once by SettingsView)
export const settingsInitialTab = writable<string | null>(null);
export const mobileNowPlayingOpen = writable(false);
export const pendingSearchQuery = writable<string>('');

// One-shot: an absolute folder path handed from the Répertoires (browse) view's
// "open in library" button to OxygenView, which pre-filters on that folder +
// its subfolders (facetSels.folder). Consumed once on Oxygen mount.
export const pendingOxygenFolder = writable<string | null>(null);


/**
 * 🔴 L'ALBUM à ouvrir en arrivant sur la Bibliothèque du nouveau client.
 *
 * « Page lecture en cours d'un titre : les hyperliens de l'album et de
 * l'artiste renvoient vers la page d'accueil et non vers la page de l'artiste
 * ou de l'album » (Fabien, v0.9.140, 07/09/2026).
 *
 * TREIZIÈME « écrit mais pas branché » de ce client. `NowPlaying` pose
 * `selectedAlbum` / `selectedArtist` puis change de vue. Ces deux magasins
 * sont lus par DOUZE composants de l'ancien client et par AUCUN de la v2 : le
 * clic changeait donc d'écran sans rien ouvrir.
 *
 * Même forme que `pendingLibraryFolder` juste au-dessus : posé avant le
 * changement de vue, consommé UNE fois au montage. `NowPlaying` alimente les
 * deux contrats — l'ancien pour l'ancien client, celui-ci pour le nouveau —
 * plutôt que de deviner lequel tourne.
 */
export const pendingLibraryAlbum = writable<number | null>(null);

/**
 * L'ARTISTE à ouvrir en arrivant sur la Bibliothèque du nouveau client.
 *
 * Même contrat que `pendingLibraryAlbum` juste au-dessus, pour le geste
 * « Aller à l'artiste » du menu « … » d'une piste (Bertrand, 07/09/2026 :
 * « je veux à minima le contenu de la v0 »).
 *
 * On y range l'IDENTIFIANT, pas le nom. Le client actuel retrouve l'artiste
 * en cherchant son nom dans `$artists` — un rapprochement par chaîne qui échoue
 * dès qu'une piste porte « M » quand la table porte « -M- ». Une piste de la
 * bibliothèque porte `artist_id` (mesuré sur le .18 : `artist_id: 125` pour
 * « M »), et c'est cet identifiant que la table des artistes emploie.
 */
export const pendingLibraryArtist = writable<number | null>(null);

/**
 * L'ANNÉE à appliquer en arrivant sur la Bibliothèque du nouveau client.
 *
 * Troisième trou de la MÊME famille que ses deux jumeaux ci-dessus, trouvé le
 * 09/09/2026 en reprenant les retours de Fabien : `NowPlaying.navigateToYear`
 * pose `yearFilter` (`stores/library`) puis passe à la Bibliothèque. Mesure :
 * `yearFilter` n'est lu QUE par `components/LibraryView.svelte`, l'écran de
 * l'ANCIEN client. Aucun composant `v2/` ne le lit — cliquer « (2003) » à côté
 * du titre d'album ne filtrait donc RIEN sur le nouveau client.
 *
 * Le correctif de Fabien avait été posé sur une branche de `navigateToAlbum`
 * et pas sur les deux autres sorties de l'écran : c'est le même défaut, laissé
 * là où on ne l'avait pas cherché.
 */
export const pendingLibraryYear = writable<number | null>(null);

export interface NavContext {
  view: View;
  albumId?: number | null;
  artistId?: number | null;
  tab?: string | null;
}

export function getNavContext(extra?: Partial<NavContext>): NavContext {
  return { view: get(activeView), ...extra };
}

const scrollPositions = new Map<string, number>();

export function saveScrollPosition(view: string, scrollTop: number) {
  scrollPositions.set(view, scrollTop);
}

export function getScrollPosition(view: string): number {
  return scrollPositions.get(view) ?? 0;
}

// Intra-view list<->detail scroll preservation. Views that swap a list for a
// detail inside their own scroll container (Collections, Playlists, the
// hierarchical Media Servers / Browse folders) save the container's scrollTop
// under a key on open, and restore it on Back. The restore polls a bounded
// number of frames until the re-rendered list is tall enough to hold the
// offset (a single set clamps to 0 before layout).
const detailScrolls = new Map<string, number>();
/**
 * Le conteneur à mémoriser / restaurer. Une FONCTION quand l'élément n'existe
 * pas encore au moment de l'appel.
 *
 * 🔴 Le piège que ce type ferme. `goBack()` remet la vue sur sa liste puis
 * appelle la restauration dans la foulée ; Svelte 5 ne repeint qu'au
 * micro-tour suivant. Tant que le conteneur de défilement était la RACINE de
 * la vue — toujours présente — l'élément était là et tout marchait. Dès qu'on
 * sort l'en-tête du conteneur qui défile (le seul ancrage que Firefox ET
 * Chromium honorent, cf `.settings-body` / `.diagnostics-body`), ce conteneur
 * naît avec la branche « liste » : il vaut `null` à l'instant de l'appel, et
 * l'ancienne version rendait la main SANS RIEN FAIRE ni le dire. La position
 * mémorisée était perdue en silence.
 */
export type CibleDefilement = HTMLElement | null | undefined | (() => HTMLElement | null | undefined);
function resoudre(cible: CibleDefilement): HTMLElement | null {
  return (typeof cible === 'function' ? cible() : cible) ?? null;
}
export function saveDetailScroll(key: string, el: CibleDefilement) {
  const cible = resoudre(el);
  if (cible) detailScrolls.set(key, cible.scrollTop);
}
export function restoreDetailScroll(key: string, el: CibleDefilement) {
  const target = detailScrolls.get(key) ?? 0;
  let attempts = 0;
  const tick = () => {
    // L'élément est RÉSOLU À CHAQUE TOUR, pas une fois pour toutes : c'est ce
    // qui laisse le temps à la branche « liste » de se rendre.
    const cible = resoudre(el);
    const pret = cible !== null && (target <= 0 || cible.scrollHeight >= target + cible.clientHeight);
    if (pret || attempts >= 30) {
      if (cible) cible.scrollTop = target > 0 ? target : 0;
      return;
    }
    attempts += 1;
    requestAnimationFrame(tick);
  };
  // Un premier tour synchrone garde le comportement d'origine quand l'élément
  // est déjà là et la position déjà tenable : rien n'attend une trame.
  tick();
}
