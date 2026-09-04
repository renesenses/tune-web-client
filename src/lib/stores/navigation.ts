import { writable, get } from 'svelte/store';

export type View = 'home' | 'nowplaying' | 'library' | 'queue' | 'playlists' | 'playlistmanager' | 'playlistshub' | 'smartplaylists' | 'smart-ai' | 'ambiance' | 'browse' | 'search' | 'settings' | 'history' | 'streaming' | 'metadata' | 'radios' | 'radiofavorites' | 'genres' | 'mediaservers' | 'favorites' | 'podcasts' | 'zonemanager' | 'diagnostics' | 'collections' | 'smartcollections' | 'dashboard' | 'services' | 'genretree' | 'equalizer' | 'crossfeed' | 'plugins' | 'onboarding' | 'offline' | 'alarms' | 'login' | 'converter' | 'declick' | 'shortcuts' | 'tags' | 'oxygen' | 'support' | 'tv' | 'bandcamp';
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
export function requestListReset() {
  listResetNonce.update(n => n + 1);
  viewStateStash.clear();
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

// One-shot: same idea for the classic LibraryView — scope its Albums/Artists/
// Tracks/Genres tabs to a folder + subfolders. Consumed once on Library mount.
export const pendingLibraryFolder = writable<string | null>(null);

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
export function saveDetailScroll(key: string, el: HTMLElement | null | undefined) {
  if (el) detailScrolls.set(key, el.scrollTop);
}
export function restoreDetailScroll(key: string, el: HTMLElement | null | undefined) {
  const target = detailScrolls.get(key) ?? 0;
  if (!el) return;
  if (target <= 0) { el.scrollTop = 0; return; }
  let attempts = 0;
  const tick = () => {
    if (el.scrollHeight >= target + el.clientHeight || attempts >= 30) {
      el.scrollTop = target;
      return;
    }
    attempts += 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
