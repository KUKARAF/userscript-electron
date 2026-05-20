# Change Requests — Device Registration

These changes implement the device registration flow so the Electron app can
authenticate with the egghead service using emoji confirmation instead of a
manually-entered API token.

## Server changes summary

- New endpoint `POST /api/devices/register` — no auth required, starts registration
- New endpoint `GET /api/devices/status/:id` — no auth required, polls for approval
- Token issued on approval uses prefix `device_` (not `egghead_`)
- Token is valid for 180 days
- Admin approves via web dashboard (Pending Devices tab + emoji confirmation modal)

---

## 1. `src/main/api.js` — add two new functions

```js
const BASE = 'https://userscripts.osmosis.page/api'

// Existing functions stay unchanged.

export async function registerDevice({ name, email }) {
  const res = await fetch(`${BASE}/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  })
  if (!res.ok) throw new Error(`registerDevice ${res.status}: ${await res.text()}`)
  return res.json() // { id: string, emoji: string }
}

export async function pollRegistrationStatus(id) {
  const res = await fetch(`${BASE}/devices/status/${id}`)
  if (!res.ok) throw new Error(`pollRegistrationStatus ${res.status}`)
  return res.json() // { status: 'pending'|'approved'|'rejected'|'expired', token?: string }
}
```

All existing calls (`createTask`, `uploadHtmlChunk`, etc.) continue to work
unchanged — just swap the token value stored in the store.

---

## 2. `src/main/store.js` — add `deviceRegistrationId`

```js
const store = new Store({
  schema: {
    // ... existing keys unchanged ...
    apiToken: { type: 'string', default: '' },
    deviceRegistrationId: { type: 'string', default: '' }, // ADD THIS
  },
})
```

---

## 3. `src/main/index.js` — registration flow on startup

On app startup, before showing the main window, check if a token is already
stored. If not, start the registration flow:

```js
import { registerDevice, pollRegistrationStatus } from './api.js'
import store from './store.js'

async function ensureRegistered() {
  if (store.get('apiToken')) return // already registered

  // Show a registration window/modal asking for name and email.
  // For now this can be a simple dialog or a dedicated BrowserWindow.
  const { name, email } = await promptRegistrationForm()

  const { id, emoji } = await registerDevice({ name, email })
  store.set('deviceRegistrationId', id)

  // Show the emoji to the user and start polling.
  showEmojiToUser(emoji)

  const token = await pollForToken(id)
  store.set('apiToken', token)
  store.set('deviceRegistrationId', '')
}

async function pollForToken(id, maxAttempts = 120, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs))
    const { status, token } = await pollRegistrationStatus(id)
    if (status === 'approved' && token) return token
    if (status === 'rejected' || status === 'expired') {
      throw new Error(`Registration ${status}. Please restart the app to try again.`)
    }
  }
  throw new Error('Approval timed out (10 minutes). Please restart and try again.')
}
```

### Re-registration on 401

Wrap existing API calls to detect token expiry:

```js
async function callWithAutoReregister(fn) {
  try {
    return await fn()
  } catch (err) {
    if (err.message.includes('401')) {
      store.set('apiToken', '')
      await ensureRegistered()
      return fn() // retry once
    }
    throw err
  }
}
```

---

## 4. UX — registration window

A minimal registration window needs:
- Text inputs for **Name** (e.g. "My Laptop") and **Email**
- A submit button
- After submit: display the emoji with instruction "Show this to your admin"
- A spinner/progress indicator while polling
- Error display for rejected/expired states with a "Try again" button

This can be implemented as a separate `BrowserWindow` or as an overlay in the
main `renderer/index.html`. The emoji display should be large and clearly
visible (font-size ~3rem).

---

## 5. Token storage note

`apiToken` is currently stored in `electron-store` (plain JSON on disk). The
`device_*` token is more sensitive than a browser extension token since it
grants full task creation access. Consider migrating to `safeStorage`:

```js
import { safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'

const tokenPath = path.join(app.getPath('userData'), 'device_token.enc')

function saveToken(token) {
  const enc = safeStorage.encryptString(token)
  fs.writeFileSync(tokenPath, enc)
}

function loadToken() {
  if (!fs.existsSync(tokenPath)) return ''
  return safeStorage.decryptString(fs.readFileSync(tokenPath))
}
```

`safeStorage` is built-in since Electron 15 and ties the encrypted value to
the OS user account (Keychain on macOS, DPAPI on Windows, libsecret on Linux).
This migration is optional but recommended before shipping to end users.
