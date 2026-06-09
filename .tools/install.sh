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

  echo "  Mounting (DMG: $tmp)..."
  local plist_output
  plist_output=$(hdiutil attach "$tmp" -nobrowse -plist 2>&1)
  echo "  hdiutil exit code: $?"
  echo "  hdiutil output: $plist_output"

  local mount_point
  mount_point=$(echo "$plist_output" \
    | grep -A1 '<key>mount-point</key>' \
    | grep '<string>' \
    | sed 's|.*<string>\(.*\)</string>.*|\1|' \
    | tail -1)

  echo "  Resolved mount point: '$mount_point'"

  if [ -z "$mount_point" ]; then
    echo "Error: failed to mount DMG." >&2
    exit 1
  fi

  echo "  DMG contents:"
  ls -la "$mount_point" 2>&1 || echo "  (could not list mount point)"

  echo "  Installing to /Applications..."
  rm -rf "$APP_PATH"
  cp -Rv "${mount_point}/${APP_NAME}.app" /Applications/ 2>&1

  echo "  Removing quarantine..."
  xattr -rd com.apple.quarantine "$APP_PATH" 2>&1 || true

  echo "  Cleaning up..."
  hdiutil detach "$mount_point" -quiet 2>/dev/null || true
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
