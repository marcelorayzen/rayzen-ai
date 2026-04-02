import { readdir, stat } from 'fs/promises'
import { join, resolve } from 'path'

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? ''
const SAFE_PATHS = [
  HOME + '\\Downloads',
  HOME + '\\Documents',
  HOME + '\\Desktop',
  HOME + '\\Projects',
  HOME + '/Downloads',
  HOME + '/Documents',
  HOME + '/Desktop',
  HOME + '/Projects',
]

export async function listDir(payload: { path: string }) {
  const resolved = resolve(payload.path)
  if (!SAFE_PATHS.some((p) => resolved.startsWith(p))) {
    throw new Error(`Diretorio nao permitido: ${resolved}`)
  }
  const entries = await readdir(resolved)
  const details = await Promise.all(
    entries.map(async (name) => {
      const s = await stat(join(resolved, name))
      return { name, isDir: s.isDirectory(), size: s.size, modified: s.mtime }
    }),
  )
  return { path: resolved, entries: details }
}
