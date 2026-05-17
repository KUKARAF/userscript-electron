import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { safeStorage } from 'electron'
import { registerDevice, pollRegistrationStatus } from './api.js'
import store from './store.js'

const tokenPath = () => join(app.getPath('userData'), 'device_token.enc')

export function saveToken(token) {
  const p = tokenPath()
  if (!token) {
    try { fs.unlinkSync(p) } catch { /* already gone */ }
    return
  }
  fs.writeFileSync(p, safeStorage.encryptString(token))
}

export function loadToken() {
  try {
    const p = tokenPath()
    if (!fs.existsSync(p)) return ''
    return safeStorage.decryptString(fs.readFileSync(p))
  } catch {
    return ''
  }
}

export async function ensureRegistered() {
  if (loadToken()) return

  ipcMain.removeHandler('register:submit')

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 420,
      height: 480,
      resizable: false,
      title: 'Activate Device',
      webPreferences: {
        preload: join(__dirname, '../preload/register-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    if (!app.isPackaged) {
      win.loadURL(new URL('register.html', process.env['ELECTRON_RENDERER_URL']).href)
    } else {
      win.loadFile(join(__dirname, '../renderer/register.html'))
    }

    let done = false
    let winDestroyed = false

    win.on('closed', () => {
      winDestroyed = true
      ipcMain.removeHandler('register:submit')
      if (!done) app.quit()
    })

    ipcMain.handle('register:submit', async (_, { name, email }) => {
      const { id, emoji } = await registerDevice({ name, email })
      ipcMain.removeHandler('register:submit')
      store.set('deviceRegistrationId', id)
      pollForToken({ id, win, onDone: () => { done = true }, resolve, isDestroyed: () => winDestroyed })
      return emoji
    })
  })
}

async function pollForToken({ id, win, onDone, resolve, isDestroyed }, maxAttempts = 120, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs))
    if (isDestroyed()) return

    let result
    try {
      result = await pollRegistrationStatus(id)
    } catch {
      continue
    }

    const { status, token } = result
    if (status === 'approved' && token) {
      saveToken(token)
      store.set('deviceRegistrationId', '')
      onDone()
      if (!isDestroyed()) win.webContents.send('register:approved')
      setTimeout(() => {
        if (!isDestroyed()) win.close()
        resolve()
      }, 1500)
      return
    }
    if (status === 'rejected' || status === 'expired') {
      if (!isDestroyed()) win.webContents.send('register:error', `Registration ${status}. Please restart the app.`)
      return
    }
  }
  if (!isDestroyed()) win.webContents.send('register:error', 'Approval timed out (10 min). Please restart.')
}

export async function callWithAutoReregister(fn) {
  try {
    return await fn()
  } catch (err) {
    if (err.message.includes('401')) {
      saveToken('')
      await ensureRegistered()
      return fn()
    }
    throw err
  }
}
