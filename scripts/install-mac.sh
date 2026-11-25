#!/usr/bin/env bash
# Builds FAUST on this Mac and installs it to /Applications.
# Usage: npm run install-mac   (run in the project folder)
set -euo pipefail
cd "$(dirname "$0")/.."

[ "$(uname)" = "Darwin" ] || { echo "Tämä skripti toimii vain macOS:ssä." >&2; exit 1; }

case "$(uname -m)" in
  arm64) ARCH=arm64; OUT=dist-installer/mac-arm64 ;;
  *) ARCH=x64; OUT=dist-installer/mac ;;
esac

echo "→ Asennetaan riippuvuudet"
npx -y npm@11 ci
echo "→ Käännetään sovellus"
npm run build
echo "→ Paketoidaan FAUST.app ($ARCH)"
npx electron-builder --mac dir --"$ARCH"

APP="$OUT/FAUST.app"
[ -d "$APP" ] || { echo "Pakettia ei löytynyt: $APP" >&2; exit 1; }

echo "→ Kopioidaan /Applications-kansioon"
osascript -e 'quit app "FAUST"' 2>/dev/null || true
rm -rf /Applications/FAUST.app
ditto "$APP" /Applications/FAUST.app
xattr -dr com.apple.quarantine /Applications/FAUST.app 2>/dev/null || true

# Refresh the icon caches so the Dock shows the new icon
touch /Applications/FAUST.app
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f /Applications/FAUST.app || true
killall Dock 2>/dev/null || true

echo "✓ FAUST asennettu: /Applications/FAUST.app"
open /Applications/FAUST.app
