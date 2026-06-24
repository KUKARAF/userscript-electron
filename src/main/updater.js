import { autoUpdater } from 'electron-updater'
import { app } from 'electron'
import { spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'

let _downloadedFile = null

export function registerUpdater(mainWindow) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update:available', { version: info.version })
  })

  autoUpdater.on('update-downloaded', (info) => {
    _downloadedFile = info.downloadedFile
    mainWindow.webContents.send('update:ready')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update:progress', Math.round(progress.percent))
  })

  autoUpdater.on('error', (err) => {
    console.error('Updater error:', err)
  })

  // Check for updates on startup (after a short delay so window is rendered)
  setTimeout(() => autoUpdater.checkForUpdates().catch(err => console.error('Updater check failed:', err)), 3000)
}

export function triggerInstall() {
  if (process.platform !== 'darwin') {
    autoUpdater.quitAndInstall()
    return
  }

  // macOS: electron-updater's quitAndInstall() runs a codesign check on the
  // running app before applying the update. Unsigned builds fail that check,
  // so we do the install ourselves: extract the downloaded zip, swap the .app
  // bundle, and relaunch — all from a detached shell script so it survives
  // the app quitting.
  const zipPath = _downloadedFile

  // Walk up from the executable to find the .app bundle root
  let appBundlePath = process.execPath
  while (appBundlePath !== '/' && !appBundlePath.endsWith('.app')) {
    appBundlePath = dirname(appBundlePath)
  }

  const script = `#!/bin/bash
set -e
sleep 2
TEMP="$(mktemp -d)"
unzip -q ${JSON.stringify(zipPath)} -d "$TEMP"
NEW_APP="$(find "$TEMP" -maxdepth 1 -name "*.app" | head -1)"
[ -z "$NEW_APP" ] && { rm -rf "$TEMP"; exit 1; }
rm -rf ${JSON.stringify(appBundlePath)}
cp -R "$NEW_APP" ${JSON.stringify(dirname(appBundlePath))}/
rm -rf "$TEMP"
open ${JSON.stringify(appBundlePath)}
`

  const scriptPath = join(app.getPath('temp'), 'userscript-update.sh')
  writeFileSync(scriptPath, script, { mode: 0o755 })

  spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' }).unref()
  app.quit()
}
