# Tune Web Client

Web interface for [Tune Server](https://github.com/renesenses/tune-server). Built with Svelte 5 and TypeScript.

## Features

- **Library Browser** — Browse albums, artists, and tracks with real-time search filtering
- **Playback Control** — Play, pause, skip, seek, volume, shuffle, repeat
- **Queue Management** — View, reorder, and manage the play queue
- **Multi-Room** — Group zones for synchronized playback via the zone config modal
- **Device Discovery** — See DLNA, AirPlay, and local audio devices (USB DACs)
- **Zone Management** — Create, delete, and configure output zones
- **Playlists** — Browse and play playlists
- **Federated Search** — Search across local library and streaming services
- **Real-Time Updates** — WebSocket connection for live state sync
- **Resizable Sidebar** — Drag to adjust sidebar width

## Quick Start

### Development

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. The Vite dev server proxies API requests to the Tune Server backend (configured in `vite.config.ts`).

### Production Build

```bash
npm run build
```

The built SPA is output to `dist/`. It can be served by:

1. **Embedded in Tune Server** (recommended) — Set `TUNE_WEB_DIR=/path/to/dist` on the server
2. **Nginx** — Serve static files with API proxy
3. **Docker Compose** — Full stack with `docker compose up`

## Deployment Options

### Option 1: Embedded in Tune Server (simplest)

Build the client and configure the server to serve it directly:

```bash
# Build
npm run build

# Copy to server
scp -r dist/ user@server:/opt/tune-server/web/

# On the server, add to /opt/tune-server/.env:
# TUNE_WEB_DIR=/opt/tune-server/web

# Restart the service
sudo systemctl restart tune-server
```

The UI is then available at `http://server:8888/`.

### Option 2: Docker Compose

```bash
docker compose up -d
```

- **Tune Server** — `http://localhost:8888` (API + WebSocket)
- **Tune Web Client** — `http://localhost:3000` (nginx + SPA)

### Option 3: Install script

```bash
sudo ./install.sh
```

Builds and installs to `/usr/share/tune-web-client/` with optional nginx configuration.

### Option 4: Debian package

```bash
./build-deb.sh
sudo dpkg -i ../tune-web-client_*.deb
```

## Configuration

### Vite Proxy (development)

Edit `vite.config.ts` to point to your Tune Server:

```typescript
proxy: {
  '/api': 'http://192.168.1.50:8888',
  '/ws': {
    target: 'ws://192.168.1.50:8888',
    ws: true,
  },
},
```

## Project Structure

```
src/
├── App.svelte              # Root component, WebSocket event handling
├── components/
│   ├── Sidebar.svelte      # Navigation, zones, devices
│   ├── NowPlaying.svelte   # Current track display
│   ├── TransportBar.svelte # Playback controls, seek, volume
│   ├── LibraryView.svelte  # Albums/artists/tracks with search
│   ├── QueueView.svelte    # Play queue
│   ├── SearchView.svelte   # Federated search
│   ├── PlaylistsView.svelte
│   ├── SettingsView.svelte
│   ├── ZoneConfigModal.svelte  # Zone grouping and management
│   └── AlbumArt.svelte     # Album artwork component
├── lib/
│   ├── api.ts              # REST API client
│   ├── types.ts            # TypeScript types
│   ├── websocket.ts        # WebSocket client
│   └── stores/             # Svelte stores (zones, queue, navigation...)
└── styles/
    └── tune-theme.css      # Design tokens and global styles
```

## Tech Stack

- **Svelte 5** with runes (`$state`, `$derived`, `$effect`)
- **TypeScript**
- **Vite** for dev server and build
- **CSS Custom Properties** for theming

## License

Private — All rights reserved.
