#!/usr/bin/env bash
# Builds the PublicLore folder into a static website with Quartz.
# Used by .github/workflows/deploy-wiki.yml; you can also run it yourself
# (needs Node 22+ and git): bash .quartz/build.sh
# Output: .quartz/.work/quartz/public
set -euo pipefail

QUARTZ_VERSION="v5.1.0"   # pinned so an upstream release can't break the site; bump deliberately
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$REPO_ROOT/.quartz/.work"
QUARTZ="$WORK/quartz"
CONTENT="$REPO_ROOT/PublicLore"

# 1. Get Quartz (cached between local runs).
if [ ! -d "$QUARTZ/.git" ] || [ "$(git -C "$QUARTZ" describe --tags 2>/dev/null)" != "$QUARTZ_VERSION" ]; then
  rm -rf "$QUARTZ"
  mkdir -p "$WORK"
  git clone --quiet --depth 1 --branch "$QUARTZ_VERSION" https://github.com/jackyzha0/quartz.git "$QUARTZ"
  (cd "$QUARTZ" && npm ci --no-audit --no-fund)
fi

# 2. Drop in our settings and styles.
cp "$REPO_ROOT/.quartz/quartz.config.yaml" "$QUARTZ/quartz.config.yaml"
# The site's address. The workflow sets SITE_BASE_URL from GitHub Pages
# (e.g. user.github.io/repo before the custom domain is set, vigillhelix.wiki after),
# so links work under either address.
if [ -n "${SITE_BASE_URL:-}" ]; then
  base="${SITE_BASE_URL#http://}"; base="${base#https://}"; base="${base%/}"
  sed -i "s|^  baseUrl: .*|  baseUrl: $base|" "$QUARTZ/quartz.config.yaml"
  echo "Using baseUrl: $base"
fi
if [ -f "$REPO_ROOT/.quartz/custom.scss" ]; then
  cp "$REPO_ROOT/.quartz/custom.scss" "$QUARTZ/quartz/styles/custom.scss"
fi
cp "$REPO_ROOT/.quartz/quartz.ts" "$QUARTZ/quartz.ts"
cp "$REPO_ROOT/.quartz/static/"* "$QUARTZ/quartz/static/"   # icon, logo, cover image, fallback banner
(cd "$QUARTZ" && npm run --silent install-plugins)

# Self-hosted fonts (no Google Fonts requests from visitors' browsers).
# Must match the list in .quartz/custom.scss.
FONTS="ibm-plex-sans/400-normal ibm-plex-sans/400-italic ibm-plex-sans/600-normal ibm-plex-sans/600-italic
ibm-plex-sans-condensed/400-normal ibm-plex-sans-condensed/700-normal
ibm-plex-mono/400-normal ibm-plex-mono/600-normal"
FONT_DIR="$QUARTZ/quartz/static/fonts"
if [ ! -d "$WORK/fonts/node_modules" ]; then
  mkdir -p "$WORK/fonts"
  (cd "$WORK/fonts" && npm init -y >/dev/null && npm install --no-audit --no-fund --silent \
    @fontsource/ibm-plex-sans@5 @fontsource/ibm-plex-sans-condensed@5 @fontsource/ibm-plex-mono@5)
fi
mkdir -p "$FONT_DIR"
for f in $FONTS; do
  pkg="${f%%/*}"; variant="${f#*/}"
  cp "$WORK/fonts/node_modules/@fontsource/$pkg/files/$pkg-latin-$variant.woff2" "$FONT_DIR/"
done

# 3. Front page and section pages. stage.py writes temporary index.md files
#    into PublicLore (listed in $CREATED); they are deleted when the build ends.
CREATED="$WORK/created.txt"
CAMPAIGN_SRC="${CAMPAIGN_SRC:-$REPO_ROOT/.campaigns}"   # checkout of hierophant-campaigns
CAMPAIGN_DST="$CONTENT/Campaigns"
COPIED_CAMPAIGNS=""
cleanup() {
  if [ -f "$CREATED" ]; then while IFS= read -r f; do rm -f "$f"; done < "$CREATED"; rm -f "$CREATED"; fi
  if [ -n "$COPIED_CAMPAIGNS" ]; then rm -rf "$CAMPAIGN_DST"; fi
}
trap cleanup EXIT

# Campaign pages from the campaign team's repo become PublicLore/Campaigns for
# this build only. Every .md at its top level is published except README.md;
# an images/ folder is copied too. Templates and anything else are left out.
if [ -d "$CAMPAIGN_SRC" ]; then
  if [ -e "$CAMPAIGN_DST" ]; then
    echo "PublicLore/Campaigns already exists in the vault; not adding campaign pages." >&2
  else
    mkdir -p "$CAMPAIGN_DST"; COPIED_CAMPAIGNS=1
    find "$CAMPAIGN_SRC" -maxdepth 1 -type f -name '*.md' ! -name 'README.md' -exec cp {} "$CAMPAIGN_DST/" \;
    [ -d "$CAMPAIGN_SRC/images" ] && cp -r "$CAMPAIGN_SRC/images" "$CAMPAIGN_DST/images"
    echo "Added $(find "$CAMPAIGN_DST" -maxdepth 1 -name '*.md' | wc -l) campaign pages."
  fi
fi
python3 "$REPO_ROOT/.quartz/stage.py" "$CONTENT" "$CREATED"

# 4. Build straight from PublicLore so page dates come from git history.
(cd "$QUARTZ" && npx quartz build -d "$CONTENT" -o "$QUARTZ/public")
echo "Built site: $QUARTZ/public"
