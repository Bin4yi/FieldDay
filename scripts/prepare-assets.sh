#!/usr/bin/env bash
# Make small web copies of the art in /assets for the PWA.
# The originals are 1-2.5 MB PNGs; the app ships WebP copies sized for phones.
# Needs ImageMagick with WebP support. Run: pnpm assets
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=apps/web/public/img
mkdir -p "$OUT"/{mascot,icons,badges,bosses,screens} apps/web/public/pwa

webp() { # src dest maxsize quality
  convert "$1" -resize "$3x$3>" -strip -quality "$4" -define webp:alpha-quality=90 "$2"
}

for f in assets/mascot/*.png; do webp "$f" "$OUT/mascot/$(basename "${f%.png}").webp" 512 82; done
for f in assets/bosses/*.png; do webp "$f" "$OUT/bosses/$(basename "${f%.png}").webp" 512 82; done
for f in assets/icons/*@256.png; do n=$(basename "${f%@256.png}"); webp "$f" "$OUT/icons/$n.webp" 256 85; done
for f in assets/badges/*@256.png; do n=$(basename "${f%@256.png}"); webp "$f" "$OUT/badges/$n.webp" 256 85; done
webp assets/screens/hero_banner.png "$OUT/screens/hero_banner.webp" 1280 78
webp assets/screens/splash_portrait.png "$OUT/screens/splash_portrait.webp" 900 78
webp assets/backgrounds/bg_park_day.png "$OUT/screens/bg_park_day.webp" 1280 72
webp assets/backgrounds/bg_battle_arena.png "$OUT/screens/bg_battle_arena.webp" 1280 72

cp assets/pwa/icon-192.png assets/pwa/icon-512.png assets/pwa/icon-maskable-512.png assets/pwa/icon-180.png apps/web/public/pwa/
cp assets/pwa/favicon.ico apps/web/public/favicon.ico
du -sh "$OUT" apps/web/public/pwa
