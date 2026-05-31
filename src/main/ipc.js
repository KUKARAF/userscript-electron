import { ipcMain, app } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import store from './store.js'
import {
  uploadHtmlChunk, createTask, pollStatus, approveTask, rejectTask, fetchAssignedScripts,
  fetchBrowsingSessions, createBrowsingSession, addSessionPage, updateSessionPage, removeSessionPage, reportError,
  refineScript,
} from './api.js'
import { loadToken, saveToken, callApi, callWithAutoReregister, ensureRegistered } from './registration.js'

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
    callApi(() => uploadHtmlChunk(loadToken(), data))
  )

  ipcMain.handle('api:create-task', (_, data) =>
    callApi(() => createTask(loadToken(), data))
  )

  ipcMain.handle('api:poll-status', (_, submission_token) => pollStatus(submission_token))

  ipcMain.handle('api:approve-task', (_, id) =>
    callApi(() => approveTask(loadToken(), id))
  )

  ipcMain.handle('api:reject-task', (_, id) =>
    callApi(() => rejectTask(loadToken(), id))
  )

  // --- Scripts sync ---

  ipcMain.handle('scripts:sync', async () => {
    const token = loadToken()
    if (!token) return []
    const scripts = await fetchAssignedScripts(token)
    store.set('scripts', scripts)
    return scripts
  })

  // --- Browsing Sessions / Pages ---

  ipcMain.handle('api:fetch-sessions', () =>
    callApi(() => fetchBrowsingSessions(loadToken()))
  )

  ipcMain.handle('api:create-session', () =>
    callApi(() => createBrowsingSession(loadToken(), 'Default'))
  )

  ipcMain.handle('api:add-page', (_, { sessionId, url }) =>
    callApi(() => addSessionPage(loadToken(), sessionId, url))
  )

  ipcMain.handle('api:update-page', (_, { sessionId, pageId, url }) =>
    callApi(() => updateSessionPage(loadToken(), sessionId, pageId, url))
  )

  ipcMain.handle('api:remove-page', (_, { sessionId, pageId }) =>
    callApi(() => removeSessionPage(loadToken(), sessionId, pageId))
  )

  ipcMain.handle('api:report-error', (_, { sessionId, url, pageHtml }) =>
    callApi(() => reportError(loadToken(), sessionId, url, pageHtml))
  )

  ipcMain.handle('api:refine-script', (_, { scriptId, ...payload }) =>
    callApi(() => refineScript(loadToken(), scriptId, payload))
  )

  ipcMain.handle('device:reregister', () => ensureRegistered(true))

  // --- Auto-Update ---

  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall())

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
