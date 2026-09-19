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

## Angle mort : appels qui ne passent pas par une fonction d’`api.ts`

La mesure ci-dessus ne lit que les fonctions d’`api.ts`. Un écran supprimé qui
appelle une route par `fetch('/api/v1/…')` direct, par un lien `href="/api/v1/…"`,
ou par les enveloppes génériques `api.apiFetch` / `apiPost` / `apiPatch` /
`apiDelete` avec un chemin en dur, lui échappe. Relevé du 19/09/2026 sur les
fichiers que supprime la phase 5 (#1257), comparé au code vivant.

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

**Huit capacités restaient sans chemin** — niveau des journaux, bascule
SQLite ↔ PostgreSQL, documentation de l’API, documentation des greffons,
« Quoi de neuf », nettoyage serveur, vidage du cache, télémétrie. Elles sont
portées par #1304 (télémétrie), #1305 (journaux, nettoyage, cache), #1306
(base de données) et #1307 (documentation, « Quoi de neuf ») : voir les
sections qui suivent.
