# CLAUDE.md — Tune Web Client

## Project

Svelte 5 SPA (Single Page Application) for the Tune music server. Connects to the server via REST API on port 8888. Responsive design with 3 breakpoints: desktop (sidebar), tablet (icon sidebar), mobile (bottom tab bar).

## Build

```bash
npm install
npm run dev    # dev server with HMR
npm run build  # production build → dist/
```

Built assets are copied to `tune-server-linux/web/` for serving by the server.

## Architecture

```
src/
├── App.svelte              # Root component, router
├── main.ts                 # Entry point
├── components/
│   ├── HomeView.svelte     # Dashboard with stats
│   ├── LibraryView.svelte  # Albums/Artists/Tracks/Genres tabs + filters
│   ├── SearchView.svelte   # Federated search (local + streaming)
│   ├── StreamingView.svelte # Tidal, Qobuz, YouTube, Spotify, Deezer, Amazon
│   ├── RadiosView.svelte   # Radio stations
│   ├── QueueView.svelte    # Playback queue
│   ├── NowPlaying.svelte   # Full-screen now playing
│   ├── SettingsView.svelte # Server config, streaming auth, DB info
│   ├── MetadataView.svelte # Track/album metadata editing
│   └── ...
├── lib/
│   ├── api.ts              # REST API client (all endpoints)
│   ├── types.ts            # TypeScript interfaces (Track, Album, Artist, Zone, etc.)
│   ├── websocket.ts        # WebSocket for real-time events
│   ├── stores/
│   │   ├── library.ts      # Albums, artists, tracks stores (writable)
│   │   ├── zones.ts        # Zone state store
│   │   ├── connection.ts   # Server connection state
│   │   └── queue.ts        # Queue state
│   └── locales/            # Translations: en, fr, de, es, it, zh, ko, ja
└── styles/                 # Global CSS
```

## Key Patterns

- **Svelte 5** runes: `$state`, `$derived`, `$effect` (NOT Svelte 4 stores in components)
- **Stores**: `writable<T>()` for global state (library.ts, zones.ts)
- **API**: All calls in `lib/api.ts`, base URL auto-detected from window.location
- **i18n**: Custom `$t()` / `$tr()` helpers, locale files in `lib/locales/`
- **Theming**: CSS variables (--tune-bg, --tune-text, --tune-accent), dark/light mode
- **Responsive**: CSS media queries, mobile bottom bar, tablet icon sidebar

## API Base

```typescript
const BASE = `${window.location.protocol}//${window.location.host}/api/v1`;
```

## Album Filters

LibraryView has filter chips for albums:
- **Quality**: DSD, Hi-Res, CD, Lossy (derived from sample_rate/bit_depth/format)
- **Format**: FLAC, WAV, MP3, etc. (blue chips)
- **Sample Rate**: 44.1kHz+, 96kHz+, 192kHz+ (purple chips)

All filters combine (AND logic).

## Deployment

```bash
npm run build
cp -r dist/* /path/to/tune-server-linux/web/
# Then SCP to server or restart
```

## CRITICAL RULES

- **NEVER mention or reference recorder, recording, or special-edition features.** This is a public repo.
