/**
 * Amorçage des données du nouveau client.
 *
 * POURQUOI CE FICHIER EXISTE. Les stores partagés (`zones`, `albums`,
 * `devices`) sont de simples `writable([])` : ils ne se remplissent pas
 * seuls. Ce sont `App.svelte`, `LibraryView.svelte` et consorts qui les
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
import { albums, libraryLoading } from './stores/library';
import { tuneWS } from './websocket';
import { devices } from './stores/devices';
import { loadProfiles, loadFavoriteIds, currentProfileId } from './stores/profile';
import { loadLicense } from './stores/license';
import { zoneInitiale } from './zoneInitiale';


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
  const list = await api.getZones();
  zones.set(list);
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
 * Albums, en deux temps comme la vue historique : une première page rendue
 * tout de suite, puis le reste. Sur une grosse bibliothèque, l'utilisateur
 * voit la grille se remplir au lieu d'attendre devant un écran vide.
 */
async function loadAlbums(): Promise<void> {
  libraryLoading.set(true);
  try {
    // 🔴 AUCUN tri demandé au serveur — et ce n'est pas un oubli.
    //
    // Signalé sur le forum le 05/09/2026 : « je n'ai pas vu de possibilité de
    // tri des albums par date d'ajout dans la nouvelle interface ». L'option
    // « Ajout récent » existe pourtant dans la Bibliothèque ; elle ne s'affiche
    // que si la donnée est là, et elle ne l'était jamais.
    //
    // Mesuré sur le .18, même bibliothèque, même limite :
    //
    //     GET /library/albums?limit=50&offset=0                  -> 50/50 avec added_at
    //     GET /library/albums?limit=50&offset=0&sort=title&…      ->  0/50
    //     …&sort=artist / &sort=year / &sort=added               ->  0/50
    //
    // Le serveur a deux chemins, et le chemin TRIÉ perd `added_at` — quelle
    // que soit la clé demandée, y compris `added` lui-même. Issue serveur
    // ouverte.
    //
    // Ne rien demander suffit ici : tous les écrans du nouveau client trient
    // eux-mêmes ce qu'ils affichent, l'ordre du serveur ne sert à personne.
    // Vérifié que la pagination non triée reste stable sur cette base — deux
    // lectures des pages 0 et 1 rendent la même chose, sans recouvrement,
    // 200 identifiants distincts pour 200 attendus.
    const first = await api.getAllAlbums(100, null, null, 1, 100);
    albums.set(first);
    libraryLoading.set(false);
    if (first.length >= 100) {
      const rest = await api.getAllAlbums(2000, null, null);
      albums.set(rest);
    }
  } finally {
    libraryLoading.set(false);
  }
}

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
 * 🔴 RECHARGER la bibliothèque quand le serveur dit qu'elle a changé.
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
 * `LibraryView` porte d'ailleurs le commentaire qui nomme le premier : « il
 * fallait changer d'onglet puis revenir pour voir arriver les albums qu'on
 * venait de déposer (Patatorz, fil #1517) ». Corrigé là-bas, jamais porté ici.
 *
 * On recharge la LISTE seulement : les écrans dérivent tout de `albums`, et
 * `libraryLoading` fait le reste. Rendre l'abonnement permet de le couper au
 * démontage de la coquille.
 */
export function suivreLaBibliotheque(): () => void {
  return tuneWS.onEvent((event: { type?: string }) => {
    if (event?.type === 'library.scan.completed' || event?.type === 'library.updated') {
      void loadAlbums();
    }
  });
}

export async function bootstrapV2(): Promise<void> {
  // `loadLicense()` ne vit lui aussi que dans App.svelte. Sans lui, le palier
  // reste 'free' et la CLE de licence nulle : le Support ne peut pas lister
  // les tickets (ils sont interroges par cle), et toute fonction premium se
  // croit indisponible.
  await Promise.allSettled([loadZones(), loadAlbums(), loadDevices(), loadProfile(), loadLicense()]);
}
