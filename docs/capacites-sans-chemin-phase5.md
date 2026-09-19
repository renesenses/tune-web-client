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

## Angle mort : appels qui ne passent pas par une fonction d’`api.ts`

La méthode ci-dessus ne lit que les fonctions exportées par `api.ts`. Un écran
supprimé qui appelle une route par `fetch('/api/v1/…')` direct, par un lien
`href="/api/v1/…"`, ou par les enveloppes génériques `api.apiFetch` /
`apiPost` / `apiPatch` / `apiDelete` avec un chemin en dur, lui échappe. Relevé
du 19/09/2026 sur les 118 fichiers que supprime la phase 5
(`git diff --diff-filter=D origin/main...origin/chore/phase5-retirer-ancienne-interface`),
comparé au code vivant et aux seize PR de portage ouvertes (#1274 à #1294).

### `fetch` direct et liens

| Écran supprimé | Route | Chemin v2 |
|---|---|---|
| `DiagnosticsView` | `POST /system/bug-report/submit` (rapport de bogue au forum, sans licence) | ✅ **porté** (`feat/v2-porte-rapport-bogue`) : `SupportV2`, volet Diagnostic › « Signaler un bogue », par `api.submitBugReport` |
| `DiagnosticsView` | `GET /system/bug-report/markdown` (aperçu du rapport) | ✔️ déjà atteint par `api.getBugReportMarkdown` (`SupportV2`, pièce jointe d’un ticket) ; aperçu désormais aussi dans « Signaler un bogue » |
| `SettingsView` | `GET` / `PATCH /system/config` (`dsd_lpcm_stream`, `replaygain_*`, `local_audio_backend`, `local_exclusive_mode`) | ✔️ déjà atteint : `SettingsV2` lit et écrit ces mêmes champs |
| `SettingsView` | `GET` / `POST /system/log-level` (niveau des journaux serveur) | ⛔ **aucun chemin v2** |
| `SettingsView` | `POST /system/database/test-connection`, `POST /system/database/migrate?target=postgres\|sqlite` (bascule SQLite ↔ PostgreSQL) | ⛔ **aucun chemin v2** |
| `SettingsView` | lien `GET /system/api-docs` (documentation de l’API) | ⛔ **aucun chemin v2** |
| `PluginsView` | `GET /plugins/docs` (documentation des greffons) | ⛔ **aucun chemin v2** (#1282 ne le porte pas) |
| `WhatsNew` | `GET /system/changelog?limit=10&lang=…` (« Quoi de neuf », dix dernières versions) | ⛔ **aucun chemin v2** — `SettingsV2` ne montre que les notes de la mise à jour disponible (`/system/update/check`) |
| `RadiosView`, `RadioFavoritesView` | lien `GET /radio-favorites/export` | ✔️ déjà atteint : `FavoritesV2` |
| `ProfileSelector`, `SettingsView` | `window.location = /cloud/sso/authorize` | ✔️ déjà atteint : `AvatarMenu`, `LoginView` |

### Enveloppes génériques avec chemin en dur

| Écran supprimé | Route | Chemin v2 |
|---|---|---|
| `DiagnosticsView` | `POST /system/restart` | ✔️ `api.restartServer` (`SettingsV2`) |
| `DiagnosticsView` | `POST /system/scan` | ✔️ `api.triggerScan` (`SettingsV2`) |
| `DiagnosticsView` | `POST /system/cleanup` (nettoyage serveur) | ⛔ **aucun chemin v2** |
| `DiagnosticsView` | `POST /system/clear-cache` (vider le cache) | ⛔ **aucun chemin v2** |
| `SettingsView` | `GET /cloud/telemetry/status`, `POST /cloud/telemetry/enable\|disable` (`etatTelemetrie.ts`) | ⛔ **aucun chemin v2** — le consentement à la télémétrie ne serait plus modifiable |
| `SettingsView` | `GET /cloud/bridge/status`, `POST /cloud/bridge/enable\|disable` | ✔️ `SettingsV2` |
| `SettingsView` | `GET` / `POST /hqplayer/config`, `GET /hqplayer/status` | ✔️ `SettingsV2` |
| `SettingsView` | `GET /system/update/check`, `PATCH /system/config` (`quality_split`) | ✔️ `SettingsV2` |
| `SettingsView`, `ProfileSelector` | `GET /cloud/sso/status` | ✔️ `AvatarMenu`, `PageWidgets`, `stores/preferences` |
| `SettingsView` | `GET /system/settings/metadata-fields` | ✔️ `lib/api/metadata.ts` (`AlbumEditModal`, `stores/displayFields`) |
| `RadiosView`, `RadioFavoritesView` | `GET /radio-favorites`, `DELETE /radio-favorites[/{id}]` | ✔️ `FavoritesV2` |
| `MetadataView` | `POST /library/albums` | sans objet : code mort dans l’ancienne interface (voir `getAlbums`, #1294) |
| `SupportView` | `POST /support/tickets` | ✔️ `api.createSupportTicketMultipart` (`SupportV2`) |

**Reste sans chemin : huit capacités** — niveau des journaux, bascule
SQLite ↔ PostgreSQL, documentation de l’API, documentation des greffons,
« Quoi de neuf », nettoyage serveur, vidage du cache, télémétrie. À arbitrer
comme les autres domaines : porter, abandonner ou garder le filet.
