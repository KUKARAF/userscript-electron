const BASE = 'https://userscripts.osmosis.page/api'

export async function createTask(token, { tab_url, prompt, page_html }) {
  const res = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tab_url, prompt, page_html }),
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
