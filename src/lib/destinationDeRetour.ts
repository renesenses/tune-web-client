/**
 * OÙ UN BOUTON « RETOUR » A LE DROIT DE RAMENER — #1134.
 *
 * ## Le défaut d'origine
 *
 * schmitt (Alain), fil forum 1758, 11/09/2026 : « la mise en place de la vue
 * pleine écran, le fait de cliquer sur l'écran nous fait bien sortir du mode
 * plein écran mais la touche "retour" en haut à gauche nous remet le plein
 * écran a la place de nous faire revenir en arrière ».
 *
 * Trois lignes suffisaient :
 *
 *   1. `stores/navigation.ts` — `previousView` suit TOUT changement de vue,
 *      sans exception. Il dit « la vue d'avant », pas « la vue à laquelle ce
 *      geste-ci doit rendre la main ».
 *   2. `TvView.exitTv()` — sortir du Grand écran ramène à « Lecture en
 *      cours » ; cette navigation `tv → nowplaying` pose donc
 *      `previousView = 'tv'`.
 *   3. `NowPlaying` — son bouton Retour excluait `'nowplaying'` et RIEN
 *      d'autre : il repartait vers `'tv'` et remontait le Grand écran.
 *
 * ## Pourquoi une TABLE, et pas un `!== 'tv'` de plus
 *
 * Le bouton n'avait pas tort sur `'tv'` par hasard : il n'avait aucune notion
 * de ce qu'est une destination. Ajouter un nom à côté de l'autre aurait laissé
 * les mêmes trous ailleurs — et le recensement en a trouvé (les deux fiches de
 * streaming, plus bas).
 *
 * 🔴 `Record<View, …>` et pas un tableau : le type oblige à citer CHAQUE membre
 * de `View`. Ajouter une vue à `stores/navigation` sans trancher son cas ici ne
 * compile pas. C'est le même parti que `routeAuChargement.ts`, pour la même
 * raison : une table qui dérive en silence redevient un piège que personne ne
 * voit avant un testeur.
 *
 * ⚠️ Ce module ne dit RIEN de l'historique du navigateur (`historiqueCoquille`,
 * le Précédent) : il ne répond qu'à la question « cette vue-ci est-elle une
 * destination », posée par les boutons Retour INTERNES qui lisent
 * `previousView`.
 */
import { get } from 'svelte/store';
import type { View } from './stores/navigation';
import { ficheAlbumService, ficheArtisteService } from './stores/streaming';

/**
 * - `destination` : un écran où l'utilisateur a navigué et qu'il peut retrouver
 *   tel qu'il l'a laissé.
 * - `jamais` : le nom existe, mais aucun retour ne doit y mener.
 * - `siSaFicheEstGarnie` : la vue ne tient debout que si son magasin de contenu
 *   est encore rempli.
 */
export type AptitudeRetour = 'destination' | 'jamais' | 'siSaFicheEstGarnie';

export const APTITUDES: Record<View, AptitudeRetour> = {
  home: 'destination',
  nowplaying: 'destination',
  library: 'destination',
  queue: 'destination',
  playlists: 'destination',
  playlistmanager: 'destination',
  smartplaylists: 'destination',
  'smart-ai': 'destination',
  ambiance: 'destination',
  browse: 'destination',
  search: 'destination',
  settings: 'destination',
  history: 'destination',
  streaming: 'destination',
  metadata: 'destination',
  radios: 'destination',
  radiofavorites: 'destination',
  genres: 'destination',
  mediaservers: 'destination',
  favorites: 'destination',
  podcasts: 'destination',
  zonemanager: 'destination',
  diagnostics: 'destination',
  collections: 'destination',
  smartcollections: 'destination',
  dashboard: 'destination',
  services: 'destination',
  genretree: 'destination',
  equalizer: 'destination',
  crossfeed: 'destination',
  plugins: 'destination',
  alarms: 'destination',
  converter: 'destination',
  declick: 'destination',
  shortcuts: 'destination',
  tags: 'destination',
  oxygen: 'destination',
  support: 'destination',
  bandcamp: 'destination',
  concerts: 'destination',
  pontroon: 'destination',
  lecturecd: 'destination',
  // #4806 — l'écran « Titres bannis », voisin des sélections de l'utilisateur.
  bannedtracks: 'destination',

  // ─── Celles où un Retour ne doit JAMAIS mener, et pourquoi ───────────────
  //
  // `tv` — LE DÉFAUT D'ALAIN. Le Grand écran est un MODE, pas un écran où l'on
  // se rend : son unique sortie (`exitTv`, sur clic ou Échap) ramène à
  // « Lecture en cours », donc `previousView` vaut `'tv'` juste après. Un
  // Retour qui y revient remonte le mode que l'utilisateur vient de quitter —
  // et sans le plein écran natif, puisque ce chemin ne repasse pas par
  // `enterTvMode()` / `requestFullscreen()` : exactement ce que la vidéo du
  // testeur montre.
  //
  // C'est aussi la lecture de #1158, qui a écarté `tv` de la restauration par
  // l'adresse : « `tv` a déjà son chemin de démarrage à part dans `App.svelte`
  // (`#tv&zone=12`) ». La vue TV s'entre par un geste qui lui est propre et
  // porte son contexte ; aucun mécanisme générique ne doit la reconstituer.
  tv: 'jamais',
  // `login`, `onboarding` — des ÉTATS que l'application constate elle-même,
  // jamais des écrans demandés. `App.svelte` le dit déjà pour le premier :
  // « RIEN ne pose jamais cette vue ». Aujourd'hui aucun code ne les pose,
  // donc aucune de ces deux lignes ne change quoi que ce soit : elles sont ici
  // pour que le jour où l'une sera posée, le Retour ne renvoie pas un
  // utilisateur connecté sur un écran de connexion. Ce sont les mêmes que
  // `routeAuChargement` refuse de reposer, pour la même raison.
  //
  // `offline` a disparu avec son écran le 20/09/2026.
  login: 'jamais',
  onboarding: 'jamais',

  // ─── Celles qui dépendent de leur magasin ────────────────────────────────
  //
  // 🔴 TROUVÉES PAR LE RECENSEMENT DE #1134, même famille que `tv`.
  //
  // Les deux fiches de STREAMING ne portent pas leur contenu : il vit dans
  // `ficheAlbumService` / `ficheArtisteService`. Or leur propre bouton de
  // fermeture VIDE le magasin AVANT de changer de vue
  // (`ShellV2.fermerAlbumService`, `ArtisteServiceV2.retour`). Une fiche
  // refermée depuis « Lecture en cours » laisse donc `previousView` pointer
  // sur une vue dont le magasin est nul, et `ShellV2` retombe sur son repli
  // « À venir » (`{:else if $activeView === 'streamingalbum' && $ficheAlbumService}`).
  //
  // ⚠️ Surtout pas un `jamais` : tant que le magasin est GARNI — l'utilisateur
  // était sur la fiche Qobuz et a lancé la lecture — y revenir est le bon
  // geste. C'est la seule des trois catégories qui se décide à l'instant du
  // clic, d'où la lecture de magasin plutôt qu'une simple table.
  streamingalbum: 'siSaFicheEstGarnie',
  streamingartist: 'siSaFicheEstGarnie',
};

/** Le magasin qui porte le contenu d'une vue `siSaFicheEstGarnie`. */
function ficheGarnie(vue: View): boolean {
  if (vue === 'streamingalbum') return get(ficheAlbumService) !== null;
  if (vue === 'streamingartist') return get(ficheArtisteService) !== null;
  return true;
}

/**
 * `vue` est-elle une destination de retour acceptable pour un bouton porté par
 * `depuis` ?
 *
 * `depuis` est la vue qui porte le bouton : on ne se renvoie pas sur soi-même.
 * C'est ce que faisaient déjà les deux appelants, chacun avec sa propre
 * comparaison en dur (`!== 'nowplaying'`, `!== 'tv'`).
 */
export function estDestinationDeRetour(vue: View | null | undefined, depuis: View): boolean {
  if (!vue || vue === depuis) return false;
  const aptitude = APTITUDES[vue];
  if (aptitude === undefined) return false; // une vue hors union : on n'y va pas.
  if (aptitude === 'jamais') return false;
  if (aptitude === 'siSaFicheEstGarnie') return ficheGarnie(vue);
  return true;
}

/** La vue où un bouton Retour doit mener : `precedente` si elle est tenable, sinon `repli`. */
export function destinationDeRetour(
  precedente: View | null | undefined,
  options: { depuis: View; repli: View },
): View {
  return estDestinationDeRetour(precedente, options.depuis) ? (precedente as View) : options.repli;
}
