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

// Intercept window.open() calls to keep navigation in the same webview
if (window.opener === null) {
  const originalOpen = window.open
  window.open = function(url, target, features) {
    if (url) {
      window.location.href = url
      return window
    }
    return originalOpen.call(window, url, target, features)
  }

  // Also intercept target="_blank" links
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a')
    if (link && link.target === '_blank') {
      const href = link.getAttribute('href')
      if (href && !href.startsWith('mailto:')) {
        e.preventDefault()
        window.location.href = href
      }
    }
  }, true)
}
