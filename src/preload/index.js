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
    uploadHtmlChunk: (data) => ipcRenderer.invoke('api:upload-html-chunk', data),
    createTask: (data) => ipcRenderer.invoke('api:create-task', data),
    pollStatus: (token) => ipcRenderer.invoke('api:poll-status', token),
    approveTask: (id) => ipcRenderer.invoke('api:approve-task', id),
    rejectTask: (id) => ipcRenderer.invoke('api:reject-task', id),
  },
  token: {
    load: () => ipcRenderer.invoke('token:load'),
    save: (t) => ipcRenderer.invoke('token:save', t),
  },
  device: {
    reregister: () => ipcRenderer.invoke('device:reregister'),
  },
  scripts: {
    sync: () => ipcRenderer.invoke('scripts:sync'),
    onUpdated: (cb) => ipcRenderer.on('scripts:updated', (_, scripts) => cb(scripts)),
    onSyncFailed: (cb) => ipcRenderer.on('scripts:sync-failed', (_, err) => cb(err)),
  },
  keyboard: {
    on: (channel, cb) => {
      const allowed = ['kb:back', 'kb:forward', 'kb:reload', 'kb:settings']
      if (allowed.includes(channel)) ipcRenderer.on(channel, cb)
    },
  },
  sessions: {
    fetchAll: () => ipcRenderer.invoke('api:fetch-sessions'),
    create: () => ipcRenderer.invoke('api:create-session'),
    addPage: (data) => ipcRenderer.invoke('api:add-page', data),
    updatePage: (data) => ipcRenderer.invoke('api:update-page', data),
    removePage: (data) => ipcRenderer.invoke('api:remove-page', data),
    reportError: (data) => ipcRenderer.invoke('api:report-error', data),
  },
  updater: {
    onAvailable: (cb) => ipcRenderer.on('update:available', (_, info) => cb(info)),
    onProgress: (cb) => ipcRenderer.on('update:progress', (_, pct) => cb(pct)),
    onReady: (cb) => ipcRenderer.on('update:ready', () => cb()),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
  },
})
