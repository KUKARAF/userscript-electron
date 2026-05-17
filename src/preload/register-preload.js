import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('registerAPI', {
  submit: (name, email) => ipcRenderer.invoke('register:submit', { name, email }),
  onApproved: (cb) => ipcRenderer.on('register:approved', cb),
  onError: (cb) => ipcRenderer.on('register:error', (_, msg) => cb(msg)),
})
