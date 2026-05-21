import { ipcMain, app } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import store from './store.js'
import { uploadHtmlChunk, createTask, pollStatus, approveTask, rejectTask, fetchAssignedScripts } from './api.js'
import { loadToken, saveToken, callWithAutoReregister } from './registration.js'
import { reportIssue } from './issue-reporter.js'

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

  // --- Scripts sync ---

  ipcMain.handle('scripts:sync', async () => {
    const token = loadToken()
    if (!token) return []
    const scripts = await fetchAssignedScripts(token)
    store.set('scripts', scripts)
    return scripts
  })

  // --- Issue Reporting ---

  ipcMain.handle('issue:report', (_, issueData) =>
    reportIssue({
      ...issueData,
      version: app.getVersion(),
      platform: process.platform,
    })
  )

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
