# Capacités sans chemin dans l’interface actuelle — mesure du 19/09/2026

Question posée : **quelles fonctions de `src/lib/api.ts` ne sont appelées que par
les 64 vues que la phase 5 supprime ?** Tant que `?v2=0` existe, ces capacités
restent atteignables par l’ancienne interface. Après la phase 5, **plus aucun
écran n’y mène**.

**114 fonctions sans aucun chemin vivant.**

Exemple vérifié à la main : la gestion des appareils ignorés (`listIgnoredDevices`,
`unignoreDevice`). Elle n’existe que dans `SettingsView.svelte` ; aucun écran v2
n’appelle `unignoreDevice`. Sans l’ancienne interface, un appareil ignoré par
erreur ne peut plus être rétabli depuis l’interface.

## Méthode, et ses limites

1. une fonction exportée par `api.ts` est « orpheline » si son nom apparaît dans
   au moins une vue supprimée (version `origin/main`) et nulle part dans le code
   vivant — commentaires, fichiers de langue, tests et `api.ts` lui-même exclus ;
   une première mesure qui les incluait en ratait 14 (une route citée dans un
   commentaire, une clé de traduction homonyme de la fonction) ;
2. elle est « couverte » si une fonction vivante appelle la même méthode et la
   même route, ou si la route apparaît en dur dans le code vivant.

⚠️ Ce relevé ne dit pas que chaque capacité MARCHAIT dans l’ancienne interface
(l’import Roon/Plex n’a jamais fonctionné), ni qu’elle est indispensable. Il dit
qu’après la phase 5, aucun écran n’y mène. Chaque domaine est à arbitrer :
porter en v2, abandonner, ou garder le filet.

## Zones : groupes, délais, OAAT, latence, Snapcast (16)

- `addOaatEndpoint` — `POST /zone-manager/oaat-groups/{}/endpoints`
- `assignSnapcastClient` — `POST /snapcast/clients/{}/assign`
- `createGroup` — `POST /zone-manager/groups`
- `createOaatGroup` — `POST /zone-manager/oaat-groups`
- `deleteGroup` — `DELETE /zone-manager/groups/{}`
- `deleteOaatGroup` — `DELETE /zone-manager/oaat-groups/{}`
- `getOaatGroups` — `GET /zone-manager/oaat-groups`
- `getOaatGroupStatus` — `GET /zone-manager/oaat-groups/{}`
- `listGroupDelays` — `GET /zones/group-delays`
- `listGroups` — `GET /zones/groups/list`
- `listSnapcastClients` — `GET /snapcast/clients`
- `measureLatency` — `POST /zone-manager/measure-latency`
- `removeOaatEndpoint` — `DELETE /zone-manager/oaat-groups/{}/endpoints/{}`
- `setGroupDelay` — `PUT /zones/group-delays`
- `setOaatEndpointVolume` — `PUT /zone-manager/oaat-groups/{}/endpoints/{}/volume`
- `setOaatGroupVolume` — `PUT /zone-manager/oaat-groups/{}/volume`

## Sorties : appairage AirPlay, préréglages d’appareil, envoi de fichier (5)

- `getAirplayPairStatus` — `GET /outputs/{}/airplay/pair-status`
- `getZoneDevicePresets` — `GET /zones/{}/device-presets`
- `startAirplayPairing` — `POST /outputs/{}/airplay/pair-start`
- `submitAirplayPairPin` — `POST /outputs/{}/airplay/pair-pin`
- `uploadAudioFile` — `POST /zones/upload`

## Appareils ignorés (3)

- `ignoreDevice` — `POST /devices/{}/ignore`
- `listIgnoredDevices` — `GET /devices/ignored`
- `unignoreDevice` — `DELETE /devices/{}/ignore`

## Réseau : SMB, découverte d’hôtes (6)

- `discoverSmbShares` — `GET /network/shares`
- `getNetworkDiagnostics` — `GET /system/diagnostics/network`
- `listSmbMounts` — `GET /network/smb/mounts`
- `mountSmbShare` — `POST /network/smb/mount`
- `scanHost` — `GET /network/scan-host`
- `testSmbConnection` — `POST /network/smb/mount`

## Système : sauvegardes, base, imports Roon/Plex, santé, tâches (17)

- `createBackup` — `POST /system/backups`
- `enableYoutubePlayback` — `POST /system/youtube/enable`
- `exportDatabaseUrl` — `GET /system/database/export`
- `getBackgroundTasks` — `GET /system/background-tasks`
- `getBackups` — `GET /system/backups`
- `getHealthMonitor` — `GET /system/health/monitor`
- `getTunePeers` — `GET /system/peers`
- `getYoutubeStatus` — `GET /system/youtube/status`
- `importDatabase` — `POST /system/database/import`
- `importPlaylists` — `POST /system/import/playlists`
- `importPlex` — `POST /system/import/plex`
- `importRoon` — `POST /system/import/roon`
- `onboardingStep` — `POST /onboarding/step/{}`
- `rearmAsioWarmScan` — `POST /system/audio/asio-warm-scan/rearm`
- `rebuildFts` — `POST /system/database/rebuild-fts`
- `restoreBackup` — `POST /system/backups/{}/restore`
- `triggerEnrich` — `POST /system/enrich`

## Appliance (Tune OS) : stockage, installation, arrêt (7)

- `applianceInstallStatus` — `(route ?)`
- `applianceInstallToDisk` — `(route ?)`
- `applianceMountVolume` — `(route ?)`
- `applianceRelocateData` — `(route ?)`
- `applianceShutdown` — `(route ?)`
- `getApplianceDataStatus` — `(route ?)`
- `getApplianceStorage` — `(route ?)`

## Greffons et catalogue (3)

- `getMarketplaceCatalog` — `GET /marketplace/plugins`
- `uninstallPlugin` — `DELETE /plugins/{}`
- `updatePlugin` — `POST /plugins/{}/update`

## Égaliseur : préréglages enregistrés (3)

- `createEqPreset` — `POST /eq/presets`
- `deleteEqPreset` — `DELETE /eq/presets/{}`
- `listEqPresets` — `GET /eq/presets`

## Licence et cloud (1)

- `validateLicense` — `POST /cloud/license/validate`

## Bibliothèque : édition, notation, ré-identification, signalement (15)

- `albumBetterQuality` — `GET /library/albums/{}/better-quality`
- `createArtist` — `POST /library/artists`
- `deleteTag` — `DELETE /tags/{}`
- `enrichArtist` — `GET /metadata/artists/{}/enrich`
- `getAlbumRating` — `GET /library/albums/{}/rating`
- `getArtistCredits` — `GET /library/artists/{}/credits`
- `getArtistMetadata` — `GET /library/artists/{}/metadata`
- `quickFavTrack` — `POST /library/tracks/{}/quick-fav`
- `rateAlbum` — `POST /library/albums/{}/rate`
- `reidentifyAlbum` — `POST /library/albums/{}/reidentify`
- `reportMetadata` — `POST /library/reports`
- `trackBetterQuality` — `GET /library/tracks/{}/better-quality`
- `updateTag` — `PUT /tags/{}`
- `updateTrack` — `PUT /library/tracks/{}`
- `uploadArtistImage` — `POST /library/artists/{}/image/upload`

## Historique, accueil et tableau de bord (9)

✅ **Porté ou couvert — plus aucune perte d’accès pour ce domaine** (branche
`feat/v2-porte-historique`, témoins `src/lib/__tests__/porteHistoriqueAccueilPhase5.test.ts`).

- `getDashboard` — `GET /library/history/dashboard` — ✅ **porté** : Historique,
  onglet « Statistiques » (`v2/StatistiquesEcouteV2.svelte`) — période, totaux et
  leurs légendes (#1155), tendance, classements artistes / albums / titres /
  radios (album, titre et radio jouables), série, « il y a quelques années »,
  genres rangés par l’arbre des genres, carte semaine × heure, par zone, par
  source, durées enregistrées, et l’export CSV de l’historique
  (`exportHistoryCsv`, `GET /library/history/export` — authentifié, ce que le
  simple lien de l’écran d’origine n’était pas).
- `getHistoryAtSlot` — `GET /library/history/at` — ✅ **porté** : même onglet, un
  clic sur une case de la carte semaine × heure liste ce qui jouait alors ; chaque
  titre se rejoue.
- `getHistoryDashboard` — `GET /library/history/dashboard` — ✅ **couvert** :
  même route que `getDashboard` (sans `period` ni `top_n`, donc non bornée). Aucun
  écran ne l’appelait : `DashboardHighlights.svelte:97` ne la cite qu’en
  commentaire, pour dire qu’il lui préfère `getDashboard`.
- `getHomePage` — `GET /home` — ⛔ **non porté, capacité morte** : l’ancien
  accueil (`HomeView.svelte:412`) n’en lisait que `profile_name`, que le serveur ne
  rend pas (`tune-server/src/routes/home.rs`, `home_page` → `{"sections": …}`
  seulement). Rien ne s’affichait. Les sections de `/home` ont chacune leur bande
  v2 (`reprendre`, `recemment-ajoutes`, `plus-ecoutes`, `radios-artistes`,
  `recommandations`).
- `getRecentlyAdded` — `GET /home/recently-added` — ✅ **porté** : accueil, bandes
  « Ajouts récents · 15 jours » et « · 30 jours » (`ajouts-15-jours`,
  `ajouts-30-jours`, mode édition → Ajouter), plafond 500 comme l’onglet d’origine
  (#3039).
- `getRecentlyAddedSummary` — `GET /home/recently-added/summary` — ✅ **porté** :
  le bilan « N albums · N pistes · durée » s’affiche sous le titre de ces deux
  bandes, sur la même fenêtre (`Widget.resume`).
- `getRecommendations` — `GET /library/recommendations` — ✅ **couvert** : le
  serveur y rend `AlbumRepo::list_recent(limit)`
  (`routes/library/albums.rs`, `recommendations`), exactement ce que rend
  `GET /library/albums/recent` (`recent_albums`, même appel) — la bande d’accueil
  « Récemment ajoutés » (`getRecentAlbums`). Les recommandations par genre écouté,
  elles, sont la bande « Recommandations » (`/home/recommendations`).
- `getTopMixes` — `GET /home/top-mixes` — ✅ **porté** : bande d’accueil « Mix par
  genre » (`mix-genres`) ; un clic joue les pistes du mix.
- `getTopTracks` — `GET /library/history/top-tracks` — ✅ **porté** : bande
  d’accueil « Titres les plus écoutés » (`plus-ecoutes`).

## Radios et podcasts (7)

- `deleteRadio` — `DELETE /radios/{}`
- `exportRadiosUrl` — `GET /radios/export.m3u`
- `getRadioFranceEpisodes` — `GET /podcasts/radiofrance/episodes`
- `getRadioFranceShows` — `GET /podcasts/radiofrance/shows`
- `importRadios` — `POST /radios/import/m3u`
- `searchRadioFranceShows` — `GET /podcasts/radiofrance/shows/search`
- `uploadRadioCover` — `POST /radios/{}/artwork`

## YouTube (7)

- `getYouTubeCharts` — `GET /streaming/youtube/charts`
- `getYouTubeMoodPlaylists` — `GET /streaming/youtube/moods/{}`
- `getYouTubeMoods` — `GET /streaming/youtube/moods`
- `youtubeAuthDeviceCode` — `POST /streaming/youtube/auth/device-code`
- `youtubeAuthLogout` — `POST /streaming/youtube/auth/logout`
- `youtubeAuthPoll` — `POST /streaming/youtube/auth/poll`
- `youtubeAuthStatus` — `GET /streaming/youtube/auth/status`

## Hors ligne (5)

- `clearOffline` — `POST /offline/clear`
- `getOfflineDownloads` — `GET /offline/downloads`
- `getOfflineStatus` — `GET /offline/status`
- `removeOfflineDownload` — `DELETE /offline/downloads/{}`
- `syncOffline` — `POST /offline/sync`

## Bandcamp et concerts (3)

- `bandcampArtist` — `GET /ext/bandcamp/artist`
- `getConcertsAVenir` — `GET /ext/concerts/upcoming`
- `setLocalisationConcerts` — `POST /ext/concerts/location`

## Autres (7)

- `bandcampAllCollection` — `(route ?)`
- `erreurDepuisReponse` — `(route ?)`
- `forceRefetchArtistImages` — `POST /library/artwork/enrich-artists/force`
- `getAlbums` — `(route ?)`
- `getDoubtfulAlbums` — `(route ?)`
- `importLinnPlaylist` — `POST /playlists/import/linn`
- `rescanArtwork` — `POST /library/artwork/rescan`

## Orphelines de nom, route pourtant atteinte (8)

⚠️ Les quatre `PATCH /zones/{id}` ne sont couvertes qu’en apparence : même route,
mais un AUTRE champ du corps (changer la sortie, appliquer un préréglage
d’appareil, le LPCM DLNA ≠ le mode WAV). À compter comme perdues tant qu’un
écran vivant n’envoie pas ces champs.

- apiPatch — PATCH {} — route citée en dur
- applyZoneDevicePreset — PATCH /zones/{} — ≡ updateZoneWavMode
- changeZoneOutput — PATCH /zones/{} — ≡ updateZoneWavMode
- deleteAllZones — DELETE /zones — route citée en dur
- getAlbumDynamicRanges — GET /library/albums/filters — ≡ getSampleRateLabels
- getAllAlbumsSeeded — GET /library/albums — ≡ getAlbumsPage
- getTracks — GET /library/tracks — ≡ getAllTracks
- updateZoneDlnaLpcm — PATCH /zones/{} — ≡ updateZoneWavMode
