import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  },
  paths: {
    webviewPreload: () => ipcRenderer.invoke('paths:webview-preload'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  api: {
    createTask: (data) => ipcRenderer.invoke('api:create-task', data),
    pollStatus: (token) => ipcRenderer.invoke('api:poll-status', token),
    approveTask: (id) => ipcRenderer.invoke('api:approve-task', id),
    rejectTask: (id) => ipcRenderer.invoke('api:reject-task', id),
  },
  scripts: {
    save: (script) => ipcRenderer.invoke('scripts:save', script),
    loadCode: (name) => ipcRenderer.invoke('scripts:load-code', name),
    delete: (name) => ipcRenderer.invoke('scripts:delete', name),
  },
  keyboard: {
    on: (channel, cb) => {
      const allowed = ['kb:back', 'kb:forward', 'kb:reload', 'kb:settings']
      if (allowed.includes(channel)) ipcRenderer.on(channel, cb)
    },
  },
})
