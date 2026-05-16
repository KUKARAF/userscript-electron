import { ipcRenderer } from 'electron'

ipcRenderer.on('inject-scripts', (_, scripts) => {
  for (const script of scripts) {
    try {
      const el = document.createElement('script')
      el.textContent = script.code
      document.documentElement.appendChild(el)
      el.remove()
    } catch (err) {
      console.error(`[userscript] Failed to inject ${script.name}:`, err)
    }
  }
})
