#!/bin/sh
# Build a RedHat/CentOS/Fedora (.rpm) package for Moderado IDE from the
# already-built VSCodium/pinned Linux editor tree.
#
# Usage:
#   ./scripts/build-rpm.sh [editor-tree] [output-dir]
#
#   editor-tree   Path to the directory produced by scripts/build-linux.mjs
#                 (defaults to build/vscodium/VSCode-linux-x64).
#   output-dir    Where the .rpm is written (defaults to build/installers; created automatically).
#
# Requires: rpm-build (rpmbuild), GNU coreutils. If rpmbuild is missing the
# script exits with a message telling you how to install it.
#
#   $ sudo dnf install -y rpm-build      # Fedora/RHEL 8+
#   $ sudo yum install -y rpm-build      # RHEL 7
set -eu

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
EDITOR_TREE=${1:-"$REPO_DIR/build/vscodium/VSCode-linux-x64"}
OUT_DIR=${2:-"$REPO_DIR/build/installers"}

if [ ! -d "$EDITOR_TREE" ]; then
  echo "error: editor tree not found: $EDITOR_TREE" >&2
  echo "run: node scripts/build-linux.mjs" >&2
  exit 1
fi

if [ ! -x "$EDITOR_TREE/moderado-ide" ]; then
  echo "error: no executable editor binary at $EDITOR_TREE/moderado-ide" >&2
  exit 1
fi

if ! command -v rpmbuild >/dev/null 2>&1; then
  echo "error: rpmbuild is not installed." >&2
  echo "  Install it, e.g.:" >&2
  echo "    $ sudo dnf install -y rpm-build      # Fedora / RHEL 8+" >&2
  echo "    $ sudo yum install -y rpm-build      # RHEL 7" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

VERSION_RAW=$(cat "$REPO_DIR/VERSION" 2>/dev/null || true)
VERSION=${VERSION_RAW#v}                     # 0.1.22+261007a
RPM_RELEASE=${VERSION#*+}
RPM_VERSION=${VERSION%%+*}                   # 0.1.22+261007a -> 0.1.22

TOPDIR=$(mktemp -d "$REPO_DIR/build-rpm.XXXXXX") || exit 1
trap 'rm -rf "$TOPDIR"' EXIT

mkdir -p "$TOPDIR/SPECS" "$TOPDIR/SOURCES" "$TOPDIR/BUILD" \
         "$TOPDIR/BUILDROOT" "$TOPDIR/SRPMS" "$TOPDIR/RPMS"

cp "$REPO_DIR/packaging/rpm/moderado-ide.spec" "$TOPDIR/SPECS/moderado-ide.spec"
sed -i "s/^Version:.*/Version: $RPM_VERSION/; s/^Release:.*/Release: $RPM_RELEASE/" "$TOPDIR/SPECS/moderado-ide.spec"
cp "$REPO_DIR/packaging/common/moderado-ide.desktop" "$TOPDIR/SOURCES/"
cp "$REPO_DIR/packaging/common/moderado-ide.appdata.xml" "$TOPDIR/SOURCES/"
cp "$REPO_DIR/packaging/common/moderado-ide.svg" "$TOPDIR/SOURCES/"
cp "$REPO_DIR/packaging/common/copyright" "$TOPDIR/SOURCES/"
cp "$REPO_DIR/LICENSE" "$TOPDIR/SOURCES/"
cp "$REPO_DIR/README.md" "$TOPDIR/SOURCES/"

# Copy metadata into the rpm build directory so the spec's %{_builddir}
# references resolve inside %install.
cp "$REPO_DIR/packaging/common/moderado-ide.desktop" "$TOPDIR/BUILD/"
cp "$REPO_DIR/packaging/common/moderado-ide.appdata.xml" "$TOPDIR/BUILD/"
cp "$REPO_DIR/packaging/common/moderado-ide.svg" "$TOPDIR/BUILD/"

# Metadata needed by the spec's %install (LICENSE/README are installed via %doc).
cp "$REPO_DIR/LICENSE" "$TOPDIR/BUILD/"
cp "$REPO_DIR/README.md" "$TOPDIR/BUILD/"

cp -a "$EDITOR_TREE"/. "$TOPDIR/BUILD/VSCode-linux-x64/"

rpmbuild -bb --target=x86_64 \
  -D "_topdir $TOPDIR" \
  "$TOPDIR/SPECS/moderado-ide.spec"

RPMS=$(find "$TOPDIR/RPMS" -name "moderado-ide-*.x86_64.rpm" -print -quit)
if [ -z "$RPMS" ]; then
  echo "error: rpmbuild did not produce a .rpm" >&2
  rpmbuild -bb --target=x86_64 -D "_topdir $TOPDIR" "$TOPDIR/SPECS/moderado-ide.spec" 2>&1 | tail -n 40
  exit 1
fi

PKG_PATH=$(cd "$OUT_DIR" && printf '%s' "$PWD/$(basename "$RPMS")")
cp "$RPMS" "$PKG_PATH"

ls -l "$PKG_PATH"
echo "sha256: $(sha256sum "$PKG_PATH" | awk '{print $1}')"
echo "RPM PACKAGED: $PKG_PATH"
