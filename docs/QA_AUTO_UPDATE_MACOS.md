# QA: Auto-Update Testing (macOS)

## What we're testing

Userscript Browser v1.5.0 adds a fix that bypasses macOS code-signature verification in the
auto-updater. This allows the app to detect and install updates without requiring an Apple
Developer certificate.

This guide walks through verifying the full update flow: detection → download → install.

---

## Where macOS builds come from

**macOS builds are published exclusively via GitHub Actions**, not SourceHut CI.

- Repository: https://github.com/KUKARAF/userscript-electron
- The `.github/workflows/release.yml` workflow runs on `macos-latest` only and publishes
  the `.dmg` files and `latest-mac.yml` metadata directly to GitHub Releases.
- SourceHut CI handles Windows and Linux builds.

This means macOS DMG assets will only appear on the GitHub Releases page after a `v*` tag
is pushed to the GitHub remote.

---

## Prerequisites

- macOS 12 or later
- Internet access (the updater contacts GitHub releases)
- The **previous release** of the app installed (see Step 1)

---

## Step 1 — Install the old version

1. Go to: https://github.com/KUKARAF/userscript-electron/releases
2. Find the release **before v1.5.0** (e.g. the highest tag below v1.5.0).
3. Download the `.dmg` file for your architecture:
   - Apple Silicon (M1/M2/M3): `Userscript-Browser-x.x.x-arm64.dmg`
   - Intel Mac: `Userscript-Browser-x.x.x-x64.dmg`
4. Open the `.dmg`, drag **Userscript Browser** to `/Applications`.
5. Launch the app — macOS may show an "unidentified developer" warning. To bypass it:
   - Open **System Settings → Privacy & Security**
   - Scroll down to the security section and click **Open Anyway** next to the Userscript Browser entry
   - Confirm in the dialog that appears

---

## Step 2 — Trigger the update check

1. Quit and relaunch the app (the update check fires 3 seconds after startup).
2. Wait up to 10 seconds.
3. **Expected**: A banner appears at the top of the window:
   > "Update available: v1.5.0"  with a **Download** button and a dismiss **×** button.

If no banner appears after 10 seconds, see the Troubleshooting section below.

---

## Step 3 — Download the update

1. Click **Download**.
2. The button label should change to show a percentage, e.g. `Downloading 42%`.
3. Wait for the download to complete.
4. **Expected**: Button changes to **Restart Now**.

---

## Step 4 — Install and verify

1. Click **Restart Now**.
2. The app quits and relaunches automatically.
3. **Expected**: App opens at v1.5.0.

To verify the version: open DevTools (`Cmd+Option+I`) → Console → run:
```js
require('electron').ipcRenderer.invoke  // or check window title / About menu if available
```
Or check `About Userscript Browser` in the menu bar if present.

---

## Pass criteria

| Step | Expected result |
|------|----------------|
| App launch (old version) | App opens without crash |
| 10 s after launch | Update banner visible with correct version number |
| Click Download | Progress percentage shown in button |
| Download completes | Button changes to "Restart Now" |
| Click Restart Now | App quits and relaunches |
| After relaunch | App is running v1.5.0 |

---

## Troubleshooting

### No banner after 10 seconds

1. Open DevTools: `Cmd+Option+I` → **Console** tab.
2. Look for any of these messages:
   - `Updater error:` — the updater threw an exception
   - `Updater check failed:` — the GitHub API was unreachable
   - `Update not available` — GitHub reports no newer release (check that v1.5.0 is published at https://github.com/KUKARAF/userscript-electron/releases)
3. Confirm the installed version is genuinely older than the latest GitHub release tag.
4. Confirm the GitHub Actions workflow completed successfully and the `latest-mac.yml` file is present in the v1.5.0 release assets.

### "Userscript Browser" is damaged and can't be opened

macOS Gatekeeper blocked the unsigned app. Fix:
```
xattr -dr com.apple.quarantine "/Applications/Userscript Browser.app"
```
Then relaunch.

### App crashes on launch after update

The update downloaded successfully but the new build may have an issue unrelated to the updater.
File a separate bug and re-install the previous version from the DMG.

---

## Notes for the team

- **macOS builds only on GitHub**: the SourceHut CI does not produce macOS artifacts. If the
  GitHub Actions run fails, there will be no macOS DMG for that release.
- **This fix is best-effort**: `verifyUpdateCodeSignature = false` is not an officially documented
  API in electron-updater. If a future upgrade of `electron-updater` removes support for it, the
  updater will silently fall back to failing on macOS. The long-term fix is to get an Apple
  Developer certificate and sign the builds.
- **Windows and Linux** auto-update is handled by SourceHut CI and is unaffected by this change.
- The update check only fires **once at startup**. There is no background polling.
