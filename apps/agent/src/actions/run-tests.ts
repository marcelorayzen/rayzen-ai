import { execSync } from 'child_process'
import { resolve } from 'path'

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? ''
const SAFE_ROOTS = [HOME + '\\Projects', 'C:\\Projects', 'D:\\Projects']

export type TestRunner = 'jest' | 'vitest' | 'playwright'

export interface TestRunResult {
  runner: TestRunner
  passed: number
  failed: number
  skipped: number
  total: number
  coverage?: CoverageResult
  failures: FailureInfo[]
  duration: string
  rawOutput: string
}

export interface CoverageResult {
  statements: number
  branches: number
  functions: number
  lines: number
}

export interface FailureInfo {
  test: string
  error: string
}

function parseJestOutput(output: string): Omit<TestRunResult, 'runner' | 'rawOutput'> {
  const passedMatch = output.match(/(\d+)\s+passed/)
  const failedMatch = output.match(/(\d+)\s+failed/)
  const skippedMatch = output.match(/(\d+)\s+skipped/)
  const durationMatch = output.match(/Time:\s+([\d.]+\s*\w+)/)

  const passed = passedMatch ? parseInt(passedMatch[1]) : 0
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0
  const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0

  // Parse failures: linhas com FAIL ou ● <test name>
  const failures: FailureInfo[] = []
  const failBlocks = output.split(/\n●\s+/)
  for (const block of failBlocks.slice(1)) {
    const lines = block.split('\n')
    const testName = lines[0]?.trim() ?? ''
    const error = lines.slice(1, 4).join(' ').trim()
    if (testName) failures.push({ test: testName, error })
  }

  // Parse coverage
  let coverage: CoverageResult | undefined
  const covMatch = output.match(/All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/)
  if (covMatch) {
    coverage = {
      statements: parseFloat(covMatch[1]),
      branches: parseFloat(covMatch[2]),
      functions: parseFloat(covMatch[3]),
      lines: parseFloat(covMatch[4]),
    }
  }

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    coverage,
    failures,
    duration: durationMatch ? durationMatch[1] : 'n/a',
  }
}

function parsePlaywrightOutput(output: string): Omit<TestRunResult, 'runner' | 'rawOutput'> {
  const passedMatch = output.match(/(\d+)\s+passed/)
  const failedMatch = output.match(/(\d+)\s+failed/)
  const skippedMatch = output.match(/(\d+)\s+skipped/)
  const durationMatch = output.match(/(\d+(?:\.\d+)?s)/)

  const passed = passedMatch ? parseInt(passedMatch[1]) : 0
  const failed = failedMatch ? parseInt(failedMatch[1]) : 0
  const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0

  const failures: FailureInfo[] = []
  const lines = output.split('\n')
  for (const line of lines) {
    const m = line.match(/\s+\d+\)\s+(.+)/)
    if (m) failures.push({ test: m[1].trim(), error: '' })
  }

  return {
    passed,
    failed,
    skipped,
    total: passed + failed + skipped,
    failures,
    duration: durationMatch ? durationMatch[1] : 'n/a',
  }
}

export async function runTests(payload: {
  projectPath?: string
  runner?: TestRunner
  coverage?: boolean
  filter?: string
}): Promise<TestRunResult> {
  const projectPath = payload.projectPath ?? 'C:\\Projects\\rayzen-ai'
  const resolved = resolve(projectPath)

  if (!SAFE_ROOTS.some((r) => resolved.startsWith(r))) {
    throw new Error(`Caminho não permitido: ${resolved}`)
  }

  const runner: TestRunner = payload.runner ?? 'jest'
  const withCoverage = payload.coverage ?? false
  const filter = payload.filter

  let cmd: string
  if (runner === 'playwright') {
    cmd = filter
      ? `npx playwright test --grep "${filter}"`
      : 'npx playwright test'
  } else if (runner === 'vitest') {
    cmd = withCoverage
      ? 'pnpm vitest run --coverage'
      : filter
      ? `pnpm vitest run --reporter=verbose -t "${filter}"`
      : 'pnpm vitest run'
  } else {
    cmd = withCoverage
      ? 'pnpm test:cov --forceExit'
      : filter
      ? `pnpm test --testNamePattern="${filter}" --forceExit`
      : 'pnpm test --forceExit'
  }

  let rawOutput = ''
  try {
    rawOutput = execSync(cmd, {
      cwd: resolved,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err: unknown) {
    // Jest/Vitest sai com código != 0 quando há falhas — capturamos o output assim mesmo
    const execErr = err as { stdout?: string; stderr?: string }
    rawOutput = (execErr.stdout ?? '') + (execErr.stderr ?? '')
    if (!rawOutput) throw new Error(`Falha ao executar testes: ${(err as Error).message}`)
  }

  const parsed = runner === 'playwright'
    ? parsePlaywrightOutput(rawOutput)
    : parseJestOutput(rawOutput)

  return {
    runner,
    ...parsed,
    rawOutput: rawOutput.slice(0, 3000),
  }
}
