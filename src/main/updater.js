import { autoUpdater } from 'electron-updater'

export function registerUpdater(mainWindow) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update:available', { version: info.version })
  })

  autoUpdater.on('update-downloaded', () => {
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
