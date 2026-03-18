# Roadmap — Connecteur YouTube (Hybride : IFrame + yt-dlp + Data API v3)

## Objectif

Intégration YouTube en mode hybride :
- **OAuth Google officiel** pour l'authentification
- **YouTube Data API v3** pour search, metadata, playlists, chaînes
- **YouTube IFrame Player API** — player officiel monté en silencieux (muted), assure la conformité légale et fournit le contexte visuel (Phase 6 : bouton œil)
- **yt-dlp** — extrait l'URL audio CDN (pas de téléchargement) → routée via le backend → DLNA/AirPlay
- Les deux joueurs sont synchronisés via les événements WebSocket

---

## Architecture hybride

```
Clic "Play" sur une piste YouTube
  │
  ├── Frontend: ytPlayer.play(videoId)
  │     └── YTPlayer.svelte → IFrame muted (visuel + conformité légale)
  │
  └── Frontend: api.play(zone, {source:'youtube', source_id})
        └── Backend: youtube.get_stream_url(videoId)
              └── yt-dlp → URL audio CDN YouTube
                    └── zone player → DLNA/AirPlay

Événements WebSocket playback.*
  └── App.svelte → sync IFrame (pause/resume/stop) avec l'état DLNA
```

**Commandes utilisateur** (TransportBar) → backend → DLNA → WS events → IFrame suit

---

## Phase 1 — Backend : nettoyage & config ✅

### Tâche 1.1 — Mettre à jour `config.py` et `.env.example` ✅
- Supprimer `TUNE_YOUTUBE_OAUTH_JSON`, `TUNE_YOUTUBE_URL_CACHE_TTL`
- Conserver `TUNE_YOUTUBE_CLIENT_ID`, `TUNE_YOUTUBE_CLIENT_SECRET`
- Ajouter `TUNE_YOUTUBE_API_KEY` (optionnel, pour requêtes sans auth utilisateur)

### Tâche 1.2 — Mettre à jour `pyproject.toml` ✅
- Supprimer `ytmusicapi`
- Garder `yt-dlp` (extraction URL audio CDN pour DLNA)
- Garder `aiohttp` (appels Data API v3)

---

## Phase 2 — Backend : réécriture `youtube.py` ✅

### Tâche 2.1 — OAuth 2.0 Device Code Flow (Google) ✅
### Tâche 2.2 — Search via Data API v3 ✅
### Tâche 2.3 — Détail vidéo / track ✅
### Tâche 2.4 — Playlists utilisateur ✅
### Tâche 2.5 — Chaînes (artistes) ✅

### Tâche 2.6 — `get_stream_url()` hybride ✅
- Extrait l'URL audio via yt-dlp (thread dédié, timeout 30s)
- Cache 5h (URLs CDN YouTube expirent ~6h)
- Flag `iframe_only: false` — le backend gère bien le stream
- **Test** : `curl http://localhost:8888/api/v1/streaming/services` → `{"youtube": {"iframe_only": false}}`

---

## Phase 3 — Frontend : connecteur Settings ✅

### Tâche 3.1 — UI de connexion dans `SettingsView.svelte` ✅
### Tâche 3.2 — Locales i18n fr/en ✅

---

## Phase 4 — Frontend : composant YTPlayer (muted) ✅

### Tâche 4.1 — Créer `YTPlayer.svelte` ✅
- Charge l'IFrame API, instancie `YT.Player` hors-écran
- **Muted dès `onReady`** — l'audio sort du backend/DLNA, pas du navigateur
- Expose : `play(videoId)`, `pause()`, `resume()`, `seekTo(seconds)`, `setVolume(n)`
- Écoute `onStateChange` → met à jour `ytPlayerState`

### Tâche 4.2 — Intégrer `YTPlayer` dans `App.svelte` ✅
- Instance unique persistante hors du `{#key $activeView}`
- Sync IFrame depuis les événements WS :
  - `playback.paused` / `playback.stopped` → `pauseVideo()`
  - `playback.resumed` → `resumeVideo()`
  - `playback.started` avec piste non-YouTube → `stopVideo()`

### Tâche 4.3 — Store `ytPlayer.ts` ✅
- State : `{ active, videoId, playing, currentTime, duration, track }`
- Actions : `playVideo()`, `pauseVideo()`, `resumeVideo()`, `seekTo()`, `setYTVolume()`, `stopVideo()`

---

## Phase 5 — Frontend : intégration dans le système de lecture ✅

### Tâche 5.1 — Lecture hybride dans `StreamingView.svelte` ✅
- Clic "Play" sur piste YouTube → `playVideo()` (IFrame muted) + `api.play()` (DLNA)
- Clic "Play" sur playlist YouTube → `api.play()` suffit (yt-dlp résout les URLs)

### Tâche 5.2 — `TransportBar.svelte` ✅
- Contrôles → backend (DLNA) comme pour toute autre source
- Pendant le chargement yt-dlp (zone stopped mais IFrame active) → fallback sur IFrame
- Badge `YT` rouge affiché quand l'IFrame est active
- `displayTrack` : zone track en priorité, IFrame track en fallback

### Tâche 5.3 — Gestion de fin de piste
- Écouter `playback.track_changed` / `playback.stopped` via WS ✅ (partiel)
- **TODO** : auto-play piste suivante de la playlist YouTube

---

## Phase 6 — Frontend : overlay miniature + bouton œil

### Tâche 6.1 — Overlay miniature dans `NowPlaying.svelte`
- Quand source = YouTube : afficher la thumbnail de la vidéo en cover art
- Le player IFrame est positionné derrière (visible si bouton œil activé)

### Tâche 6.2 — Bouton œil (toggle player/miniature)
- Icône œil en overlay sur la cover (coin bas-droit, discret)
- Click → bascule entre `showThumbnail` et `showPlayer`
- Si `showPlayer` : IFrame déplacé dans la vue (position visible), son **unmuted**
- Si `showThumbnail` : IFrame hors-écran, son **muted** (retour au mode hybride)
- Le bouton n'apparaît que si source = YouTube

### Tâche 6.3 — Uniformité visuelle
- Vérifier design system (couleurs, radius, ombres)
- Vérifier dark/light mode et mobile

---

## Phase 7 — Build & intégration

### Tâche 7.1 — Build du frontend
- `npm run build` dans `tune-web-client`
- Copier `dist/` vers `tune-server-linux/web/`

### Tâche 7.2 — Tests end-to-end
- Connexion OAuth YouTube complète
- Search → play piste → pause → resume → seek → fin → piste suivante
- Play playlist → toutes les pistes via DLNA
- Bouton œil → vidéo visible + son IFrame ; recliquer → muted + miniature
- Déconnexion → reconnexion → token restauré

### Tâche 7.3 — Commit & PR
- Commit backend sur `feat/youtube-connector`
- Commit frontend sur `feat/youtube-connector`
- PR avec description des changements

---

## Résumé des fichiers touchés

### `tune-server-linux`
| Fichier | Action | Statut |
|---|---|---|
| `tune_server/streaming/youtube.py` | Réécriture complète + get_stream_url hybride | ✅ |
| `tune_server/config.py` | Mise à jour variables YouTube | ✅ |
| `tune_server/models.py` | Ajout `iframe_only`, `error` dans responses | ✅ |
| `tune_server/api/routes/streaming.py` | Propagation `iframe_only` | ✅ |
| `tune_server/api/routes/playback.py` | Fix: ne pas résumer si target sans tracks | ✅ |
| `pyproject.toml` | Suppression `ytmusicapi`, maintien `yt-dlp` | ✅ |
| `.env.example` | Mise à jour variables YouTube | ✅ |

### `tune-web-client`
| Fichier | Action | Statut |
|---|---|---|
| `src/components/YTPlayer.svelte` | Nouveau — IFrame muted | ✅ |
| `src/lib/stores/ytPlayer.ts` | Nouveau store | ✅ |
| `src/App.svelte` | Intégration YTPlayer + sync WS | ✅ |
| `src/components/TransportBar.svelte` | Badge YT + fallback IFrame | ✅ |
| `src/components/StreamingView.svelte` | Lecture hybride (IFrame + DLNA) | ✅ |
| `src/components/SettingsView.svelte` | Amélioration bloc YouTube | ✅ |
| `src/lib/locales/*.ts` | Clés YouTube | ✅ |
| `src/components/NowPlaying.svelte` | Overlay + bouton œil | ⏳ Phase 6 |
