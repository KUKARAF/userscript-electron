import { ipcMain, app } from 'electron'
import { join } from 'path'
import store from './store.js'
import { uploadHtmlChunk, createTask, pollStatus, approveTask, rejectTask } from './api.js'
import { saveScript, loadScriptCode, deleteScriptFile } from './scripts.js'
import { loadToken, saveToken, callWithAutoReregister } from './registration.js'

export function registerIpcHandlers(mainWindow) {
  ipcMain.handle('store:get', (_, key) => store.get(key))
  ipcMain.handle('store:set', (_, key, value) => store.set(key, value))
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-platform', () => process.platform)
  ipcMain.handle('paths:webview-preload', () =>
    join(__dirname, '../preload/webview-preload.js')
  )
  ipcMain.handle('window:minimize', () => mainWindow.minimize())
  ipcMain.handle('window:maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow.close())

  // --- Token ---

  ipcMain.handle('token:load', () => loadToken())
  ipcMain.handle('token:save', (_, token) => saveToken(token))

  // --- API ---

  ipcMain.handle('api:upload-html-chunk', (_, data) =>
    callWithAutoReregister(() => uploadHtmlChunk(loadToken(), data))
  )

  ipcMain.handle('api:create-task', (_, data) =>
    callWithAutoReregister(() => createTask(loadToken(), data))
  )

  ipcMain.handle('api:poll-status', (_, submission_token) => pollStatus(submission_token))

  ipcMain.handle('api:approve-task', (_, id) =>
    callWithAutoReregister(() => approveTask(loadToken(), id))
  )

  ipcMain.handle('api:reject-task', (_, id) =>
    callWithAutoReregister(() => rejectTask(loadToken(), id))
  )

  // --- Script cache ---

  ipcMain.handle('scripts:save', async (_, script) => {
    await saveScript(script)
    const scripts = store.get('scripts') || []
    const idx = scripts.findIndex((s) => s.name === script.name)
    const entry = { name: script.name, match_pattern: script.match_pattern, created_at: new Date().toISOString() }
    if (idx >= 0) scripts[idx] = entry
    else scripts.push(entry)
    store.set('scripts', scripts)
  })

  ipcMain.handle('scripts:load-code', (_, name) => loadScriptCode(name))

  ipcMain.handle('scripts:delete', async (_, name) => {
    await deleteScriptFile(name)
    store.set('scripts', (store.get('scripts') || []).filter((s) => s.name !== name))
  })

  // --- Keyboard shortcuts (intercepted before webview consumes them) ---

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (!mod) return
    if (input.key === '[') {
      mainWindow.webContents.send('kb:back')
      event.preventDefault()
    } else if (input.key === ']') {
      mainWindow.webContents.send('kb:forward')
      event.preventDefault()
    } else if (input.key === 'r' || input.key === 'R') {
      mainWindow.webContents.send('kb:reload')
      event.preventDefault()
    } else if (input.key === ',') {
      mainWindow.webContents.send('kb:settings')
      event.preventDefault()
    }
  })
}
