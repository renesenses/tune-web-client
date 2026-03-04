# Tune Web Client

Interface web pour [Tune Server](https://github.com/renesenses/tune-server) — contrôleur audio multi-room. Construit avec Svelte 5 et TypeScript.

Installable en tant que PWA sur Android et iOS (mode standalone, sans barre d'URL).

## Fonctionnalités

### Lecture et file d'attente
- **Contrôle de lecture** — Play, pause, suivant, précédent, seek, volume, shuffle, repeat
- **File d'attente** — Affichage, réorganisation par drag & drop, suppression de pistes
- **Historique** — Historique de lecture conservé localement

### Bibliothèque
- **Parcourir** — Albums, artistes, pistes, genres
- **Recherche en temps réel** — Filtrage instantané dans la bibliothèque
- **Édition de métadonnées** — Modification des titres, artistes, pochettes, tags
- **Explorateur de fichiers** — Navigation dans l'arborescence des dossiers musicaux

### Multi-room
- **Zones** — Créer, supprimer et configurer des zones de lecture
- **Groupement** — Synchronisation multi-room via le panneau de configuration zone
- **Découverte** — Détection automatique des appareils DLNA, AirPlay et DAC USB
- **Délai de synchro** — Réglage fin par appareil

### Streaming et radios
- **Recherche fédérée** — Recherche simultanée dans la bibliothèque locale et les services de streaming (Tidal, Qobuz)
- **Playlists streaming** — Parcourir et lire les playlists des services connectés
- **Radios** — Stations radio avec import M3U/PLS et gestion des pochettes

### Playlists
- **CRUD complet** — Créer, renommer, supprimer des playlists
- **Ajout rapide** — Modal d'ajout de pistes depuis n'importe quelle vue

### Interface
- **Thème clair/sombre** — Basculement instantané
- **8 langues** — FR, EN, DE, ES, IT, ZH, JA, KO
- **Sidebar redimensionnable** — Glisser pour ajuster
- **Raccourcis clavier** — Navigation et contrôle au clavier
- **PWA** — Installable sur mobile, mode standalone
- **Responsive** — Adapté mobile, tablette et desktop

## Stack technique

| Composant | Version |
|-----------|---------|
| Svelte | 5 (runes : `$state`, `$derived`, `$effect`) |
| TypeScript | 5.7 (strict) |
| Vite | 6 |
| CSS | Custom Properties (design tokens) |
| State | Svelte stores (aucune lib externe) |
| Comm. | REST + WebSocket temps réel |
| i18n | Système custom via stores Svelte |
| PWA | Manifest + Service Worker stub (pas de cache offline) |

**Zéro dépendance runtime** — uniquement des devDependencies.

## Distribution

Le web client est **automatiquement inclus** dans les distributions Tune :

| Plateforme | Package | Le web client est… |
|---|---|---|
| **macOS** | `tune-server-*-macos-*.tar.gz` | bundlé dans `web/` à côté du binaire |
| **Linux** | `tune-server_*.deb` | installé dans `/opt/tune-server/web/` |
| **Docker** | `docker compose up` | servi par nginx sur le port 3000 |

Tune Server sert le web client directement sur le port 8888 (même port que l'API). Pas de serveur web séparé nécessaire.

> Les utilisateurs finaux n'ont pas besoin de builder le web client — il est déjà inclus.

## Développement

### Prérequis

- Node.js >= 18
- Un Tune Server accessible (API port 8888)

### Lancer le dev server

```bash
npm install
npm run dev
```

Ouvre `http://localhost:5173`. Vite proxifie les appels API et WebSocket vers le backend.

Pour pointer vers un serveur distant, modifier `vite.config.ts` :

```typescript
proxy: {
  '/api': 'http://192.168.1.50:8888',
  '/ws': {
    target: 'ws://192.168.1.50:8888',
    ws: true,
  },
},
```

### Build

```bash
npm run build
```

Le SPA est généré dans `dist/`. Voir [INSTALL.md](INSTALL.md) pour le déploiement manuel (hors distribution).

## Structure du projet

```
src/
├── App.svelte                 # Composant racine, gestion WebSocket
├── main.ts                    # Bootstrap, enregistrement service worker
├── components/
│   ├── Sidebar.svelte         # Navigation, zones, appareils
│   ├── NowPlaying.svelte      # Affichage piste en cours
│   ├── TransportBar.svelte    # Contrôles lecture, seek, volume
│   ├── LibraryView.svelte     # Albums/artistes/pistes + recherche
│   ├── QueueView.svelte       # File d'attente
│   ├── SearchView.svelte      # Recherche fédérée
│   ├── StreamingView.svelte   # Services de streaming
│   ├── PlaylistsView.svelte   # Gestion playlists
│   ├── RadiosView.svelte      # Stations radio
│   ├── HomeView.svelte        # Accueil (récemment joués, ajouts récents)
│   ├── GenresView.svelte      # Navigation par genre
│   ├── BrowseView.svelte      # Explorateur de fichiers
│   ├── HistoryView.svelte     # Historique de lecture
│   ├── MetadataView.svelte    # Édition métadonnées
│   ├── SettingsView.svelte    # Préférences
│   ├── ZoneConfigModal.svelte # Configuration zone / multi-room
│   ├── AlbumEditModal.svelte  # Édition album
│   ├── AddToPlaylistModal.svelte
│   ├── AlbumArt.svelte        # Composant pochette
│   ├── SeekBar.svelte         # Barre de progression
│   └── VolumeControl.svelte   # Contrôle volume
├── lib/
│   ├── api.ts                 # Client REST
│   ├── types.ts               # Types TypeScript
│   ├── websocket.ts           # Client WebSocket
│   ├── i18n.ts                # Internationalisation
│   ├── keyboard.ts            # Raccourcis clavier
│   ├── utils.ts               # Utilitaires
│   ├── locales/               # Traductions (8 langues)
│   └── stores/                # État applicatif
│       ├── zones.ts           # Zones et zone active
│       ├── queue.ts           # File d'attente
│       ├── nowPlaying.ts      # Position seek, shuffle, repeat, volume
│       ├── library.ts         # Albums, artistes, pistes, genres
│       ├── playlists.ts       # Liste des playlists
│       ├── navigation.ts      # Vue active
│       ├── devices.ts         # Appareils découverts
│       ├── streaming.ts       # État services streaming
│       ├── preferences.ts     # Thème, langue, vue de démarrage
│       ├── connection.ts      # État connexion WebSocket
│       └── history.ts         # Historique (localStorage)
└── styles/
    └── tune-theme.css         # Design tokens et styles globaux
public/
├── manifest.json              # Manifest PWA
├── sw.js                      # Service worker (stub, pas de cache)
├── favicon.svg                # Favicon SVG
└── icons/                     # Icônes PWA (192, 512, maskable)
```

## PWA

L'application est installable sur Android (Chrome) et iOS (Safari) :

1. Ouvrir l'app dans le navigateur
2. Android : bannière "Installer l'app" ou menu ⋮ → "Ajouter à l'écran d'accueil"
3. iOS : bouton partage → "Sur l'écran d'accueil"

L'app s'ouvre en mode standalone (plein écran, sans barre d'URL). Le service worker est un stub minimal — pas de cache offline, l'app nécessite le serveur en permanence.

## Licence

Private — All rights reserved.
