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

Portées — Zones v2 (`ZonesV2.svelte`), sous les paires stéréo :

- `listGroups` — `GET /zones/groups/list` — ✅ **porté** : section « Lecture groupée » (`GroupesZonesV2.svelte`), niveau Avancé ; grouper et dégrouper y passent par `groupZones` / `ungroupZones` (`/zones/group`), les routes de l'ancien gestionnaire
- `measureLatency` — `POST /zone-manager/measure-latency` — ✅ **porté** : section « RTT de contrôle » (`LatenceZonesV2.svelte`), niveau Expert, toutes les zones d'un coup
- `getOaatGroups` — `GET /zone-manager/oaat-groups` — ✅ **porté** : section « Multiroom synchronisé (OAAT) » (`GroupesOaatV2.svelte`), niveau Expert
- `getOaatGroupStatus` — `GET /zone-manager/oaat-groups/{}` — ✅ **porté** : même section, état et points de chaque groupe
- `createOaatGroup` — `POST /zone-manager/oaat-groups` — ✅ **porté** : même section, « Nouveau groupe » (un refus servi en 200 `{ error }` — #1779 — n'est plus annoncé comme une création)
- `deleteOaatGroup` — `DELETE /zone-manager/oaat-groups/{}` — ✅ **porté** : même section, « Supprimer »
- `addOaatEndpoint` — `POST /zone-manager/oaat-groups/{}/endpoints` — ✅ **porté** : même section, groupe déplié, « Ajouter un point »
- `removeOaatEndpoint` — `DELETE /zone-manager/oaat-groups/{}/endpoints/{}` — ✅ **porté** : même section, « Retirer »
- `setOaatGroupVolume` — `PUT /zone-manager/oaat-groups/{}/volume` — ✅ **porté** : même section, curseur « Volume du groupe »
- `setOaatEndpointVolume` — `PUT /zone-manager/oaat-groups/{}/endpoints/{}/volume` — ✅ **porté** : même section, curseur de chaque point

Témoin : `src/lib/__tests__/porteV2Zones.test.ts`.

Non portées :

- `createGroup` — `POST /zone-manager/groups` — ⛔ **orpheline de nom seulement** : aucun écran de l'ancienne interface ne l'appelle. Le relevé a vu le nom dans `OaatGroupsPanel.svelte`, où `createGroup` est une fonction LOCALE qui appelle `api.createOaatGroup`. Le dernier appel réel (`ZoneManagerView`) a disparu le 19/04/2026 (`456f0ade`). La capacité — grouper des zones — est portée ci-dessus par `groupZones`.
- `deleteGroup` — `DELETE /zone-manager/groups/{}` — ⛔ **orpheline de nom seulement**, même cause (fonction locale d'`OaatGroupsPanel` qui appelle `api.deleteOaatGroup`) ; dégrouper est porté par `ungroupZones`.
- `listGroupDelays` — `GET /zones/group-delays` — ⛔ **capacité morte** : le serveur range la valeur dans le réglage `group_delays` et **rien ne la relit** — `git grep group_delay` sur tune-server-rust ne trouve que les deux gestionnaires `list_group_delays` / `set_group_delay` (`zones/groupes.rs`). Les paires proposées (`snapcast`, `sonos`) ne sont en outre pas des types de sortie (`OutputType`, `TYPES_DE_SORTIE`). Un curseur qui n'agit sur rien.
- `setGroupDelay` — `PUT /zones/group-delays` — ⛔ **capacité morte**, même preuve.
- `listSnapcastClients` — `GET /snapcast/clients` — ⛔ **capacité morte** : l'ancienne barre latérale ne s'en servait que pour créer une zone de type `snapcast`, puis l'y attacher par `assignSnapcastClient`. Or `snapcast` n'est ni une variante d'`OutputType` (tune-core `discovery/device.rs`) ni dans `TYPES_DE_SORTIE` (`zones/ecriture.rs`) : la zone créée ne joue nulle part.
- `assignSnapcastClient` — `POST /snapcast/clients/{}/assign` — ⛔ **capacité morte** : la route n'existe pas (`routes/snapcast.rs` : `/status`, `/clients`, `/clients/{id}/volume`, `/clients/{id}/mute`, `/groups`, `/groups/{id}/stream`) — l'appel rendait 404, avalé par un `console.error`.

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

- `getDashboard` — `GET /library/history/dashboard`
- `getHistoryAtSlot` — `GET /library/history/at`
- `getHistoryDashboard` — `GET /library/history/dashboard`
- `getHomePage` — `GET /home`
- `getRecentlyAdded` — `GET /home/recently-added${qs`
- `getRecentlyAddedSummary` — `GET /home/recently-added/summary{}`
- `getRecommendations` — `GET /library/recommendations`
- `getTopMixes` — `GET /home/top-mixes`
- `getTopTracks` — `GET /library/history/top-tracks`

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
