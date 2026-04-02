import { execSync } from 'child_process'
import { resolve, join } from 'path'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? ''

const SAFE_ROOTS = [
  HOME + '\\Projects',
  'C:\\Projects',
  'D:\\Projects',
]

export type ProjectTemplate = 'blank' | 'node' | 'nextjs' | 'python'

const TEMPLATES: Record<ProjectTemplate, string[]> = {
  blank: [],
  node: ['src', 'tests'],
  nextjs: ['app', 'components', 'public'],
  python: ['src', 'tests', 'data'],
}

export async function createProjectFolder(payload: {
  name: string
  root?: string
  template?: ProjectTemplate
  openVscode?: boolean
  dryRun?: boolean
}): Promise<{
  path: string
  created: boolean
  dryRun: boolean
  openedVscode: boolean
}> {
  const root = payload.root ?? (HOME + '\\Projects')
  const resolved = resolve(root)

  const allowed = SAFE_ROOTS.some((r) => resolved.startsWith(r))
  if (!allowed) {
    throw new Error(`Pasta raiz não permitida: ${resolved}`)
  }

  // Sanitiza nome do projeto
  const name = payload.name.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim()
  if (!name) throw new Error('Nome do projeto inválido')

  const projectPath = join(resolved, name)

  if (payload.dryRun) {
    return { path: projectPath, created: false, dryRun: true, openedVscode: false }
  }

  if (existsSync(projectPath)) {
    throw new Error(`Projeto já existe: ${projectPath}`)
  }

  // Cria pasta raiz
  await mkdir(projectPath, { recursive: true })

  // Cria subpastas do template
  const template = payload.template ?? 'blank'
  const subfolders = TEMPLATES[template] ?? []
  for (const sub of subfolders) {
    await mkdir(join(projectPath, sub), { recursive: true })
  }

  // Cria README.md básico
  await writeFile(
    join(projectPath, 'README.md'),
    `# ${name}\n\nProjeto criado via Rayzen AI.\n`,
  )

  // Abre no VS Code se solicitado
  let openedVscode = false
  if (payload.openVscode !== false) {
    try {
      execSync(`code "${projectPath}"`, { stdio: 'ignore' })
      openedVscode = true
    } catch { /* VS Code não instalado ou não no PATH */ }
  }

  return { path: projectPath, created: true, dryRun: false, openedVscode }
}
