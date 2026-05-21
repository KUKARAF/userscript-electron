import { spawn } from 'child_process'
import { app, shell } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'

function encryptWithGPG(data) {
  return new Promise((resolve, reject) => {
    const gpg = spawn('gpg', ['--armor', '--encrypt', '--trust-model', 'always', '-r', 'hi@osmosis.page'])
    let encrypted = ''
    let error = ''

    gpg.stdout.on('data', (data) => {
      encrypted += data
    })

    gpg.stderr.on('data', (data) => {
      error += data
    })

    gpg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`GPG encryption failed: ${error}`))
      } else {
        resolve(encrypted)
      }
    })

    gpg.stdin.write(data)
    gpg.stdin.end()
  })
}

export async function reportIssue(issueData) {
  const {
    title = 'Unknown Issue',
    description = '',
    userComment = '',
    version = '',
    platform = '',
  } = issueData

  const timestamp = new Date().toISOString()

  const report = {
    timestamp,
    type: 'issue_report',
    app: {
      version,
      platform,
    },
    issue: {
      title,
      description,
      userComment,
    },
  }

  const reportJson = JSON.stringify(report, null, 2)

  // Encrypt with GPG
  let encrypted
  try {
    encrypted = await encryptWithGPG(reportJson)
  } catch (err) {
    console.error('Encryption failed:', err)
    throw err
  }

  // Save encrypted file to temp directory
  const tempDir = path.join(app.getPath('temp'), 'userscript-browser-issues')
  try {
    mkdirSync(tempDir, { recursive: true })
  } catch (err) {
    console.error('Failed to create temp directory:', err)
    throw err
  }

  const filename = `issue-${Date.now()}.asc`
  const filepath = path.join(tempDir, filename)

  try {
    writeFileSync(filepath, encrypted)
    console.log(`Issue report saved to: ${filepath}`)
  } catch (err) {
    console.error('Failed to save issue report:', err)
    throw err
  }

  // Open with default email client (or associated app for .asc files)
  try {
    await shell.openPath(filepath)
    console.log(`Opened issue file with default app`)
  } catch (err) {
    console.error('Failed to open file with default app:', err)
    throw new Error('Could not open email client. Please send the encrypted file manually.')
  }

  return {
    success: true,
    filepath,
    message: 'Encrypted issue report opened in your default email client. Please send it to hi@osmosis.page',
  }
}
