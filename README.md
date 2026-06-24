# Userscript Browser

Minimal Electron browser that loads sites and injects userscripts from [userscripts.osmosis.page](https://userscripts.osmosis.page).

---

## Install

### macOS — one-liner

Detects your architecture (Intel or Apple Silicon), downloads the correct release, installs to `/Applications`, and strips the quarantine flag automatically.

```sh
curl -fsSL https://raw.githubusercontent.com/KUKARAF/userscript-electron/main/.tools/install.sh | bash
```

Re-running the command will update to the latest release if a newer version is available.

---

### macOS — manual install

Apple requires a $99/year Developer Program membership to notarize apps for distribution outside the App Store. We don't pay that ransom, so macOS will flag the `.app` as coming from an unidentified developer. Here's how to install anyway:

1. Go to the [Releases](https://github.com/KUKARAF/userscript-electron/releases/latest) page and download the `.dmg` for your Mac:
   - **Apple Silicon (M-series):** `Userscript-Browser-<version>-arm64.dmg`
   - **Intel:** `Userscript-Browser-<version>.dmg`

2. Open the `.dmg` and drag **Userscript Browser.app** into `/Applications`.

3. **Remove the quarantine attribute** — macOS blocks unsigned apps by default. Run this once in Terminal:
   ```sh
   xattr -rd com.apple.quarantine "/Applications/Userscript Browser.app"
   ```

4. Open the app normally from `/Applications` or Spotlight.

> **Why does this happen?** macOS Gatekeeper rejects apps that aren't signed with an Apple-issued certificate and notarized by Apple's servers. The `xattr` command above removes the quarantine flag that triggers this check — it does not disable Gatekeeper system-wide or affect any other app.

Alternatively, if you'd rather not use the terminal: right-click (or Control-click) the app in Finder and choose **Open**, then confirm in the dialog. macOS remembers this choice and won't prompt again.

---

## Updates

### In-app updates

The app checks for a new release automatically a few seconds after launch. When one is available, a banner appears at the top of the window:

1. Click **Download** — a progress percentage is shown while the update downloads.
2. Once complete, click **Restart Now**.
3. **macOS only:** because the app is unsigned, the standard updater can't verify the download. Instead, a Terminal window opens and runs the install script — you'll see it extract the new version and replace the old one. The app relaunches automatically when it's done. You can close the Terminal window afterwards.

### Manual update (macOS one-liner)

Re-running the install command will update to the latest release if one is available, or do nothing if you're already up to date:

```sh
curl -fsSL https://raw.githubusercontent.com/KUKARAF/userscript-electron/main/.tools/install.sh | bash
```
