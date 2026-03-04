# Installation de Tune Web Client

## Pour les utilisateurs finaux

Le web client est **déjà inclus** dans les distributions Tune. Aucune installation séparée n'est nécessaire :

- **macOS** : inclus dans le tarball `tune-server-*-macos-*.tar.gz` (dossier `web/`)
- **Linux (.deb)** : installé automatiquement dans `/opt/tune-server/web/`
- **Docker** : servi par le conteneur nginx

Tune Server sert l'interface sur le même port que l'API (`http://server:8888/`).

> **Ce document concerne uniquement le déploiement manuel pour les développeurs.**

---

## Déploiement manuel (développeurs)

### Prérequis

- **Node.js** >= 18
- **npm** >= 9
- Un **Tune Server** fonctionnel (API sur le port 8888)

### Build

```bash
npm ci
npm run build
```

Les fichiers statiques sont générés dans `dist/`.

### Déployer vers un serveur

```bash
# Build local
npm run build

# Copier vers le serveur
scp -r dist/* user@server:/opt/tune-server/web/

# Sur le serveur, dans /opt/tune-server/.env :
TUNE_WEB_DIR=/opt/tune-server/web
```

Pas de redémarrage nécessaire — les fichiers statiques sont servis directement par Tune Server.

### Autres méthodes

#### Script d'installation

```bash
sudo ./install.sh [--prefix /chemin] [--nginx]
```

#### Docker Compose

```bash
docker compose up -d
```

| Service | URL |
|---------|-----|
| Tune Server (API + WebSocket) | `http://localhost:8888` |
| Tune Web Client (nginx + SPA) | `http://localhost:3000` |

#### Paquet Debian

```bash
./build-deb.sh
sudo dpkg -i ../tune-web-client_*.deb
```

---

## Intégration dans les builds de distribution

Les scripts de build des distributions incluent automatiquement le web client :

| Distribution | Script | Ce qu'il fait |
|---|---|---|
| macOS (`tune-macos`) | `build.sh` | Clone, `npm ci && vite build`, copie `dist/` dans le tarball |
| Linux (`tune-win`) | `debian/rules` | Copie `web/` dans `/opt/tune-server/web/` du .deb |

Variables d'environnement du build macOS :
- `TUNE_WEB_REF` — branche/tag du web client (défaut : `main`)
- `SKIP_WEB=1` — ne pas inclure le web client

---

## Vérification PWA

Après déploiement, vérifier que l'app est installable :

1. Ouvrir `http://server:8888/` dans Chrome (Android ou desktop)
2. DevTools → Application → Manifest → vérifier le chargement
3. Application → Service Workers → vérifier que `sw.js` est activé
4. Sur Android : la bannière "Installer l'app" doit apparaître

### Checklist

- [ ] `manifest.json` accessible à `/manifest.json`
- [ ] `sw.js` accessible à `/sw.js`
- [ ] Icônes accessibles à `/icons/icon-192.png`, `/icons/icon-512.png`
- [ ] HTTPS activé (ou localhost) — requis pour le service worker
- [ ] `theme-color` dans le `<head>` du HTML

> **Note** : En développement local (`localhost`), le service worker fonctionne sans HTTPS. En production, HTTPS est requis pour l'installabilité PWA.
