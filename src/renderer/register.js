const BASE = 'https://userscripts.osmosis.page/api'

const { submit, onApproved, onError } = window.registerAPI

// Fetch the server's own emoji pool so names match exactly what the admin sees
const emojiNamesPromise = fetch(`${BASE}/devices/emojis`)
  .then(r => r.json())
  .then(pool => Object.fromEntries(pool.map(({ e, n }) => [e, n])))
  .catch(() => ({}))

function show(stateId) {
  for (const el of document.querySelectorAll('[id^="state-"]')) el.classList.add('hidden')
  document.getElementById(stateId).classList.remove('hidden')
}

document.getElementById('btn-submit').addEventListener('click', async () => {
  const name = document.getElementById('input-name').value.trim()
  const email = document.getElementById('input-email').value.trim()
  const errEl = document.getElementById('form-error')
  errEl.classList.add('hidden')

  if (!name || !email) {
    errEl.textContent = 'Both fields are required.'
    errEl.classList.remove('hidden')
    return
  }

  document.getElementById('btn-submit').disabled = true
  try {
    const [emoji, emojiNames] = await Promise.all([submit(name, email), emojiNamesPromise])
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const chars = [...segmenter.segment(emoji)].map(s => s.segment)
    const list = document.getElementById('emoji-list')
    list.innerHTML = ''
    for (const char of chars) {
      const emojiSpan = document.createElement('span')
      emojiSpan.className = 'emoji'
      emojiSpan.textContent = char
      const nameSpan = document.createElement('span')
      nameSpan.className = 'emoji-name'
      nameSpan.textContent = emojiNames[char] ?? ''
      const item = document.createElement('div')
      item.className = 'emoji-item'
      item.appendChild(emojiSpan)
      item.appendChild(nameSpan)
      list.appendChild(item)
    }
    show('state-waiting')
  } catch (e) {
    document.getElementById('btn-submit').disabled = false
    errEl.textContent = e.message || 'Failed to start registration. Please try again.'
    errEl.classList.remove('hidden')
  }
})

onApproved(() => show('state-approved'))

onError((msg) => {
  document.getElementById('error-message').textContent = msg
  show('state-error')
})

document.getElementById('btn-retry').addEventListener('click', () => window.close())
