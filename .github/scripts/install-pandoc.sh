#!/usr/bin/env bash
# Install pandoc + pandoc-crossref on an Ubuntu runner (no LaTeX). Versions are
# pinned but overridable via env; bump them when the toolchain moves.
set -euo pipefail

PANDOC_VERSION="${PANDOC_VERSION:-3.8.2}"
CROSSREF_VERSION="${CROSSREF_VERSION:-0.3.22.0}"

echo "── installing pandoc ${PANDOC_VERSION} ──"
curl -fsSL "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-1-amd64.deb" -o /tmp/pandoc.deb
sudo dpkg -i /tmp/pandoc.deb

echo "── installing pandoc-crossref ${CROSSREF_VERSION} ──"
curl -fsSL "https://github.com/lierdakil/pandoc-crossref/releases/download/v${CROSSREF_VERSION}/pandoc-crossref-Linux-X64.tar.xz" -o /tmp/crossref.tar.xz
sudo tar -xJf /tmp/crossref.tar.xz -C /usr/local/bin pandoc-crossref

pandoc --version | head -1
pandoc-crossref --version 2>/dev/null | head -1 || true
