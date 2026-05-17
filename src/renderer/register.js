import emojiData from 'unicode-emoji-json'

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
    document.getElementById('emoji-value').textContent = emoji
    document.getElementById('emoji-name').textContent = emojiData[emoji]?.name ?? ''
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
