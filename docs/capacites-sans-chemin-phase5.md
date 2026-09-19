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

- `bandcampAllCollection` — `GET /ext/bandcamp/collection` (toutes les pages)
  → ✅ **porté** : `StreamingV2`, onglet Bandcamp › « Ma collection ». L'écran
  n'affichait que la PREMIÈRE page (100 achats) ; quand elle annonce une suite
  (`more_available` + `last_token`), la collection entière la remplace.
- `erreurDepuisReponse` — pas une capacité : l'aide qui fabrique l'erreur de
  `apiFetch` / `apiPost` / `apiPatch` / `apiDelete` / `getBugReportMarkdown`
  (`src/lib/api.ts`, l. 215, 238, 261, 279, 6279), tous appelés par des écrans
  v2 (`SettingsV2`, `SupportV2`…). La mesure l'a comptée parce qu'elle exclut
  `api.ts` lui-même. ⚠️ Hors inventaire mais à signaler : `DiagnosticsView`
  envoie le rapport de bogue au forum par un `fetch` direct
  (`/system/bug-report/submit`), sans fonction d'`api.ts` — la mesure ne pouvait
  pas le voir.
- `forceRefetchArtistImages` — `POST /library/artwork/enrich-artists/force`
  → ✅ **porté** : `SettingsV2`, Bibliothèque › Enrichissement, ligne « Forcer la
  récupération ».
- `getAlbums` — `GET /library/albums?limit=100`
  → ⛔ **non porté, jamais atteint dans l'ancienne interface** : ses deux seuls
  appelants, `applyArtistAndAlbum` et `applyAlbumName` (`MetadataView.svelte`,
  l. 335 et 409), ne sont appelés par AUCUN élément du balisage — du code mort.
  (Le serveur fait d'ailleurs lui-même le « trouver ou créer » : `POST
  /library/albums` rend l'album existant de même titre, `create_album`.)
- `getDoubtfulAlbums` — `GET /library/doubtful` (via `getDoubtfulTracks`)
  → ✔️ **déjà atteint** : ce n'est qu'un raccourci vers `getDoubtfulTracks(1000,
  0)`, que `MetadataV2` (onglet « Albums douteux ») appelle page après page.
- `importLinnPlaylist` — `POST /playlists/import/linn`
  → ✅ **porté** : `PlaylistsV2`, bouton « Importer » — le sélecteur accepte
  `.dpl`, et un `.dpl` part sur sa route au lieu de l'import M3U.
- `rescanArtwork` — `POST /library/artwork/rescan`
  → ✅ **porté** : `SettingsV2`, Bibliothèque › Enrichissement, ligne « Rechercher
  les covers manquantes ».

## Orphelines de nom, route pourtant atteinte (8)

⚠️ Les quatre `PATCH /zones/{id}` ne sont couvertes qu’en apparence : même route,
mais un AUTRE champ du corps (changer la sortie, appliquer un préréglage
d’appareil, le LPCM DLNA ≠ le mode WAV). À compter comme perdues tant qu’un
écran vivant n’envoie pas ces champs.

Vérifiées une par une le 19/09/2026 (branche `feat/v2-porte-autres`) :

- apiPatch — PATCH {} — route citée en dur
  → ✔️ **atteint** : son seul usage ancien est `PATCH /system/config
  {quality_split}` (`SettingsView`, l. 4145) ; `SettingsV2` envoie le MÊME champ
  par `updateConfig` (réglage « Séparer par qualité »).
- applyZoneDevicePreset — PATCH /zones/{} — ≡ updateZoneWavMode
  → ⏸️ **non porté ici, indissociable de `getZoneDevicePresets`** (domaine
  « Sorties », autre lot) : il applique la proposition que `getZoneDevicePresets`
  lit (`DevicesSettings.svelte`, l. 97 et 144). Sans la lecture, rien à
  appliquer — les deux se portent ensemble, dans le lot « Sorties ».
- changeZoneOutput — PATCH /zones/{} — ≡ updateZoneWavMode
  → ✅ **porté** : aucun écran v2 n'envoyait `output_type`/`output_device_id`.
  `ZonesV2`, vue liste, bouton « Changer la sortie » de chaque zone.
- deleteAllZones — DELETE /zones — route citée en dur
  → ✅ **porté** : la route n'était citée qu'en commentaire. `ZonesV2`, vue liste,
  « Tout supprimer » (niveau Expert, confirmation en deux temps).
- getAlbumDynamicRanges — GET /library/albums/filters — ≡ getSampleRateLabels
  → ✅ **porté** : même route, AUTRE champ (`dynamic_ranges`, pas
  `sample_rate_labels`). `LibraryV2` dessine la tranche de DR (min – max) quand
  la bibliothèque en porte.
- getAllAlbumsSeeded — GET /library/albums — ≡ getAlbumsPage
  → ✅ **porté** : même route, AUTRES paramètres (`dr_min`/`dr_max`,
  `sort=random` + `seed`). `LibraryV2` s'en sert pour la tranche de DR (la liste
  d'albums ne porte pas le DR : le filtre ne peut être que serveur) et pour le
  nouveau tri « Aléatoire », avec « Re-tirer au hasard ».
- getTracks — GET /library/tracks — ≡ getAllTracks
  → ✔️ **atteint, et sans capacité propre** : son seul appelant
  (`loadTracksWithoutArtist`, `MetadataView`) remplit `tracksWithoutArtist`,
  qu'aucun balisage n'affiche. La route est lue en v2 par `getAllTracks`
  (`LibraryV2`, onglet Pistes).
- updateZoneDlnaLpcm — PATCH /zones/{} — ≡ updateZoneWavMode
  → ✔️ **atteint** : `dlna_lpcm` EST le mode « WAV 16 bits » de `RendererConfig`
  (monté par `SettingsV2`, Appareils › Par zone) — `updateZoneWavMode('16')`
  envoie `dlna_lpcm: true` avec `dlna_wav24: false`. L'ancienne case ne posait
  que le premier, et pouvait laisser la paire contradictoire que ce corps évite.
