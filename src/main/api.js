import fetch from 'node-fetch'

const BASE = 'https://userscripts.osmosis.page/api'

export async function uploadHtmlChunk(token, { html_id, chunk_index, total_chunks, content }) {
  const body = { chunk_index, total_chunks, content }
  if (html_id) body.html_id = html_id
  const res = await fetch(`${BASE}/html-chunks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`uploadHtmlChunk ${res.status}: ${await res.text()}`)
  return res.json() // { html_id, received, complete }
}

export async function createTask(token, payload) {
  // payload: { tab_url, prompt, page_html? } or { tab_url, prompt, html_id? }
  const res = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`createTask ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function pollStatus(submission_token) {
  const res = await fetch(`${BASE}/tasks/status/${submission_token}`)
  if (!res.ok) throw new Error(`pollStatus ${res.status}`)
  return res.json()
}

export async function approveTask(token, id) {
  const res = await fetch(`${BASE}/me/tasks/${id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`approveTask ${res.status}`)
}

export async function rejectTask(token, id) {
  const res = await fetch(`${BASE}/me/tasks/${id}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`rejectTask ${res.status}`)
}

export async function registerDevice({ name, email }) {
  try {
    const res = await fetch(`${BASE}/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    })
    if (!res.ok) throw new Error(`registerDevice ${res.status}: ${await res.text()}`)
    return res.json() // { id, emoji }
  } catch (err) {
    if (err.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to registration service. Please check your internet connection.')
    }
    throw err
  }
}

export async function pollRegistrationStatus(id) {
  const res = await fetch(`${BASE}/devices/status/${id}`)
  if (!res.ok) throw new Error(`pollRegistrationStatus ${res.status}`)
  return res.json() // { status: 'pending'|'approved'|'rejected'|'expired', token? }
}

export async function fetchAssignedScripts(token) {
  const res = await fetch(`${BASE}/me/scripts`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`fetchAssignedScripts ${res.status}`)
  return res.json()
}

export async function fetchBrowsingSessions(token) {
  const res = await fetch(`${BASE}/me/browsing-sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`fetchBrowsingSessions ${res.status}`)
  return res.json()
}

export async function createBrowsingSession(token, name) {
  const res = await fetch(`${BASE}/me/browsing-sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`createBrowsingSession ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function addSessionPage(token, sessionId, url) {
  const res = await fetch(`${BASE}/me/browsing-sessions/${sessionId}/pages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error(`addSessionPage ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function removeSessionPage(token, sessionId, pageId) {
  const res = await fetch(`${BASE}/me/browsing-sessions/${sessionId}/pages/${pageId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`removeSessionPage ${res.status}`)
}

export async function reportError(token, sessionId, url, pageHtml) {
  const res = await fetch(`${BASE}/sessions/${sessionId}/errors`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, page_html: pageHtml }),
  })
  if (!res.ok) throw new Error(`reportError ${res.status}`)
}
