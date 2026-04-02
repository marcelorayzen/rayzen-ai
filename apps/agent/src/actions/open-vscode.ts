import { execSync } from 'child_process'
import { resolve } from 'path'
import { existsSync } from 'fs'

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? ''

const SAFE_ROOTS = [
  HOME + '\\Projects',
  HOME + '\\Desktop',
  HOME + '\\Documents',
  HOME + '\\OneDrive\\Área de Trabalho',
  'C:\\Projects',
  'D:\\Projects',
]

export async function openVscode(payload: { path?: string }): Promise<{ opened: string }> {
  if (!payload.path) {
    execSync('code', { stdio: 'ignore' })
    return { opened: '(novo)' }
  }

  const resolved = resolve(payload.path)

  const allowed = SAFE_ROOTS.some((r) => resolved.startsWith(r))
  if (!allowed) {
    throw new Error(`Caminho não permitido: ${resolved}`)
  }

  if (!existsSync(resolved)) {
    throw new Error(`Pasta não encontrada: ${resolved}`)
  }

  execSync(`code "${resolved}"`, { stdio: 'ignore' })
  return { opened: resolved }
}
