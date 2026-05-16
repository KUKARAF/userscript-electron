import { ipcMain, app } from 'electron'
import { join } from 'path'
import store from './store.js'

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
}
