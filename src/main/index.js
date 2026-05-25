import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc.js'
import { ensureRegistered, loadToken } from './registration.js'
import { registerUpdater } from './updater.js'
import { fetchAssignedScripts } from './api.js'
import store from './store.js'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    backgroundColor: '#2c2c2e',
  })

  if (!app.isPackaged) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerIpcHandlers(win)
  registerUpdater(win)
  startScriptSync(win)

  return win
}

function startScriptSync(win) {
  const sync = async () => {
    try {
      const token = loadToken()
      if (!token) return
      const scripts = await fetchAssignedScripts(token)
      store.set('scripts', scripts)
      win.webContents.send('scripts:updated', scripts)
    } catch (err) {
      console.error('Script sync failed:', err.message)
      win.webContents.send('scripts:sync-failed', err.message)
    }
  }
  // Sync on startup
  sync()
}

app.whenReady().then(async () => {
  await ensureRegistered()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
