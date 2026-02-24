#!/usr/bin/env bash
set -euo pipefail

# Tune Web Client installer
# Usage:
#   ./install.sh              Build and install to /usr/share/tune-web-client
#   ./install.sh --nginx      Also install nginx site config
#   ./install.sh --prefix /opt/tune-web-client   Custom install path

INSTALL_DIR="/usr/share/tune-web-client"
INSTALL_NGINX=false

for arg in "$@"; do
    case "$arg" in
        --nginx) INSTALL_NGINX=true ;;
        --prefix)
            shift
            INSTALL_DIR="$1"
            ;;
        --prefix=*)
            INSTALL_DIR="${arg#*=}"
            ;;
        --help|-h)
            echo "Usage: sudo $0 [--nginx] [--prefix <path>]"
            echo ""
            echo "Options:"
            echo "  --nginx          Install nginx site configuration"
            echo "  --prefix <path>  Install to custom directory (default: /usr/share/tune-web-client)"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            exit 1
            ;;
    esac
done

# Check dependencies
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required. Install with:"
    echo "  brew install node    (macOS)"
    echo "  apt install nodejs   (Debian/Ubuntu)"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "Error: npm is required."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Installing dependencies..."
npm ci --ignore-scripts

echo "==> Building..."
npm run build

echo "==> Installing to ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
cp -r dist/* "$INSTALL_DIR/"

echo "==> Installed to ${INSTALL_DIR}"

if [[ "$INSTALL_NGINX" == true ]]; then
    echo "==> Installing nginx config..."
    if [[ -d /etc/nginx/sites-available ]]; then
        # Debian/Ubuntu nginx layout
        sed "s|/usr/share/tune-web-client|${INSTALL_DIR}|g" nginx/tune-web-client.conf \
            > /etc/nginx/sites-available/tune-web-client
        ln -sf /etc/nginx/sites-available/tune-web-client /etc/nginx/sites-enabled/
        echo "==> Reloading nginx..."
        systemctl reload nginx
        echo "==> nginx configured. Access at http://localhost:8080"
    elif [[ -d /usr/local/etc/nginx/servers ]]; then
        # macOS Homebrew nginx layout
        sed "s|/usr/share/tune-web-client|${INSTALL_DIR}|g" nginx/tune-web-client.conf \
            > /usr/local/etc/nginx/servers/tune-web-client.conf
        echo "==> Config installed. Restart nginx with: brew services restart nginx"
    else
        echo "==> Warning: nginx config directory not found. Copy manually:"
        echo "    nginx/tune-web-client.conf"
    fi
fi

echo ""
echo "Done. Static files are in: ${INSTALL_DIR}/"
echo ""
echo "Serve options:"
echo "  1. Configure tune-server to serve static files from ${INSTALL_DIR}/"
echo "  2. Use nginx: $0 --nginx"
echo "  3. Quick test: npx serve ${INSTALL_DIR}/"
