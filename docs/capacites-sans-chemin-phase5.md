# Capacités sans chemin — mesure finale du 19/09/2026

Question : **quelles fonctions de `src/lib/api.ts` ne sont appelées QUE par les
fichiers que la phase 5 supprime ?** Tant qu'une telle fonction existe, retirer
l'ancienne interface retire la capacité qu'elle porte.

## Historique de la mesure

| Date | Orphelines | Ce qui a changé |
|---|---|---|
| 19/09, avant portage | 114 | première mesure, faite au moment de fusionner — la phase est passée en brouillon |
| 19/09, après les lots 1 à 4 | 39 | remesure sur `main` : un 5ᵉ lot nécessaire (voir ci-dessous) |
| 19/09, après le lot 5 | **25** | aucune n'est une capacité perdue — détail plus bas |

Lots de portage fusionnés : #1270 (réglages système), #1279 (zones), #1284
(bibliothèque), #1296 (contenus), #1299 (radios, Radio France, greffons,
Bandcamp, DR, zones), #1302 (garde de l'entrée Concerts).

## Méthode, et les trois pièges qu'elle a coûté

Une fonction est orpheline si un fichier condamné l'APPELLE (`api.f`, avec
espaces et retour à la ligne tolérés, ou import nommé depuis `api`) et
qu'aucun fichier vivant ne le fait — tests, fichiers de langue et `api.ts`
exclus.

1. Compter les **mentions** au lieu des appels : une clé de traduction
   homonyme (`settings.unignoreDevice`) faisait passer une fonction pour vivante.
2. Retirer les commentaires `/* … */` par expression régulière : une chaîne
   contenant `/*` (`accept="audio/*"`) avalait du code, et faisait passer des
   fonctions vivantes (`getTunePeers`) pour orphelines.
3. Vérifier par une boucle zsh sur une variable multi-lignes non citée : zsh ne
   la découpe pas, `grep` reçoit toute la liste comme un seul motif et déclare
   tout trouvé. C'est ainsi que radios, Radio France, Bandcamp et greffons ont
   été crus portés — d'où le lot 5.

## Les 25 restantes, et pourquoi aucune n'est une perte

| Raison | Fonctions |
|---|---|
| utilitaires internes d'`api.ts` | `erreurDepuisReponse`, `apiPatch` |
| même geste par un autre chemin en v2 | `updateZoneDlnaLpcm` (`RendererConfig` pose `dlna_lpcm`), `createArtist` et `updateTrack` (`updateTrackMetadata`, `setTracksArtist`), `triggerEnrich` (`startBatchEnrich`), `quickFavTrack` (favoris), `getDoubtfulAlbums` (pistes douteuses), `getAlbumDynamicRanges` (le DR est lu sur chaque album, tranche DR portée au lot 5) |
| même gestionnaire serveur | `youtubeAuthDeviceCode`, `youtubeAuthPoll`, `youtubeAuthLogout`, `youtubeAuthStatus` — les routes dédiées et la route générique de la v2 aboutissent à `service_auth` |
| chargeurs de listes remplacés | `getAlbums`, `getAllAlbumsSeeded`, `getTracks` |
| présentation, pas capacité | `listGroups` (grappes de zones), `getHomePage` (l'accueil v2 est une page de widgets) |
| **n'ont jamais fonctionné** | `importRoon`, `importPlex` (contrat rompu des deux côtés, mis de côté le 01/09), `importPlaylists` (bouchon serveur « not yet implemented »), `listSnapcastClients`, `assignSnapcastClient` (ni type de sortie ni route `assign` côté serveur) |
| écran déjà mort | `onboardingStep`, `skipOnboarding` — `OnboardingView` n'était monté par personne (14/09) |

## Défauts de l'interface actuelle corrigés pendant le portage

- #1280 revenu : la croix d'un appareil réseau ne l'ignorait pas durablement.
- La restauration d'une sauvegarde n'avait jamais été atteignable (aucun bouton).
- Un serveur en état critique ne se signalait nulle part.
- La désinstallation d'un greffon passait toujours par la boutique.
- « Mise à jour disponible » sans bouton pour la faire.
- Les artistes de la recherche Bandcamp étaient jetés.
- Trois écrans hérités sans réserve de gouttière (barre d'outils sous la grappe).
- L'entrée Concerts sans garde de greffon (régression du lot 4, #1302).

## Angle mort (hors `api.ts`) — journalisation, nettoyage, cache

La mesure ci-dessus ne lit que les fonctions d’`api.ts`. Un relevé des appels
par chemin en dur (`fetch` direct, lien, `apiFetch`/`apiPost` avec route écrite
— #1301, section « Angle mort ») a trouvé huit capacités que la phase 5 (#1257,
fusionnée) a retirées sans chemin v2. Cette section dit lesquelles sont rétablies.

| Écran supprimé | Route | Chemin v2 |
|---|---|---|
| `SettingsView` | `GET` / `POST /system/log-level` (niveau des journaux serveur) | ✅ **porté** (`feat/v2-porte-maintenance`) : Réglages › Système › Santé du serveur (niveau Expert, comme avant), `api.getLogLevel` / `api.setLogLevel` ; l'écran dit que le niveau s'applique pleinement au redémarrage (`note` du serveur) et traite le `200 { error }` d'un niveau refusé comme un échec |
| `DiagnosticsView` | `POST /system/cleanup` (nettoyage serveur) | ✅ **porté** : même section, `api.cleanupServer`, derrière `dialogs.confirm` (danger) ; affiche les champs que le serveur rend réellement (`duplicate_albums_merged`, `orphan_*`, `duplicate_tracks_removed`, `db_optimized`) — l'ancien écran lisait `stale_artwork_deleted`, `old_history_deleted`, `db_vacuumed`, qui n'existent plus |
| `DiagnosticsView` | `POST /system/clear-cache` (« Vider le cache artwork ») | ✅ **porté** sous son vrai nom, « Effacer le rapport d'analyse » : `api.clearScanReport`, derrière `dialogs.confirm`. Le serveur (`config::clear_cache`) n'efface que le réglage `scan_result` et répond `{ cleared: true }` — l'ancien écran annonçait « true fichiers supprimés » |

Témoin : `src/lib/__tests__/maintenanceServeurV2.test.ts`.
