#!/usr/bin/env bash
set -euo pipefail

log() {
	echo "[vercel-build] $*"
}

set_convex_env_if_present() {
	local key="$1"
	local value="$2"
	local preview_name="$3"

	if [ -n "$value" ]; then
		bunx convex env set "$key" "$value" --preview-name "$preview_name"
	fi
}

if [ "${VERCEL_ENV:-}" = "production" ]; then
	log "Production build detected; building web without preview deploy."
	bun run build
	exit 0
fi

PREVIEW_KEY="${CONVEX_PREVIEW_DEPLOY_KEY:-${CONVEX_DEPLOY_KEY:-}}"

if [ -z "$PREVIEW_KEY" ]; then
	if [ -n "${VITE_CONVEX_URL:-}" ]; then
		log "No Convex deploy key found; using existing VITE_CONVEX_URL and building web."
		bun run build
		exit 0
	fi

	log "Missing Convex deploy key for preview build."
	log "Set CONVEX_DEPLOY_KEY (or CONVEX_PREVIEW_DEPLOY_KEY) in Vercel Preview env."
	exit 1
fi

if [ -n "${VERCEL_GIT_PULL_REQUEST_ID:-}" ]; then
	PREVIEW_NAME="pr-${VERCEL_GIT_PULL_REQUEST_ID}"
elif [ -n "${VERCEL_GIT_COMMIT_REF:-}" ]; then
	SAFE_REF="$(printf "%s" "$VERCEL_GIT_COMMIT_REF" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')"
	PREVIEW_NAME="${SAFE_REF:-preview}"
else
	PREVIEW_NAME="preview"
fi

SITE_URL=""
if [ -n "${VERCEL_URL:-}" ]; then
	SITE_URL="https://${VERCEL_URL}"
fi

PROD_CONVEX_SITE_URL="${PRODUCTION_CONVEX_SITE_URL:-https://outgoing-setter-201.convex.site}"

if [ "${CONVEX_DRY_RUN:-0}" = "1" ]; then
	log "Dry run enabled."
	log "Would deploy Convex preview named: ${PREVIEW_NAME}"
	log "Would set SITE_URL=${SITE_URL:-<empty>}"
	log "Would set DEPLOYMENT_TYPE=preview"
	log "Would set PRODUCTION_CONVEX_SITE_URL=${PROD_CONVEX_SITE_URL}"
	log "Would run web build with VITE_CONVEX_URL + derived VITE_CONVEX_SITE_URL."
	exit 0
fi

export CONVEX_DEPLOY_KEY="$PREVIEW_KEY"

log "Deploying Convex preview: ${PREVIEW_NAME}"
(
	cd ../server
	bunx convex deploy --yes \
		--preview-create "$PREVIEW_NAME" \
		--preview-run previewSeed \
		--cmd-url-env-var-name VITE_CONVEX_URL \
		--cmd 'cd ../web && export VITE_CONVEX_SITE_URL="$(printf "%s" "$VITE_CONVEX_URL" | sed "s/\.convex\.cloud$/.convex.site/")" && bun run build'
)

log "Syncing Convex preview env vars for ${PREVIEW_NAME}"
(
	cd ../server
	set_convex_env_if_present "SITE_URL" "$SITE_URL" "$PREVIEW_NAME"
	set_convex_env_if_present "DEPLOYMENT_TYPE" "preview" "$PREVIEW_NAME"
	set_convex_env_if_present "PRODUCTION_CONVEX_SITE_URL" "$PROD_CONVEX_SITE_URL" "$PREVIEW_NAME"
	set_convex_env_if_present "BETTER_AUTH_SECRET" "${BETTER_AUTH_SECRET:-}" "$PREVIEW_NAME"
	set_convex_env_if_present "GITHUB_CLIENT_ID" "${AUTH_GITHUB_CLIENT_ID:-${GITHUB_CLIENT_ID:-}}" "$PREVIEW_NAME"
	set_convex_env_if_present "GITHUB_CLIENT_SECRET" "${AUTH_GITHUB_CLIENT_SECRET:-${GITHUB_CLIENT_SECRET:-}}" "$PREVIEW_NAME"
	set_convex_env_if_present "VERCEL_CLIENT_ID" "${VERCEL_CLIENT_ID:-}" "$PREVIEW_NAME"
	set_convex_env_if_present "VERCEL_CLIENT_SECRET" "${VERCEL_CLIENT_SECRET:-}" "$PREVIEW_NAME"
)

log "Preview build completed."
