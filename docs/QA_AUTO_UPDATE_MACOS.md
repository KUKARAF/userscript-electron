# QA: Auto-Update Testing (macOS)

## What we're testing

Userscript Browser v1.5.1 fixes the macOS auto-update download failure (`ERR_UPDATER_ZIP_FILE_NOT_FOUND`).
`electron-updater`'s macOS updater requires a `.zip` asset in the release to deliver the update —
the `.dmg` is only for first-time installs. v1.5.1 adds `zip` as a build target so `latest-mac.yml`
includes the required file.

v1.5.0 added the code-signature bypass (`verifyUpdateCodeSignature = false`) needed for unsigned
macOS builds. Both fixes together are required for the full update flow to work.

> **Important — start from v1.5.0, not v1.4.0.**
> The code-signature bypass only exists in v1.5.0+ app code. If you install v1.4.0 as the
> starting version, the updater will fail at a different point (signature verification) even after
> the zip fix. Always use v1.5.0 as the "old" version for this test.
>
> End users on v1.4.0 cannot auto-update and must manually download and reinstall from the DMG.

---

## Where macOS builds come from

**macOS builds are published exclusively via GitHub Actions**, not SourceHut CI.

- Repository: https://github.com/KUKARAF/userscript-electron
- The `.github/workflows/release.yml` workflow runs on `macos-latest` only and publishes
  both `.dmg` and `.zip` files plus `latest-mac.yml` metadata to GitHub Releases.
- SourceHut CI handles Windows and Linux builds.

macOS DMG/ZIP assets only appear on the GitHub Releases page after a `v*` tag is pushed to
the GitHub remote.

---

## Prerequisites

- macOS 12 or later
- Internet access (the updater contacts GitHub releases)
- **v1.5.0** of the app installed as the starting version (see Step 1)

---

## Step 1 — Install v1.5.0 (the old version)

1. Go to: https://github.com/KUKARAF/userscript-electron/releases/tag/v1.5.0
2. Download the `.dmg` file for your architecture:
   - Apple Silicon (M1/M2/M3): `Userscript-Browser-1.5.0-arm64.dmg`
   - Intel Mac: `Userscript-Browser-1.5.0-x64.dmg`
3. Open the `.dmg`, drag **Userscript Browser** to `/Applications`.
4. Launch the app — macOS may show an "unidentified developer" warning. To bypass it:
   - Open **System Settings → Privacy & Security**
   - Scroll down and click **Open Anyway** next to Userscript Browser
   - Confirm in the dialog that appears
   - If you see "damaged and can't be opened", run in Terminal:
     ```
     xattr -dr com.apple.quarantine "/Applications/Userscript Browser.app"
     ```
     Then relaunch.

---

## Step 2 — Trigger the update check

1. Quit and relaunch the app (the update check fires 3 seconds after startup).
2. Wait up to 10 seconds.
3. **Expected**: A banner appears at the top of the window:
   > "Update available: v1.5.1" with a **Download** button and a dismiss **×** button.

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
3. **Expected**: App opens at v1.5.1.

To verify: open DevTools (`Cmd+Option+I`) → Console tab and check for any version output,
or look in the app's About menu if present.

---

## Pass criteria

| Step | Expected result |
|------|----------------|
| App launch (v1.5.0) | App opens without crash |
| 10 s after launch | Update banner shows "Update available: v1.5.1" |
| Click Download | Button shows download percentage |
| Download completes | Button changes to "Restart Now" |
| Click Restart Now | App quits and relaunches |
| After relaunch | App is running v1.5.1 |

---

## Troubleshooting

### No banner after 10 seconds

1. Open DevTools: `Cmd+Option+I` → **Console** tab.
2. Look for:
   - `Updater error:` — the updater threw an exception
   - `Updater check failed:` — GitHub API unreachable
   - `Update not available` — check that v1.5.1 is published at https://github.com/KUKARAF/userscript-electron/releases
3. Confirm the installed version is v1.5.0 (not v1.5.1 already).
4. Confirm the GitHub Actions workflow for v1.5.1 completed and `latest-mac.yml` is present in the release assets.

### ERR_UPDATER_ZIP_FILE_NOT_FOUND in console

This means you are running a version older than v1.5.1 as the *update target* (i.e. `latest-mac.yml`
is from a pre-v1.5.1 release that lacks zip assets). Ensure the GitHub release for v1.5.1 is complete.

### "Userscript Browser" is damaged and can't be opened

```
xattr -dr com.apple.quarantine "/Applications/Userscript Browser.app"
```
Then relaunch.

### App crashes on launch after update

File a separate bug and reinstall from the v1.5.0 DMG.

---

## Notes for the team

- **macOS builds only on GitHub**: SourceHut CI does not produce macOS artifacts. If the
  GitHub Actions run fails, there will be no macOS assets for that release.
- **This fix is best-effort**: `verifyUpdateCodeSignature = false` is not an officially documented
  property in electron-updater. If a future upgrade removes it, the updater will fail silently on
  macOS. The long-term fix is an Apple Developer certificate + notarization.
- **Windows and Linux** auto-update is handled by SourceHut CI and is unaffected by these changes.
- The update check fires **once at startup only** — no background polling.
