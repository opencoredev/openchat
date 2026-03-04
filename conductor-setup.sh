#!/bin/bash
# Ensure this script runs in bash even if called from fish or other shells
if [ -z "$BASH_VERSION" ]; then
    exec bash "$0" "$@"
fi

set -e

echo "======================================"
echo "OpenChat Conductor Workspace Setup"
echo "======================================"
echo ""

# Check for required tools
echo "Checking for required tools..."

if ! command -v bun &> /dev/null; then
    echo "Error: Bun is not installed or not in PATH"
    echo "   Install Bun from: https://bun.sh"
    exit 1
fi
echo "Bun found: $(bun --version)"

# Install dependencies
echo ""
echo "Installing dependencies..."
export npm_config_build_from_source=false
export npm_config_optional=false
bun install || {
    echo "Initial install had some errors, trying with --ignore-scripts..."
    bun install --ignore-scripts
}

echo ""
echo "Configuring Convex cloud dev deployment..."

mkdir -p apps/server apps/web

# Copy .env.local from main repo (contains dev deployment config)
# For git worktrees, --git-common-dir points to the main repo's .git directory
MAIN_REPO="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"

if [ -f "$MAIN_REPO/apps/server/.env.local" ]; then
    cp "$MAIN_REPO/apps/server/.env.local" apps/server/.env.local
    echo "Copied server env from main repo"
else
    echo "Warning: No .env.local found in main repo"
fi

if [ -f "$MAIN_REPO/apps/web/.env.local" ]; then
    cp "$MAIN_REPO/apps/web/.env.local" apps/web/.env.local
    echo "Copied web env from main repo"
else
    # Fallback: use the project's shared dev deployment URLs
    # NOTE: If the dev deployment is recreated, update these URLs
    # You can find the current URLs in the main repo's apps/web/.env.local
    cat > apps/web/.env.local << EOF
VITE_CONVEX_URL=https://sincere-woodpecker-479.convex.cloud
VITE_CONVEX_SITE_URL=https://sincere-woodpecker-479.convex.site
EOF
    echo "Created web env with dev deployment URLs"
fi

# Make sure server package.json uses regular convex dev (not --local)
if [ -f "apps/server/package.json" ]; then
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('apps/server/package.json', 'utf8'));
        pkg.scripts.dev = 'convex dev';
        fs.writeFileSync('apps/server/package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
fi

if [ -f "apps/web/package.json" ]; then
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('apps/web/package.json', 'utf8'));
        pkg.scripts = pkg.scripts || {};
        pkg.scripts.dev = 'BROWSERSLIST_IGNORE_OLD_DATA=true BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA=true portless ${PORTLESS_NAME:-openchat} vite dev';
        if (!pkg.devDependencies) pkg.devDependencies = {};
        pkg.devDependencies.portless = pkg.devDependencies.portless || '^0.5.2';
        fs.writeFileSync('apps/web/package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
fi

echo ""
echo "======================================"
echo "Setup complete!"
echo "======================================"
echo ""
echo "Run 'bun dev' to start dev servers."
echo "Web URL: http://<portless-name>.localhost:1355"
echo "Worktrees get an auto-derived PORTLESS_NAME from scripts/dev.ts"
echo ""
echo "This workspace uses the shared Convex dev deployment."
echo "When you switch worktrees, run 'bun dev' to sync schemas."
echo ""
