/**
 * Amorçage des données du nouveau client.
 *
 * POURQUOI CE FICHIER EXISTE. Les stores partagés (`zones`, `devices`) sont
 * de simples `writable([])` : ils ne se remplissent pas seuls. Ce sont `App.svelte`, `LibraryView.svelte` et consorts qui les
 * alimentent — or le mode `?v2` monte `ShellV2` À LA PLACE de `App`, et ne
 * monte aucun de ces composants.
 *
 * Conséquence mesurée avant correction : en `?v2`, l'app historique affichait
 * 27 zones, le v2 en affichait 0. Le lecteur restait muet, la grille
 * d'albums vide et les boutons Lire sans effet — non pas parce que les
 * données manquaient, mais parce que personne ne les avait demandées. Un
 * écran vide qui ressemble à une réponse est pire qu'une erreur.
 *
 * La coquille v2 appelle donc `bootstrapV2()` au montage. Les chargements
 * sont indépendants : l'échec de l'un ne prive pas des autres.
 */
import { get } from 'svelte/store';
import * as api from './api';
import { zones, currentZoneId } from './stores/zones';
import { invaliderBibliotheque } from './stores/albumsPagines';
import { tuneWS } from './websocket';
import { devices } from './stores/devices';
import { loadProfiles, loadFavoriteIds, currentProfileId } from './stores/profile';
import { loadLicense } from './stores/license';
import { zoneInitiale } from './zoneInitiale';
import { chargerLesZones } from './chargementDesZones';


/**
 * La zone préférée sur CET appareil (`preferences.defaultZoneId`), ou `null`.
 *
 * Chargée à la demande, et non importée en tête de fichier : le module
 * `stores/preferences` lit `localStorage` au chargement, ce qui jette hors
 * d'un navigateur. L'importer statiquement ici faisait échouer
 * `bibliothequeVivante.test.ts`, qui monte l'amorçage en environnement `node`
 * — un test vert avant, rouge après, et sans rapport avec la sélection de
 * zone. Une préférence d'appareil illisible n'est pas une panne : on
 * n'en tient simplement pas compte.
 */
async function defautDAppareil(): Promise<number | null> {
  try {
    const { preferences } = await import('./stores/preferences');
    return get(preferences).defaultZoneId ?? null;
  } catch {
    return null;
  }
}

/** Zones + sélection courante. Sans zone, aucune lecture n'est possible. */
async function loadZones(): Promise<void> {
  // 🔴 #1096 — passe par `chargerLesZones`, qui RÉESSAIE et tient l'état du
  // chargement. Un `await api.getZones()` nu ici jetait dans le
  // `Promise.allSettled` ci-dessous : l'échec était avalé, le magasin restait
  // à `[]`, et l'écran Zones concluait « Aucune zone » pendant que le serveur
  // en portait quatorze. `null` = tous les essais ont échoué ; on ne touche
  // alors NI à la liste NI à la sélection.
  const list = await chargerLesZones((zs) => zones.set(zs));
  if (list === null) return;
  // La zone mémorisée prime, mais seulement si elle existe ENCORE : une zone
  // supprimée depuis la dernière session laisserait sinon l'interface pointer
  // dans le vide, avec des boutons Lire silencieusement inertes.
  // La règle vit dans `zoneInitiale`, partagée avec l'interface actuelle.
  // Elle prenait ici la PREMIÈRE de la liste, là où l'autre coquille préfère
  // la zone qui joue : sur un appareil neuf, les deux interfaces du même
  // serveur se posaient sur deux zones différentes, et les vumètres — qui ne
  // rendent que la zone SÉLECTIONNÉE — restaient à zéro d'un côté.
  const actuelle = get(currentZoneId);
  const cible = zoneInitiale(list, actuelle, await defautDAppareil());
  // ⚠️ Jamais `set(null)` : sur une liste VIDE — serveur qui démarre, appel
  // qui a échoué — la version précédente ne touchait pas à la sélection, et
  // l'écraser ici rendait tout bouton Lire inerte jusqu'au rechargement.
  if (cible != null && cible !== actuelle) currentZoneId.set(cible);
}

/**
 * 🔴 PLUS DE CHARGEMENT DES ALBUMS ICI — renesenses/tune-server-rust#4800.
 *
 * `loadAlbums` vivait là : des requêtes en série (100, puis des lots de
 * 2 000), 3,5 Mo de JSON sur 9 427 albums, à CHAQUE ouverture, relancées à chaque
 * `library.scan.completed`. Pendant ~158 s de connexion de lecture occupée,
 * une requête sur trois attendait derrière (cause 2 de l'épique) — d'où les
 * widgets en « Chargement… » puis « délai ».
 *
 * La Bibliothèque se sert désormais PAR PAGES (`stores/albumsPagines`), et les
 * écrans qui ont besoin de la liste entière la demandent eux-mêmes, quand ils
 * en ont besoin (`demanderBibliothequeEntiere`). Le magasin `albums` reste
 * `[]` tant que personne ne l'a demandé.
 */

async function loadDevices(): Promise<void> {
  devices.set((await api.getDevices()) ?? []);
}

/**
 * Profil courant + identifiants de favoris.
 *
 * `loadProfiles()` n'est appelé que par App.svelte : sans lui, `currentProfileId`
 * reste celui du localStorage — ou null au premier lancement — et TOUT ce qui
 * dépend du profil (favoris, cœurs) est inerte en `?v2`. Les identifiants de
 * favoris sont chargés dans la foulée : ils servent aux boutons cœur, qui
 * doivent répondre « est-ce un favori ? » sans un appel réseau par ligne.
 */
async function loadProfile(): Promise<void> {
  await loadProfiles();
  await loadFavoriteIds(get(currentProfileId));
}

/** Charge tout ce dont la coquille v2 dépend. Ne rejette jamais : chaque
 *  chargement échoue isolément, pour qu'une panne de découverte réseau ne
 *  vide pas la bibliothèque. */
/**
 * 🔴 INVALIDER la bibliothèque quand le serveur dit qu'elle a changé.
 *
 * DOUZIÈME « écrit mais pas branché » de ce client. Les événements existent et
 * sont émis depuis longtemps ; `library.scan.completed` et `library.updated`
 * sont traités dans SEPT fichiers de l'ancien client — `App`, `LibraryView`,
 * `HomeView`, `MetadataView`, `OnboardingWizard`, `SettingsView` — et dans
 * AUCUN de la v2. Le magasin `albums` était donc rempli une fois, au montage,
 * et plus jamais.
 *
 * Trois témoins pour le même symptôme :
 *
 *  - « pas de rafraîchissement de la vue bibliothèque après ajout d'albums »
 *    (Patatorz, forum 1517, 22/08/2026) ;
 *  - « après une indexation, les albums n'apparaissent pas immédiatement dans
 *    la fenêtre Bibliothèque » (Gros Bidon, forum 1688, 06/09/2026) ;
 *  - « il faut rafraîchir le navigateur pour les voir » (Patatorz, forum 1680,
 *    à propos des répertoires — même famille).
 *
 * 🔴 #4800 — on n'y RECHARGE plus rien : on INVALIDE. Recharger 3,5 Mo à
 * chaque fin de scan était la moitié de la cause 3. Les pages tombent et
 * chaque écran monté redemande ce qu'il montre ; un écran qui ne montre pas
 * la bibliothèque ne coûte rien. Rendre l'abonnement permet de le couper au
 * démontage de la coquille.
 */
export function suivreLaBibliotheque(): () => void {
  return tuneWS.onEvent((event: { type?: string }) => {
    if (event?.type === 'library.scan.completed' || event?.type === 'library.updated') {
      invaliderBibliotheque();
    }
  });
}

export async function bootstrapV2(): Promise<void> {
  // `loadLicense()` ne vit lui aussi que dans App.svelte. Sans lui, le palier
  // reste 'free' et la CLE de licence nulle : le Support ne peut pas lister
  // les tickets (ils sont interroges par cle), et toute fonction premium se
  // croit indisponible.
  //
  // 🔴 `syncPreferencesFromServer()` : meme famille, meme cause, et c'est le
  // douzieme « ecrit mais pas branche » de cette liste. La seule ligne qui
  // relit les preferences ENREGISTREES vit dans `App.svelte`, que `?v2` ne
  // monte jamais. La nouvelle interface ne lisait donc QUE `localStorage` :
  //
  //   - un navigateur neuf, ou un vidage de cache, repartait aux defauts alors
  //     que le serveur portait les reglages ;
  //   - et depuis que `ui_preferences` est range PAR PROFIL cote serveur
  //     (tune-server-rust#3991), changer de profil ne ramenait rien du tout —
  //     chacun gardait le blob du dernier passage sur cet appareil.
  //
  // Constate en mesurant le lot B dans Chrome : le pere ne retrouvait pas son
  // theme apres le passage du fils. Ce n'etait pas le banc, c'etait ceci.
  // ⚠️ Import DYNAMIQUE, et c'est necessaire. `stores/preferences` lit
  // `localStorage` et applique le theme A L'EVALUATION DU MODULE, pour eviter
  // le flash au demarrage. L'importer en tete ferait entrer ces effets dans le
  // graphe de tout fichier qui importe ce module — y compris les bancs de test
  // qui tournent en `node`, ou `localStorage` n'existe pas. Un test etranger
  // est tombe ainsi (`bibliothequeVivante`, 12/09/2026) : il n'appelle meme pas
  // `bootstrapV2`, il importait seulement `suivreLaBibliotheque`.
  const preferences = import('./stores/preferences').then((m) =>
    m.syncPreferencesFromServer(),
  );

  await Promise.allSettled([
    loadZones(),
    loadDevices(),
    loadProfile(),
    loadLicense(),
    preferences,
  ]);
}
