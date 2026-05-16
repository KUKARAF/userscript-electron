const api = window.electronAPI

let pages = []
let activePageId = null
const webviews = {}
let webviewPreloadPath = ''

async function init() {
  const platform = await api.app.getPlatform()
  document.body.classList.add(`platform-${platform}`)

  webviewPreloadPath = await api.paths.webviewPreload()

  pages = (await api.store.get('pages')) || []
  const version = await api.app.getVersion()
  document.getElementById('app-version').textContent = `v${version}`

  const savedToken = await api.store.get('apiToken')
  if (savedToken) document.getElementById('input-api-token').value = savedToken

  renderWebviews()
  renderTabs()

  if (pages.length > 0) {
    showPage(pages[0].id)
  }

  wireNavButtons()
  wireSettingsPanel()
}

// --- Tabs ---

function renderTabs() {
  const strip = document.getElementById('tab-strip')
  strip.innerHTML = ''
  for (const page of pages.filter((p) => p.enabled)) {
    const btn = document.createElement('button')
    btn.className = 'tab' + (page.id === activePageId ? ' active' : '')
    btn.dataset.pageId = page.id
    btn.title = page.url
    btn.textContent = page.name || page.url
    btn.addEventListener('click', () => showPage(page.id))
    strip.appendChild(btn)
  }
}

// --- Webviews ---

function renderWebviews() {
  const container = document.getElementById('webview-container')

  // Remove webviews for pages no longer in list
  for (const [id, wv] of Object.entries(webviews)) {
    if (!pages.find((p) => p.id === id)) {
      wv.remove()
      delete webviews[id]
    }
  }

  // Add webviews for new pages
  for (const page of pages.filter((p) => p.enabled)) {
    if (!webviews[page.id]) {
      const wv = document.createElement('webview')
      wv.src = page.url
      wv.setAttribute('preload', `file://${webviewPreloadPath}`)
      wv.setAttribute('allowpopups', '')

      wv.addEventListener('page-title-updated', (e) => {
        if (page.id === activePageId) {
          document.getElementById('page-title').textContent = e.title
        }
      })

      wv.addEventListener('did-navigate', () => updateNavButtons())
      wv.addEventListener('did-navigate-in-page', () => updateNavButtons())

      container.appendChild(wv)
      webviews[page.id] = wv
    }
  }
}

function showPage(id) {
  activePageId = id

  for (const [pageId, wv] of Object.entries(webviews)) {
    wv.classList.toggle('active', pageId === id)
  }

  // Update active tab
  for (const btn of document.querySelectorAll('.tab')) {
    btn.classList.toggle('active', btn.dataset.pageId === id)
  }

  // Update title
  const wv = webviews[id]
  if (wv) {
    document.getElementById('page-title').textContent = wv.getTitle() || ''
    updateNavButtons()
  }
}

// --- Navigation ---

function updateNavButtons() {
  const wv = webviews[activePageId]
  if (!wv) return
  document.getElementById('btn-back').disabled = !wv.canGoBack()
  document.getElementById('btn-forward').disabled = !wv.canGoForward()
}

function wireNavButtons() {
  document.getElementById('btn-back').addEventListener('click', () => {
    webviews[activePageId]?.goBack()
  })
  document.getElementById('btn-forward').addEventListener('click', () => {
    webviews[activePageId]?.goForward()
  })
  document.getElementById('btn-reload').addEventListener('click', () => {
    webviews[activePageId]?.reload()
  })
}

// --- Settings panel ---

function wireSettingsPanel() {
  const panel = document.getElementById('settings-panel')

  document.getElementById('btn-settings').addEventListener('click', () => {
    panel.classList.toggle('hidden')
    if (!panel.classList.contains('hidden')) {
      renderPagesList()
    }
  })

  document.getElementById('btn-close-settings').addEventListener('click', () => {
    panel.classList.add('hidden')
  })

  document.getElementById('btn-save-token').addEventListener('click', async () => {
    const token = document.getElementById('input-api-token').value.trim()
    await api.store.set('apiToken', token)
    showToast('API token saved')
  })

  document.getElementById('btn-add-page').addEventListener('click', () => {
    pages.push({
      id: Date.now().toString(),
      name: '',
      url: '',
      enabled: true,
    })
    renderPagesList()
  })
}

function renderPagesList() {
  const list = document.getElementById('pages-list')
  list.innerHTML = ''

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const row = document.createElement('div')
    row.className = 'page-row'

    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.placeholder = 'Name'
    nameInput.value = page.name
    nameInput.className = 'page-input page-name'
    nameInput.addEventListener('input', () => {
      pages[i].name = nameInput.value
      savePages()
    })

    const urlInput = document.createElement('input')
    urlInput.type = 'url'
    urlInput.placeholder = 'https://...'
    urlInput.value = page.url
    urlInput.className = 'page-input page-url'
    urlInput.addEventListener('change', () => {
      pages[i].url = urlInput.value
      savePages()
      rebuildWebview(page.id, urlInput.value)
    })

    const delBtn = document.createElement('button')
    delBtn.className = 'icon-btn delete-btn'
    delBtn.title = 'Remove'
    delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M1 1l9 9M10 1 1 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
    delBtn.addEventListener('click', () => {
      if (webviews[page.id]) {
        webviews[page.id].remove()
        delete webviews[page.id]
      }
      pages.splice(i, 1)
      if (activePageId === page.id) {
        activePageId = pages[0]?.id || null
      }
      savePages()
      renderPagesList()
      renderTabs()
      if (activePageId) showPage(activePageId)
    })

    row.appendChild(nameInput)
    row.appendChild(urlInput)
    row.appendChild(delBtn)
    list.appendChild(row)
  }
}

function rebuildWebview(id, url) {
  if (webviews[id]) {
    webviews[id].src = url
  }
}

async function savePages() {
  await api.store.set('pages', pages)
  renderTabs()
  renderWebviews()
}

// --- Toast ---

function showToast(message) {
  const existing = document.querySelector('.toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  document.body.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('visible'))
  setTimeout(() => {
    toast.classList.remove('visible')
    setTimeout(() => toast.remove(), 300)
  }, 2000)
}

// --- Boot ---

init()
