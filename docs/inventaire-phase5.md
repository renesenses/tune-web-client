# Phase 5 — l'inventaire de ce qui part avec l'ancienne interface

Calculé par accessibilité depuis les deux coquilles, le 19/09/2026.
À recalculer avant d'exécuter : `main` bouge.

- fichiers `.svelte` atteints par `App.svelte` : **121**
- atteints par `ShellV2.svelte` : **113**
- PARTAGÉS par les deux (à NE PAS toucher) : **57**
- atteints SEULEMENT par `App` — ce qui part : **64**

## 🔴 Ce qui part AVEC eux, et qui n'est pas un fichier

- `src/App.svelte` lui-même ;
- `src/lib/interfaceChoisie.ts`, le paramètre d'URL `?v2` et la clé `tune-interface` ;
- le filet : **`?v2=0` cesse d'exister**. Un utilisateur bloqué sur un
  écran n'a plus d'échappatoire. C'est le vrai risque de la phase, et il
  ne se découpe pas : `?v2=0` ne sert qu'à monter `App`.

## Les fichiers atteints seulement par l'ancienne coquille

- `src/App.svelte`
- `src/components/AddShortcutButton.svelte`
- `src/components/AiChat.svelte`
- `src/components/AirplayPairingModal.svelte`
- `src/components/AlarmsView.svelte`
- `src/components/AlbumRating.svelte`
- `src/components/AlphaIndex.svelte`
- `src/components/ArtistEditModal.svelte`
- `src/components/BandcampView.svelte`
- `src/components/BottomTabBar.svelte`
- `src/components/CollapsibleSection.svelte`
- `src/components/CollectionsView.svelte`
- `src/components/ConcertsView.svelte`
- `src/components/ConverterView.svelte`
- `src/components/DashboardHighlights.svelte`
- `src/components/DashboardView.svelte`
- `src/components/DeplocView.svelte`
- `src/components/DevicesSettings.svelte`
- `src/components/DiagnosticsView.svelte`
- `src/components/EqualizerView.svelte`
- `src/components/FavoritesView.svelte`
- `src/components/FolderWizard.svelte`
- `src/components/HistoryView.svelte`
- `src/components/HomeView.svelte`
- `src/components/LibraryView.svelte`
- `src/components/MediaServersView.svelte`
- `src/components/MetadataDuplicatesPanel.svelte`
- `src/components/MetadataMp3Panel.svelte`
- `src/components/MetadataProposalsPanel.svelte`
- `src/components/MetadataStatsDashboard.svelte`
- `src/components/MetadataSuggestionsPanel.svelte`
- `src/components/MetadataView.svelte`
- `src/components/MiniPlayer.svelte`
- `src/components/MultiroomSettings.svelte`
- `src/components/OaatGroupsPanel.svelte`
- `src/components/OfflineView.svelte`
- `src/components/OnboardingView.svelte`
- `src/components/OutputModuleBanner.svelte`
- `src/components/PlaylistsView.svelte`
- `src/components/PluginsView.svelte`
- `src/components/PodcastsView.svelte`
- `src/components/ProfileSelector.svelte`
- `src/components/QueueView.svelte`
- `src/components/RadioFavoritesView.svelte`
- `src/components/RadiosView.svelte`
- `src/components/RecommendationsSection.svelte`
- `src/components/ReportButton.svelte`
- `src/components/SearchView.svelte`
- `src/components/ServiceTokensView.svelte`
- `src/components/SettingHint.svelte`
- `src/components/SettingsLevelNote.svelte`
- `src/components/SettingsView.svelte`
- `src/components/ShortcutsView.svelte`
- `src/components/Sidebar.svelte`
- `src/components/SmartCollectionEditor.svelte`
- `src/components/SmartCollectionsView.svelte`
- `src/components/SmbWizard.svelte`
- `src/components/StreamingSessionPrompt.svelte`
- `src/components/StreamingView.svelte`
- `src/components/SupportView.svelte`
- `src/components/TrackEditModal.svelte`
- `src/components/WhatsNew.svelte`
- `src/components/YTPlayer.svelte`
- `src/components/ZoneManagerView.svelte`
