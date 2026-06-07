#!/usr/bin/env bash
set -e

REPO="KUKARAF/userscript-electron"
APP_NAME="Userscript Browser"
APP_PATH="/Applications/${APP_NAME}.app"

# ── helpers ───────────────────────────────────────────────────────────────────

get_latest_version() {
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed 's/.*"tag_name": *"v\([^"]*\)".*/\1/'
}

get_installed_version() {
  if [ -d "$APP_PATH" ]; then
    defaults read "${APP_PATH}/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo ""
  else
    echo ""
  fi
}

# ── macOS ─────────────────────────────────────────────────────────────────────

install_macos() {
  local version="$1"
  local arch
  arch=$(uname -m)

  local dmg
  if [ "$arch" = "arm64" ]; then
    dmg="Userscript-Browser-${version}-arm64.dmg"
  else
    dmg="Userscript-Browser-${version}.dmg"
  fi

  local url="https://github.com/${REPO}/releases/download/v${version}/${dmg}"
  local tmp="/tmp/${dmg}"

  echo "  Downloading ${dmg}..."
  curl -fsSL -o "$tmp" "$url"

  echo "  Mounting..."
  local mount_point
  mount_point=$(hdiutil attach "$tmp" -nobrowse | grep "Apple_HFS" | awk '{for(i=3;i<=NF;i++) printf $i" "; print ""}' | xargs)

  echo "  Installing to /Applications..."
  rm -rf "$APP_PATH"
  cp -R "${mount_point}/${APP_NAME}.app" /Applications/

  echo "  Removing quarantine..."
  xattr -rd com.apple.quarantine "$APP_PATH"

  echo "  Cleaning up..."
  hdiutil detach "$mount_point" -quiet
  rm -f "$tmp"
}

run_macos() {
  local latest installed

  echo "Checking latest version..."
  latest=$(get_latest_version)
  installed=$(get_installed_version)

  if [ -z "$latest" ]; then
    echo "Error: could not fetch latest version from GitHub." >&2
    exit 1
  fi

  if [ "$installed" = "$latest" ]; then
    echo "${APP_NAME} ${installed} is already up to date."
  elif [ -n "$installed" ]; then
    echo "Updating ${APP_NAME} ${installed} → ${latest}..."
    install_macos "$latest"
    echo "Updated to ${latest}."
  else
    echo "Installing ${APP_NAME} ${latest}..."
    install_macos "$latest"
    echo "Installed ${latest}."
  fi

  echo "Launching ${APP_NAME}..."
  open "$APP_PATH"
}

# ── Linux (stub) ──────────────────────────────────────────────────────────────

run_linux() {
  echo "Linux install not yet implemented." >&2
  exit 1
}

# ── entrypoint ────────────────────────────────────────────────────────────────

case "$(uname -s)" in
  Darwin) run_macos ;;
  Linux)  run_linux ;;
  *)      echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
