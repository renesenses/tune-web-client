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
import { devices } from './stores/devices';
import { loadProfiles, loadFavoriteIds, currentProfileId } from './stores/profile';
import { loadLicense } from './stores/license';

/** Zones + sélection courante. Sans zone, aucune lecture n'est possible. */
async function loadZones(): Promise<void> {
  const list = await api.getZones();
  zones.set(list);
  // La zone mémorisée prime, mais seulement si elle existe ENCORE : une zone
  // supprimée depuis la dernière session laisserait sinon l'interface pointer
  // dans le vide, avec des boutons Lire silencieusement inertes.
  const saved = get(currentZoneId);
  const stillThere = saved != null && list.some((z) => z.id === saved);
  if (!stillThere && list.length) currentZoneId.set(list[0].id ?? null);
}

/**
 * Albums, en deux temps comme la vue historique : une première page rendue
 * tout de suite, puis le reste. Sur une grosse bibliothèque, l'utilisateur
 * voit la grille se remplir au lieu d'attendre devant un écran vide.
 */
async function loadAlbums(): Promise<void> {
  libraryLoading.set(true);
  try {
    const first = await api.getAllAlbums(100, 'title', 'asc', 1, 100);
    albums.set(first);
    libraryLoading.set(false);
    if (first.length >= 100) {
      const rest = await api.getAllAlbums(2000, 'title', 'asc');
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
export async function bootstrapV2(): Promise<void> {
  // `loadLicense()` ne vit lui aussi que dans App.svelte. Sans lui, le palier
  // reste 'free' et la CLE de licence nulle : le Support ne peut pas lister
  // les tickets (ils sont interroges par cle), et toute fonction premium se
  // croit indisponible.
  await Promise.allSettled([loadZones(), loadAlbums(), loadDevices(), loadProfile(), loadLicense()]);
}
