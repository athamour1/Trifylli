#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────────
REPO="athamour1/Trifylli"
REGISTRY="ghcr.io"
# Τα δύο production images του Trifylli. Το path στο GHCR είναι πεζό.
API_IMAGE="${REGISTRY}/athamour1/trifylli/api"
WEB_IMAGE="${REGISTRY}/athamour1/trifylli/web"
# Και τα δύο χτίζονται με context τη ΡΙΖΑ του monorepo (χρειάζονται το packages/shared).
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Colors ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${CYAN}ℹ ${NC}$1"; }
ok()    { echo -e "${GREEN}✔ ${NC}$1"; }
warn()  { echo -e "${YELLOW}⚠ ${NC}$1"; }
error() { echo -e "${RED}✖ ${NC}$1"; exit 1; }

cd "$ROOT_DIR"

# ─── Pre-flight checks ─────────────────────────────────────────────────────────
command -v gh     >/dev/null || error "gh CLI not found. Install: https://cli.github.com"
command -v docker >/dev/null || error "docker not found."
gh auth status    >/dev/null 2>&1 || error "Not logged in to GitHub CLI. Run: gh auth login"

# ─── Ask for version ───────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}       🍀 Trifylli Release Script${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# Show latest existing tags for context
LATEST_TAGS=$(git tag --sort=-v:refname 2>/dev/null | head -5)
if [ -n "$LATEST_TAGS" ]; then
  info "Latest tags:"
  echo "$LATEST_TAGS" | sed 's/^/   /'
  echo ""
fi

read -rp "$(echo -e "${YELLOW}Enter version to release (e.g. 1.0.0): ${NC}")" VERSION

# Validate semver-ish format
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+.*$ ]]; then
  error "Invalid version format. Use semver (e.g. 1.0.0, 1.2.3-beta.1)"
fi

TAG="v${VERSION}"

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  error "Tag $TAG already exists! Choose a different version."
fi

# Clean working tree (αλλιώς ο version commit θα τραβήξει άσχετες αλλαγές)
if [ -n "$(git status --porcelain)" ]; then
  error "Working tree is not clean. Commit or stash your changes first."
fi

# ─── Confirmation ───────────────────────────────────────────────────────────────
echo ""
info "This will:"
echo "   1. Build Docker images for api & web"
echo "   2. Push images to ${REGISTRY}/athamour1/trifylli"
echo "   3. Create Git tag ${TAG}"
echo "   4. Create GitHub release ${TAG}"
echo ""
echo -e "   📦 ${API_IMAGE}:${TAG}"
echo -e "   📦 ${WEB_IMAGE}:${TAG}"
echo ""

read -rp "$(echo -e "${YELLOW}Proceed? (y/N): ${NC}")" CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  warn "Aborted."
  exit 0
fi

echo ""

# ─── Bump version & commit ─────────────────────────────────────────────────────
info "Bumping version to ${VERSION}..."
for pkg in package.json apps/api/package.json apps/web/package.json; do
  if [ -f "$pkg" ]; then
    sed -i "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" "$pkg"
    ok "${pkg} → ${VERSION}"
  fi
done

git add package.json apps/api/package.json apps/web/package.json
git commit -m "chore(release): bump version to ${VERSION}"
ok "Version commit created"

# ─── Login to GHCR ─────────────────────────────────────────────────────────────
info "Logging in to ${REGISTRY}..."
gh auth token | docker login "$REGISTRY" -u "$(gh api user -q .login)" --password-stdin
ok "Logged in to ${REGISTRY}"

# ─── Build & push api ──────────────────────────────────────────────────────────
# Οι ρυθμίσεις της PWA είναι runtime (config.js από τον entrypoint), οπότε το web
# image είναι ανεξάρτητο περιβάλλοντος — κανένα build-arg εδώ.
info "Building api image..."
docker build -f apps/api/Dockerfile -t "${API_IMAGE}:${TAG}" -t "${API_IMAGE}:latest" .
ok "api image built"

info "Pushing api image..."
docker push "${API_IMAGE}:${TAG}"
docker push "${API_IMAGE}:latest"
ok "api image pushed"

# ─── Build & push web ──────────────────────────────────────────────────────────
info "Building web image..."
docker build -f apps/web/Dockerfile -t "${WEB_IMAGE}:${TAG}" -t "${WEB_IMAGE}:latest" .
ok "web image built"

info "Pushing web image..."
docker push "${WEB_IMAGE}:${TAG}"
docker push "${WEB_IMAGE}:latest"
ok "web image pushed"

# ─── Create Git tag & GitHub release ────────────────────────────────────────────
info "Creating Git tag ${TAG}..."
git tag -a "$TAG" -m "Release ${TAG}"
git push origin HEAD
git push origin "$TAG"
ok "Tag ${TAG} pushed"

info "Creating GitHub release..."
gh release create "$TAG" \
  --repo "$REPO" \
  --title "🍀 Trifylli ${TAG}" \
  --generate-notes
ok "GitHub release created"

# ─── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 Release ${TAG} complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Images:"
echo "    docker pull ${API_IMAGE}:${TAG}"
echo "    docker pull ${WEB_IMAGE}:${TAG}"
echo ""
echo "  Release:"
echo "    https://github.com/${REPO}/releases/tag/${TAG}"
echo ""
