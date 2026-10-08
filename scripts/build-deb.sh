#!/usr/bin/env bash
# Build a Debian (.deb) package for Moderado IDE from the already-built
# VSCodium/pinned Linux editor tree.
#
# Usage:
#   ./scripts/build-deb.sh [editor-tree] [output-dir]
#
#   editor-tree   Path to the directory produced by scripts/build-linux.mjs
#                 (defaults to .cache/vscodium/VSCode-linux-x64).
#   output-dir    Where the .deb is written (defaults to cwd).
#
# Requires: dpkg (dpkg-deb), GNU coreutils, GNU sed. No sudo needed to build
# the package itself.
set -eu

REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)
EDITOR_TREE=${1:-"$REPO_DIR/.cache/vscodium/VSCode-linux-x64"}
OUT_DIR=${2:-"$REPO_DIR"}

if [ ! -d "$EDITOR_TREE" ]; then
  echo "error: editor tree not found: $EDITOR_TREE" >&2
  echo "run: node scripts/build-linux.mjs" >&2
  exit 1
fi

if [ ! -x "$EDITOR_TREE/moderado-ide" ]; then
  echo "error: no executable editor binary at $EDITOR_TREE/moderado-ide" >&2
  exit 1
fi

VERSION_RAW=$(cat "$REPO_DIR/VERSION" 2>/dev/null || true)
VERSION=${VERSION_RAW#v}
# Debian forbids '+' in the Version field -> Debian revision via '~'.
DEB_VERSION=$(printf '%s' "$VERSION" | sed 's/+/~/')

ARCH=$(dpkg --print-architecture 2>/dev/null || echo amd64)
PKG_NAME="moderado-ide_${DEB_VERSION}_${ARCH}.deb"
PKG_PATH=$(cd "$OUT_DIR" && printf '%s' "$PWD/$PKG_NAME")

STAGING=$(mktemp -d "$REPO_DIR/build-deb.XXXXXX") || exit 1
trap 'rm -rf "$STAGING"' EXIT

mkdir -p "$STAGING/DEBIAN" \
         "$STAGING/usr/share/applications" \
         "$STAGING/usr/share/icons/hicolor/scalable/apps" \
         "$STAGING/usr/share/doc/moderado-ide"

# 1. control -------------------------------------------------------------
cp "$REPO_DIR/packaging/deb/DEBIAN/control" "$STAGING/DEBIAN/control"

# 2. metadata ------------------------------------------------------------
cp "$REPO_DIR/packaging/common/moderado-ide.desktop" "$STAGING/usr/share/applications/moderado-ide.desktop"
cp "$REPO_DIR/packaging/common/moderado-ide.svg" "$STAGING/usr/share/icons/hicolor/scalable/apps/moderado-ide.svg"
cp "$REPO_DIR/packaging/common/copyright" "$STAGING/usr/share/doc/moderado-ide/copyright"

# 3. editor tree ---------------------------------------------------------
mkdir -p "$STAGING/opt/moderado-ide"
cp -a "$EDITOR_TREE/." "$STAGING/opt/moderado-ide/"

# 4. build ----------------------------------------------------------------
dpkg-deb --build --root-owner-group "$STAGING" "$PKG_PATH"

# 5. verify ---------------------------------------------------------------
ls -l "$PKG_PATH"
echo "DEB PACKAGED: $PKG_PATH"
