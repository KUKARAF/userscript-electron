import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'

function scriptsDir() {
  return join(app.getPath('userData'), 'scripts')
}

export async function saveScript({ name, code, match_pattern }) {
  const dir = scriptsDir()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${name}.js`), code, 'utf8')
  return { name, match_pattern }
}

export async function loadScriptCode(name) {
  return readFile(join(scriptsDir(), `${name}.js`), 'utf8')
}

export async function deleteScriptFile(name) {
  await unlink(join(scriptsDir(), `${name}.js`)).catch(() => {})
}
