const api = window.electronAPI

let pages = []
let activePageId = null
const webviews = {}
const webviewsReady = new Set()
let webviewPreloadPath = ''

let scripts = []
let activeTasks = {}  // pageId → task object
let pollTimers = {}   // pageId → interval handle

async function init() {
  const platform = await api.app.getPlatform()
  document.body.classList.add(`platform-${platform}`)

  webviewPreloadPath = await api.paths.webviewPreload()

  pages = (await api.store.get('pages')) || []
  scripts = (await api.store.get('scripts')) || []

  const version = await api.app.getVersion()
  document.getElementById('app-version').textContent = `v${version}`

  const savedToken = await api.token.load()
  if (savedToken) document.getElementById('input-api-token').value = savedToken

  // Resume polling for any in-progress tasks saved from last session
  const savedTasks = (await api.store.get('tasks')) || []
  for (const task of savedTasks) {
    if (!['done', 'failed', 'rejected'].includes(task.status)) {
      activeTasks[task.page_id] = task
      startPolling(task.page_id)
    }
  }

  renderWebviews()
  renderTabs()

  if (pages.length > 0) {
    showPage(pages[0].id)
  }

  wireNavButtons()
  wireKeyboard()
  wireSettingsPanel()
  wireRequestPanel()
  wireIssuePanel()
  wireUpdater()
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

  for (const [id, wv] of Object.entries(webviews)) {
    if (!pages.find((p) => p.id === id)) {
      wv.remove()
      delete webviews[id]
      webviewsReady.delete(id)
    }
  }

  for (const page of pages.filter((p) => p.enabled)) {
    if (!webviews[page.id]) {
      const wv = document.createElement('webview')
      wv.src = page.url
      wv.setAttribute('preload', `file://${webviewPreloadPath}`)

      wv.addEventListener('dom-ready', () => {
        webviewsReady.add(page.id)
        if (page.id === activePageId) {
          document.getElementById('page-title').textContent = wv.getTitle() || ''
          updateNavButtons()
        }
      })

      wv.addEventListener('page-title-updated', (e) => {
        if (page.id === activePageId) {
          document.getElementById('page-title').textContent = e.title
        }
      })

      wv.addEventListener('did-navigate', () => updateNavButtons())
      wv.addEventListener('did-navigate-in-page', () => updateNavButtons())

      wv.addEventListener('did-finish-load', () => {
        injectMatchingScripts(page.id, wv.getURL())
      })

      // Intercept new window attempts and redirect to same webview
      wv.addEventListener('new-window', (e) => {
        e.preventDefault()
        wv.src = e.url
      })

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

  for (const btn of document.querySelectorAll('.tab')) {
    btn.classList.toggle('active', btn.dataset.pageId === id)
  }

  const wv = webviews[id]
  if (wv && webviewsReady.has(id)) {
    document.getElementById('page-title').textContent = wv.getTitle() || ''
    updateNavButtons()
  }

  // Update request panel URL label and task status for the new active page
  updateRequestPanelForPage(id)
}

// --- Navigation ---

function updateNavButtons() {
  const wv = webviews[activePageId]
  if (!wv || !webviewsReady.has(activePageId)) return
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

function wireKeyboard() {
  api.keyboard.on('kb:back', () => webviews[activePageId]?.goBack())
  api.keyboard.on('kb:forward', () => webviews[activePageId]?.goForward())
  api.keyboard.on('kb:reload', () => webviews[activePageId]?.reload())
  api.keyboard.on('kb:settings', () => document.getElementById('btn-settings').click())
}

// --- Settings panel ---

function wireSettingsPanel() {
  const panel = document.getElementById('settings-panel')

  document.getElementById('btn-settings').addEventListener('click', () => {
    panel.classList.toggle('hidden')
    if (!panel.classList.contains('hidden')) {
      renderPagesList()
      renderScriptsList()
      syncRequestPanelPosition()
    } else {
      syncRequestPanelPosition()
    }
  })

  document.getElementById('btn-close-settings').addEventListener('click', () => {
    panel.classList.add('hidden')
    syncRequestPanelPosition()
  })

  document.getElementById('btn-save-token').addEventListener('click', async () => {
    const token = document.getElementById('input-api-token').value.trim()
    await api.token.save(token)
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
        webviewsReady.delete(page.id)
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

function renderScriptsList() {
  const list = document.getElementById('scripts-list')
  list.innerHTML = ''

  if (scripts.length === 0) {
    const hint = document.createElement('p')
    hint.className = 'settings-hint'
    hint.textContent = 'No scripts installed yet.'
    list.appendChild(hint)
    return
  }

  for (const script of scripts) {
    const row = document.createElement('div')
    row.className = 'script-row'

    const info = document.createElement('div')
    info.className = 'script-info'

    const name = document.createElement('span')
    name.className = 'script-name'
    name.textContent = script.name

    const pattern = document.createElement('span')
    pattern.className = 'script-pattern'
    pattern.textContent = script.match_pattern || '—'

    info.appendChild(name)
    info.appendChild(pattern)

    const delBtn = document.createElement('button')
    delBtn.className = 'icon-btn delete-btn'
    delBtn.title = 'Delete script'
    delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M1 1l9 9M10 1 1 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
    delBtn.addEventListener('click', async () => {
      await api.scripts.delete(script.name)
      scripts = (await api.store.get('scripts')) || []
      renderScriptsList()
    })

    row.appendChild(info)
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

// --- Request panel ---

function wireRequestPanel() {
  const panel = document.getElementById('request-panel')

  document.getElementById('btn-request-script').addEventListener('click', () => {
    panel.classList.toggle('hidden')
    if (!panel.classList.contains('hidden')) {
      updateRequestPanelForPage(activePageId)
    }
  })

  document.getElementById('btn-close-request').addEventListener('click', () => {
    panel.classList.add('hidden')
  })

  document.getElementById('btn-submit-request').addEventListener('click', () => {
    requestScript(activePageId)
  })
}

// --- Issue panel ---

function wireIssuePanel() {
  const panel = document.getElementById('issue-panel')

  document.getElementById('btn-report-issue').addEventListener('click', () => {
    panel.classList.toggle('hidden')
    if (!panel.classList.contains('hidden')) {
      clearIssueForm()
    }
  })

  document.getElementById('btn-close-issue').addEventListener('click', () => {
    panel.classList.add('hidden')
  })

  document.getElementById('btn-submit-issue').addEventListener('click', () => {
    submitIssueReport()
  })
}

async function submitIssueReport() {
  const title = document.getElementById('input-issue-title').value.trim()
  const description = document.getElementById('input-issue-description').value.trim()
  const userComment = document.getElementById('input-issue-comment').value.trim()

  if (!title) {
    showToast('Please enter an issue title')
    return
  }

  const submitBtn = document.getElementById('btn-submit-issue')
  const statusDiv = document.getElementById('issue-status')
  submitBtn.disabled = true
  submitBtn.textContent = 'Preparing…'

  try {
    const result = await api.issue.report({
      title,
      description,
      userComment,
    })

    statusDiv.classList.remove('hidden', 'error')
    statusDiv.textContent = '✓ Email client opened. Send to hi@osmosis.page'
    setTimeout(() => {
      statusDiv.classList.add('hidden')
    }, 4000)

    showToast('Send the encrypted file to hi@osmosis.page')
  } catch (err) {
    statusDiv.classList.remove('hidden')
    statusDiv.classList.add('error')
    statusDiv.textContent = `Error: ${err.message}`
    showToast('Failed to open email client')
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Send Report'
  }
}

function clearIssueForm() {
  document.getElementById('input-issue-title').value = ''
  document.getElementById('input-issue-description').value = ''
  document.getElementById('input-issue-comment').value = ''
  document.getElementById('issue-status').classList.add('hidden')
}

// --- Update banner ---

function wireUpdater() {
  const banner = document.getElementById('update-banner')
  const bannerText = document.getElementById('update-banner-text')
  const actionBtn = document.getElementById('btn-update-action')
  const dismissBtn = document.getElementById('btn-update-dismiss')

  let updateInfo = null
  let isDownloading = false

  api.updater.onAvailable((info) => {
    updateInfo = info
    bannerText.textContent = `Update available: v${info.version}`
    actionBtn.textContent = 'Download'
    actionBtn.onclick = downloadUpdate
    banner.classList.remove('hidden')
  })

  api.updater.onProgress((percent) => {
    if (isDownloading) {
      actionBtn.textContent = `Downloading… ${percent}%`
    }
  })

  api.updater.onReady(() => {
    bannerText.textContent = 'Update ready to install'
    actionBtn.textContent = 'Restart Now'
    actionBtn.onclick = installUpdate
  })

  async function downloadUpdate() {
    isDownloading = true
    actionBtn.disabled = true
    try {
      await api.updater.download()
    } catch (err) {
      console.error('Download failed:', err)
      actionBtn.disabled = false
      isDownloading = false
    }
  }

  async function installUpdate() {
    await api.updater.install()
  }

  dismissBtn.addEventListener('click', () => {
    banner.classList.add('hidden')
  })
}

function syncRequestPanelPosition() {
  const requestPanel = document.getElementById('request-panel')
  const settingsHidden = document.getElementById('settings-panel').classList.contains('hidden')
  requestPanel.classList.toggle('settings-closed', settingsHidden)
}

function updateRequestPanelForPage(pageId) {
  const page = pages.find((p) => p.id === pageId)
  document.getElementById('request-url-label').textContent = page?.url || ''
  renderTaskStatus(pageId)
}

async function requestScript(pageId) {
  const page = pages.find((p) => p.id === pageId)
  const wv = webviews[pageId]
  const promptText = document.getElementById('input-prompt').value.trim()
  if (!promptText) {
    showToast('Enter a prompt first')
    return
  }
  if (!wv) {
    showToast('No active page')
    return
  }

  const submitBtn = document.getElementById('btn-submit-request')
  submitBtn.disabled = true
  submitBtn.textContent = 'Requesting…'

  try {
    const page_html = await wv.executeJavaScript(`
      (() => {
        const doc = document.documentElement.cloneNode(true)
        for (const el of doc.querySelectorAll('script')) el.textContent = ''
        for (const el of doc.querySelectorAll('style')) el.textContent = ''
        return doc.outerHTML
      })()
    `)

    const CHUNK_SIZE = 500_000  // 500 KB per chunk
    const INLINE_LIMIT = 100_000  // send inline below this size

    let taskPayload
    if (page_html.length <= INLINE_LIMIT) {
      taskPayload = { tab_url: page.url, prompt: promptText, page_html }
    } else {
      const total_chunks = Math.ceil(page_html.length / CHUNK_SIZE)
      let html_id = null
      for (let i = 0; i < total_chunks; i++) {
        const content = page_html.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        const res = await api.api.uploadHtmlChunk({ html_id, chunk_index: i, total_chunks, content })
        html_id = res.html_id
      }
      taskPayload = { tab_url: page.url, prompt: promptText, html_id }
    }

    const task = await api.api.createTask(taskPayload)

    activeTasks[pageId] = { ...task, page_id: pageId, prompt: promptText }
    await persistTasks()
    startPolling(pageId)
    renderTaskStatus(pageId)
    document.getElementById('input-prompt').value = ''
  } catch (err) {
    showToast(`Error: ${err.message}`)
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Request Script'
  }
}

// --- Polling ---

function startPolling(pageId) {
  if (pollTimers[pageId]) return
  pollTimers[pageId] = setInterval(() => pollTask(pageId), 5000)
}

async function pollTask(pageId) {
  const task = activeTasks[pageId]
  if (!task) {
    clearInterval(pollTimers[pageId])
    delete pollTimers[pageId]
    return
  }

  try {
    const updated = await api.api.pollStatus(task.submission_token)
    activeTasks[pageId] = { ...task, ...updated }
    await persistTasks()
    renderTaskStatus(pageId)

    if (updated.status === 'done') {
      clearInterval(pollTimers[pageId])
      delete pollTimers[pageId]
      await handleTaskDone(pageId, updated)
    } else if (['failed', 'rejected'].includes(updated.status)) {
      clearInterval(pollTimers[pageId])
      delete pollTimers[pageId]
    }
  } catch (err) {
    // Network hiccup — keep polling
    console.warn('[poll] error:', err.message)
  }
}

async function persistTasks() {
  await api.store.set('tasks', Object.values(activeTasks))
}

async function handleTaskDone(pageId, taskData) {
  await api.scripts.save({
    name: taskData.script_name,
    code: taskData.script_code,
    match_pattern: taskData.match_pattern,
  })
  scripts = (await api.store.get('scripts')) || []
  showToast(`Script "${taskData.script_name}" installed`)
  injectMatchingScripts(pageId, webviews[pageId]?.getURL?.())
}

// --- Task status UI ---

function renderTaskStatus(pageId) {
  const area = document.getElementById('task-status-area')
  // Only update if the request panel is for the active page
  if (pageId !== activePageId) return

  const task = activeTasks[pageId]
  if (!task) {
    area.classList.add('hidden')
    area.innerHTML = ''
    return
  }

  area.classList.remove('hidden')
  area.innerHTML = ''

  const statusRow = document.createElement('div')
  statusRow.className = 'status-row'

  const badge = document.createElement('span')
  badge.className = `status-badge ${task.status}`
  const spinning = ['pending', 'estimating', 'processing'].includes(task.status)
  badge.innerHTML = spinning ? `<span class="spinner"></span> ${task.status}` : task.status
  statusRow.appendChild(badge)
  area.appendChild(statusRow)

  if (task.status === 'awaiting_approval') {
    const block = document.createElement('div')
    block.className = 'approval-block'

    const price = document.createElement('div')
    price.className = 'approval-price'
    price.textContent = `${(task.estimated_price_pln / 100).toFixed(2)} PLN`

    const rationale = document.createElement('div')
    rationale.className = 'approval-rationale'
    rationale.textContent = task.price_rationale || ''

    const actions = document.createElement('div')
    actions.className = 'approval-actions'

    const approveBtn = document.createElement('button')
    approveBtn.className = 'btn-approve'
    approveBtn.textContent = 'Approve'
    approveBtn.addEventListener('click', async () => {
      approveBtn.disabled = true
      try {
        await api.api.approveTask(task.id)
        activeTasks[pageId] = { ...activeTasks[pageId], status: 'processing' }
        await persistTasks()
        renderTaskStatus(pageId)
      } catch (err) {
        showToast(`Approve failed: ${err.message}`)
        approveBtn.disabled = false
      }
    })

    const rejectBtn = document.createElement('button')
    rejectBtn.className = 'btn-reject'
    rejectBtn.textContent = 'Reject'
    rejectBtn.addEventListener('click', async () => {
      rejectBtn.disabled = true
      try {
        await api.api.rejectTask(task.id)
        activeTasks[pageId] = { ...activeTasks[pageId], status: 'rejected' }
        clearInterval(pollTimers[pageId])
        delete pollTimers[pageId]
        await persistTasks()
        renderTaskStatus(pageId)
      } catch (err) {
        showToast(`Reject failed: ${err.message}`)
        rejectBtn.disabled = false
      }
    })

    actions.appendChild(approveBtn)
    actions.appendChild(rejectBtn)
    block.appendChild(price)
    block.appendChild(rationale)
    block.appendChild(actions)
    area.appendChild(block)
  } else if (task.status === 'done') {
    const done = document.createElement('div')
    done.className = 'task-done-name'
    done.textContent = `Installed: ${task.script_name}`
    area.appendChild(done)
  } else if (task.status === 'failed') {
    const err = document.createElement('div')
    err.className = 'task-error'
    err.textContent = task.error_message || 'Script generation failed.'
    area.appendChild(err)
  }
}

// --- Script injection ---

async function injectMatchingScripts(pageId, url) {
  if (!url) return
  if (!(await api.store.get('autoInjectScripts'))) return
  const wv = webviews[pageId]
  if (!wv || !webviewsReady.has(pageId)) return

  const matching = []
  for (const s of scripts) {
    if (s.match_pattern && globMatch(s.match_pattern, url)) {
      try {
        const code = await api.scripts.loadCode(s.name)
        matching.push({ name: s.name, code })
      } catch {
        // Script file missing — skip
      }
    }
  }
  if (matching.length) wv.send('inject-scripts', matching)
}

function globMatch(pattern, url) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(url)
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
