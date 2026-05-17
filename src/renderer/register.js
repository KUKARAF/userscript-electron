import emojiDatasource from 'emoji-datasource'

const SKIN = {
  '1F3FB': 'light skin tone',
  '1F3FC': 'medium-light skin tone',
  '1F3FD': 'medium skin tone',
  '1F3FE': 'medium-dark skin tone',
  '1F3FF': 'dark skin tone',
}

const toChar = unified => unified.split('-').map(cp => String.fromCodePoint(parseInt(cp, 16))).join('')

const emojiNames = {}
for (const e of emojiDatasource) {
  const baseName = e.name.toLowerCase()
  emojiNames[toChar(e.unified)] = baseName
  if (e.non_qualified) emojiNames[toChar(e.non_qualified)] = baseName
  if (e.skin_variations) {
    for (const [tone, v] of Object.entries(e.skin_variations)) {
      emojiNames[toChar(v.unified)] = `${baseName}: ${SKIN[tone] ?? ''}`
    }
  }
}

const { submit, onApproved, onError } = window.registerAPI

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
    const emoji = await submit(name, email)
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const chars = [...segmenter.segment(emoji)].map(s => s.segment)
    const list = document.getElementById('emoji-list')
    list.innerHTML = ''
    for (const char of chars) {
      const item = document.createElement('div')
      item.className = 'emoji-item'
      item.innerHTML = `<span class="emoji">${char}</span><span class="emoji-name">${emojiNames[char] ?? ''}</span>`
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
