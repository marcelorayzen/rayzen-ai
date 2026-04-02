import { execSync } from 'child_process'

export async function clipboardRead(): Promise<{ content: string }> {
  const content = execSync('powershell -NoProfile -Command "Get-Clipboard"', {
    encoding: 'utf-8',
    timeout: 5000,
  }).trim()
  return { content }
}

export async function clipboardWrite(payload: { text: string }): Promise<{ written: boolean }> {
  // Escapa aspas simples para PowerShell
  const text = payload.text.replace(/'/g, "''")
  execSync(`powershell -NoProfile -Command "Set-Clipboard -Value '${text}'"`, {
    encoding: 'utf-8',
    timeout: 5000,
  })
  return { written: true }
}
