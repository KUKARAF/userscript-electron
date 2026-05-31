const api = window.electronAPI

let pages = []        // [{ id, session_id, url }] — sourced from server
let activePageId = null
const webviews = {}
const webviewsReady = new Set()
let webviewPreloadPath = ''

let scripts = []
let activeTasks = {}  // pageId → task object
let pollTimers = {}   // pageId → interval handle

// Track the first available session_id for adding new pages
let firstSessionId = null

// Script id of a matching installed script (enables refine mode in request panel)
let refinableScriptId = null

async function init() {
  const platform = await api.app.getPlatform()
  document.body.classList.add(`platform-${platform}`)

  webviewPreloadPath = await api.paths.webviewPreload()

  pages = await loadPagesFromServer()
  scripts = (await api.store.get('scripts')) || []

  // Listen for server script updates (background sync from main process)
  api.scripts.onUpdated((fresh) => {
    scripts = fresh
    renderScriptsList()
    updateRequestPanelForPage(activePageId)
    refreshPages()
  })

  // Listen for script sync failures (suppress 401 — app works from cache)
  api.scripts.onSyncFailed((err) => {
    if (err.includes('401') || err.includes('Token expired')) return
    showToast(`Script sync failed: ${err}`)
  })

  // Trigger script sync (loads from server, updates cache)
  api.scripts.sync().then((fresh) => {
    scripts = fresh
    renderScriptsList()
    updateRequestPanelForPage(activePageId)
    refreshPages()
  }).catch(() => {
    // Error syncing, but we have cached scripts from above
  })

  const version = await api.app.getVersion()
  document.getElementById('app-version').textContent = `v${version}`

  const savedToken = await api.token.load()
  if (savedToken) document.getElementById('input-api-token').value = savedToken

  // Resume polling for any in-progress tasks saved from last session
  const savedTasks = (await api.store.get('tasks')) || []
  for (const task of savedTasks) {
    if (!['done', 'failed', 'rejected'].includes(task.status) && pages.some((p) => p.id === task.page_id)) {
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
  for (const page of pages) {
    const btn = document.createElement('button')
    btn.className = 'tab' + (page.id === activePageId ? ' active' : '')
    btn.dataset.pageId = page.id
    btn.title = page.url
    try { btn.textContent = new URL(page.url).hostname } catch { btn.textContent = page.url }
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

  for (const page of pages) {
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

      wv.addEventListener('did-navigate', () => {
        updateNavButtons()
        if (page.id === activePageId) updateRequestPanelForPage(page.id)
      })
      wv.addEventListener('did-navigate-in-page', () => {
        updateNavButtons()
        if (page.id === activePageId) updateRequestPanelForPage(page.id)
      })

      wv.addEventListener('did-finish-load', () => {
        injectMatchingScripts(page.id, wv.getURL())
      })

      wv.addEventListener('did-fail-load', (e) => {
        // -3 = ERR_ABORTED (user navigated away), ignore those
        if (e.errorCode === -3) return
        autoReportError(page.id, e.validatedURL || page.url, e.errorDescription || `error ${e.errorCode}`)
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

  const addPageInput = document.getElementById('add-page-input')
  const btnAddPage = document.getElementById('btn-add-page')
  const btnConfirm = document.getElementById('btn-add-page-confirm')
  const btnCancel = document.getElementById('btn-add-page-cancel')

  const showAddForm = () => {
    addPageInput.style.display = ''
    btnConfirm.style.display = ''
    btnCancel.style.display = ''
    btnAddPage.style.display = 'none'
    addPageInput.value = ''
    addPageInput.focus()
  }

  const hideAddForm = () => {
    addPageInput.style.display = 'none'
    btnConfirm.style.display = 'none'
    btnCancel.style.display = 'none'
    btnAddPage.style.display = ''
  }

  const submitAddPage = async () => {
    const url = addPageInput.value.trim()
    if (!url) return
    hideAddForm()
    try {
      if (!firstSessionId) {
        const session = await api.sessions.create()
        firstSessionId = session.id
      }
      await api.sessions.addPage({ sessionId: firstSessionId, url })
      await refreshPages()
    } catch (err) {
      showToast(`Failed to add page: ${err.message}`)
    }
  }

  btnAddPage.addEventListener('click', showAddForm)
  btnConfirm.addEventListener('click', submitAddPage)
  btnCancel.addEventListener('click', hideAddForm)
  addPageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAddPage()
    if (e.key === 'Escape') hideAddForm()
  })

  document.getElementById('btn-check-scripts').addEventListener('click', async () => {
    const btn = document.getElementById('btn-check-scripts')
    btn.disabled = true
    btn.textContent = 'Checking…'
    try {
      scripts = await api.scripts.sync()
      renderScriptsList()
      showToast('Scripts updated')
    } catch (err) {
      showToast(`Failed to check for updates: ${err.message}`)
    } finally {
      btn.disabled = false
      btn.textContent = 'Check for Updates'
    }
  })

  document.getElementById('btn-reregister').addEventListener('click', () => {
    api.device.reregister()
  })
}

function renderPagesList() {
  const list = document.getElementById('pages-list')
  list.innerHTML = ''

  for (const page of pages) {
    const row = document.createElement('div')
    row.className = 'page-row'

    if (page.session_id) {
      const input = document.createElement('input')
      input.type = 'text'
      input.value = page.url
      input.className = 'page-input page-url'
      input.style.cssText = 'flex:1;font-size:0.85em;'

      const save = async () => {
        const newUrl = input.value.trim()
        if (!newUrl || newUrl === page.url) return
        try {
          await api.sessions.updatePage({ sessionId: page.session_id, pageId: page.id, url: newUrl })
          await refreshPages()
        } catch (err) {
          showToast(`Failed to update page: ${err.message}`)
          input.value = page.url
        }
      }
      input.addEventListener('blur', save)
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur() })

      const delBtn = document.createElement('button')
      delBtn.className = 'icon-btn delete-btn'
      delBtn.title = 'Remove'
      delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M1 1l9 9M10 1 1 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`
      delBtn.addEventListener('click', async () => {
        delBtn.disabled = true
        try {
          await api.sessions.removePage({ sessionId: page.session_id, pageId: page.id })
          await refreshPages()
        } catch (err) {
          showToast(`Failed to remove page: ${err.message}`)
          delBtn.disabled = false
        }
      })

      row.appendChild(input)
      row.appendChild(delBtn)
    } else {
      const urlSpan = document.createElement('span')
      urlSpan.className = 'page-input page-url'
      urlSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.85em;'
      urlSpan.title = page.url
      urlSpan.textContent = page.url
      row.appendChild(urlSpan)
    }

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
    const headers = parseScriptHeaders(script.script_code || '')
    const row = document.createElement('div')
    row.className = 'script-row'

    const info = document.createElement('div')
    info.className = 'script-info'

    const name = document.createElement('span')
    name.className = 'script-name'
    name.textContent = headers.name || script.name || 'Script'

    const pattern = document.createElement('span')
    pattern.className = 'script-pattern'
    pattern.textContent = (headers.match && headers.match[0]) || headers.url || '—'

    info.appendChild(name)
    info.appendChild(pattern)

    row.appendChild(info)
    list.appendChild(row)
  }
}


// Pages are server-managed; local mutations go through the API.

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

  document.getElementById('btn-new-script').addEventListener('click', () => {
    setRefineMode(null, null)
  })
}

// --- Error reporting panel ---

function wireIssuePanel() {
  const panel = document.getElementById('issue-panel')

  document.getElementById('btn-report-issue').addEventListener('click', () => {
    panel.classList.toggle('hidden')
    if (!panel.classList.contains('hidden')) {
      const page = pages.find((p) => p.id === activePageId)
      const urlEl = document.getElementById('issue-page-url')
      if (urlEl) urlEl.textContent = page?.url || '—'
      document.getElementById('issue-status').classList.add('hidden')
    }
  })

  document.getElementById('btn-close-issue').addEventListener('click', () => {
    panel.classList.add('hidden')
  })

  document.getElementById('btn-submit-issue').addEventListener('click', submitIssueReport)
}

async function submitIssueReport() {
  const page = pages.find((p) => p.id === activePageId)
  if (!page) {
    showToast('No active page to report')
    return
  }

  const wv = webviews[activePageId]
  const submitBtn = document.getElementById('btn-submit-issue')
  const statusDiv = document.getElementById('issue-status')
  submitBtn.disabled = true
  submitBtn.textContent = 'Sending…'

  try {
    const pageHtml = wv
      ? await wv.executeJavaScript('document.documentElement.outerHTML').catch(() => '<html><body>Could not capture HTML</body></html>')
      : '<html><body>Webview not available</body></html>'

    await api.sessions.reportError({
      sessionId: page.session_id,
      url: wv?.getURL() || page.url,
      pageHtml,
    })

    statusDiv.classList.remove('hidden', 'error')
    statusDiv.textContent = '✓ Error report sent'
    setTimeout(() => statusDiv.classList.add('hidden'), 3000)
    showToast('Error report sent')
  } catch (err) {
    statusDiv.classList.remove('hidden')
    statusDiv.classList.add('error')
    statusDiv.textContent = `Error: ${err.message}`
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Send Report'
  }
}

async function autoReportError(pageId, url, errorDescription) {
  const page = pages.find((p) => p.id === pageId)
  if (!page?.session_id) return
  const pageHtml = `<html><body><pre>Load error: ${errorDescription}\nURL: ${url}</pre></body></html>`
  try {
    await api.sessions.reportError({ sessionId: page.session_id, url, pageHtml })
    console.log('[error-report] auto-reported load failure for', url)
  } catch (err) {
    console.warn('[error-report] failed to auto-report:', err.message)
  }
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
  const wv = webviews[pageId]
  const page = pages.find((p) => p.id === pageId)
  const url = (wv && webviewsReady.has(pageId) ? wv.getURL() : null) || page?.url || ''
  document.getElementById('request-url-label').textContent = url
  renderTaskStatus(pageId)
  renderActiveScripts(url)
}

function setRefineMode(scriptId, scriptName) {
  refinableScriptId = scriptId
  const submitBtn = document.getElementById('btn-submit-request')
  const newScriptBtn = document.getElementById('btn-new-script')
  const refineCtx = document.getElementById('refine-context')
  const refineNameEl = document.getElementById('refine-script-name')
  if (scriptId) {
    submitBtn.textContent = 'Refine Script'
    newScriptBtn.style.display = ''
    refineCtx.style.display = ''
    if (refineNameEl) refineNameEl.textContent = scriptName || ''
  } else {
    submitBtn.textContent = 'Request Script'
    newScriptBtn.style.display = 'none'
    refineCtx.style.display = 'none'
  }
}

function renderActiveScripts(url) {
  const section = document.getElementById('active-scripts-section')
  const list = document.getElementById('active-scripts-list')
  list.innerHTML = ''

  const matching = scripts.filter((s) => {
    if (!s.script_code) return false
    const headers = parseScriptHeaders(s.script_code)
    return (headers.match || []).some((p) => globMatch(p, url))
  })

  if (matching.length === 0) {
    section.classList.add('hidden')
    setRefineMode(null, null)
    return
  }

  section.classList.remove('hidden')
  for (const s of matching) {
    const headers = parseScriptHeaders(s.script_code || '')
    const row = document.createElement('div')
    row.className = 'active-script-row'

    const dot = document.createElement('span')
    dot.className = 'active-script-dot'

    const name = document.createElement('span')
    name.className = 'active-script-name'
    name.textContent = headers.name || s.name || 'Script'

    row.appendChild(dot)
    row.appendChild(name)
    list.appendChild(row)
  }

  // Enable refine mode for the first matching script
  const first = matching[0]
  const firstHeaders = parseScriptHeaders(first.script_code || '')
  setRefineMode(first.id, firstHeaders.name || first.name || 'Script')
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

  const isRefine = !!refinableScriptId
  const scriptId = refinableScriptId

  const submitBtn = document.getElementById('btn-submit-request')
  submitBtn.disabled = true
  submitBtn.textContent = isRefine ? 'Refining…' : 'Requesting…'

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

    let task
    if (isRefine) {
      let payload
      if (page_html.length <= INLINE_LIMIT) {
        payload = { scriptId, prompt: promptText, page_html }
      } else {
        const total_chunks = Math.ceil(page_html.length / CHUNK_SIZE)
        let html_id = null
        for (let i = 0; i < total_chunks; i++) {
          const content = page_html.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
          const res = await api.api.uploadHtmlChunk({ html_id, chunk_index: i, total_chunks, content })
          html_id = res.html_id
        }
        payload = { scriptId, prompt: promptText, html_id }
      }
      task = await api.api.refineScript(payload)
    } else {
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
      task = await api.api.createTask(taskPayload)
    }

    activeTasks[pageId] = { ...task, page_id: pageId, prompt: promptText }
    await persistTasks()
    startPolling(pageId)
    renderTaskStatus(pageId)
    document.getElementById('input-prompt').value = ''
  } catch (err) {
    showToast(`Error: ${err.message}`)
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = isRefine ? 'Refine Script' : 'Request Script'
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
  showToast(`Script "${taskData.script_name}" ready`)
  // Sync scripts from server (newly generated script is now saved there)
  try {
    scripts = await api.scripts.sync()
    renderScriptsList()
  } catch (err) {
    console.error('Failed to sync scripts:', err)
  }
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

    block.appendChild(price)
    block.appendChild(rationale)
    area.appendChild(block)
  } else if (task.status === 'done') {
    const done = document.createElement('div')
    done.className = 'task-done-name'
    done.textContent = `Ready: ${task.script_name}`
    area.appendChild(done)

    const injectBtn = document.createElement('button')
    injectBtn.className = 'btn-inject'
    injectBtn.textContent = 'Inject Script'
    injectBtn.addEventListener('click', () => {
      injectMatchingScripts(pageId, webviews[pageId]?.getURL?.())
      showToast(`Injected "${task.script_name}"`)
      done.textContent = `Installed: ${task.script_name}`
      injectBtn.remove()
    })
    area.appendChild(injectBtn)
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
    if (!s.script_code) continue
    const headers = parseScriptHeaders(s.script_code)
    if ((headers.match || []).some(p => globMatch(p, url))) {
      matching.push({ name: headers.name || s.name || 'Script', code: s.script_code })
    }
  }
  if (matching.length) wv.send('inject-scripts', matching)
}

// --- Script header parsing ---

function parseScriptHeaders(code) {
  const result = {}
  const block = code.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/)
  if (!block) return result
  for (const line of block[1].split('\n')) {
    const m = line.match(/\/\/ @(\S+)\s+(.+)/)
    if (!m) continue
    const key = m[1]
    const val = m[2].trim()
    if (key === 'match') {
      if (!result.match) result.match = []
      result.match.push(val)
    } else {
      result[key] = val
    }
  }
  return result
}

function globMatch(pattern, url) {
  const parts = pattern.split('[')
  const escaped = parts.map((part, i) => {
    if (i === 0) {
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    }
    const close = part.indexOf(']')
    if (close === -1) {
      return '[' + part.replace(/\\/g, '\\\\')
    }
    const inside = part.slice(0, close).replace(/\\/g, '\\\\')
    const outside = part.slice(close + 1)
    return '[' + inside + ']' + (outside ? outside.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') : '')
  }).join('')
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

// --- Server-side pages ---

async function loadPagesFromServer() {
  try {
    const [sessions, cachedScripts] = await Promise.all([
      api.sessions.fetchAll().catch(() => []),
      api.store.get('scripts').then(s => s || []),
    ])

    const all = []
    const seenUrls = new Set()
    firstSessionId = sessions[0]?.id || null

    for (const session of sessions) {
      for (const page of session.pages) {
        all.push({ id: page.id, session_id: session.id, url: page.url })
        seenUrls.add(page.url)
      }
    }

    // Add pages derived from assigned scripts (@url header, falling back to script.url field)
    for (const script of cachedScripts) {
      const headers = parseScriptHeaders(script.script_code || '')
      const url = headers.url || script.url
      if (url && !seenUrls.has(url)) {
        all.push({ id: `script-${script.id}`, session_id: null, url })
        seenUrls.add(url)
      }
    }

    await api.store.set('cachedPages', all)
    return all
  } catch (err) {
    console.warn('Failed to load pages from server, using cache:', err.message)
    const cached = (await api.store.get('cachedPages')) || []
    firstSessionId = cached[0]?.session_id || null
    return cached
  }
}

async function refreshPages() {
  pages = await loadPagesFromServer()
  renderPagesList()
  renderTabs()
  renderWebviews()
  if (activePageId && !pages.find((p) => p.id === activePageId)) {
    activePageId = pages[0]?.id || null
  }
  if (activePageId) showPage(activePageId)
  else if (pages.length > 0) showPage(pages[0].id)
}

// --- Boot ---

init()
