import { readdir, mkdir, rename, stat } from 'fs/promises'
import { join, extname, resolve } from 'path'

const EXT_MAP: Record<string, string> = {
  '.pdf': 'PDFs', '.doc': 'Docs', '.docx': 'Docs', '.txt': 'Docs',
  '.jpg': 'Imagens', '.jpeg': 'Imagens', '.png': 'Imagens',
  '.mp4': 'Videos', '.mov': 'Videos',
  '.zip': 'Arquivos', '.rar': 'Arquivos',
  '.exe': 'Instaladores', '.dmg': 'Instaladores',
}

export async function organizeDownloads(payload: { path: string; dryRun?: boolean }) {
  const dir = resolve(payload.path)
  const entries = await readdir(dir)
  const moves: Array<{ from: string; to: string }> = []
  for (const name of entries) {
    const filePath = join(dir, name)
    const s = await stat(filePath)
    if (s.isDirectory()) continue
    const folder = EXT_MAP[extname(name).toLowerCase()] ?? 'Outros'
    const destPath = join(dir, folder, name)
    if (!payload.dryRun) {
      await mkdir(join(dir, folder), { recursive: true })
      await rename(filePath, destPath)
    }
    moves.push({ from: filePath, to: destPath })
  }
  return { dryRun: payload.dryRun ?? false, moved: moves.length, moves }
}
