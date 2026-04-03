import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

function runPs(script: string): string {
  const file = join(tmpdir(), `rayzen-${Date.now()}.ps1`)
  writeFileSync(file, script, 'utf-8')
  try {
    return execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${file}"`, {
      encoding: 'utf-8',
      timeout: 15000,
    })
  } finally {
    try { unlinkSync(file) } catch { /* ignora */ }
  }
}

export interface EmailSummary {
  subject: string
  from: string
  receivedAt: string
  preview: string
  unread: boolean
}

export async function readEmails(payload: { limit?: number; folder?: string }): Promise<{ emails: EmailSummary[] }> {
  const limit = Math.min(payload.limit ?? 5, 20)

  const script = `
try {
  $outlook = New-Object -ComObject Outlook.Application
} catch {
  Write-Error "OUTLOOK_NOT_RUNNING: $_"
  exit 1
}
$ns = $outlook.GetNamespace("MAPI")
$folder = $ns.GetDefaultFolder(6)
$items = $folder.Items
$items.Sort("[ReceivedTime]", $true)
$count = 0
$results = @()
foreach ($item in $items) {
  if ($count -ge ${limit}) { break }
  $preview = ""
  try { $preview = $item.Body.Substring(0, [Math]::Min(150, $item.Body.Length)).Trim() } catch {}
  $results += [PSCustomObject]@{
    Subject    = $item.Subject
    From       = $item.SenderName
    ReceivedAt = $item.ReceivedTime.ToString("yyyy-MM-dd HH:mm")
    Preview    = $preview
    Unread     = $item.UnRead
  }
  $count++
}
if ($results.Count -eq 0) {
  Write-Output "[]"
} else {
  $results | ConvertTo-Json -Compress
}
`

  const output = runPs(script).trim()
  if (!output) throw new Error('Outlook não está aberto ou não respondeu. Abra o Outlook e tente novamente.')
  const raw = JSON.parse(output)
  const emails = (Array.isArray(raw) ? raw : [raw]).map((e: Record<string, unknown>) => ({
    subject: String(e['Subject'] ?? ''),
    from: String(e['From'] ?? ''),
    receivedAt: String(e['ReceivedAt'] ?? ''),
    preview: String(e['Preview'] ?? ''),
    unread: Boolean(e['Unread']),
  }))

  return { emails }
}

export async function sendEmail(payload: {
  to: string
  subject: string
  body: string
  dryRun?: boolean
}): Promise<{ sent: boolean; to: string; subject: string; dryRun: boolean }> {
  const { to, subject, body, dryRun = true } = payload

  if (!to.includes('@')) throw new Error(`Endereço inválido: ${to}`)
  if (!subject.trim()) throw new Error('Assunto obrigatório')
  if (!body.trim()) throw new Error('Corpo do email obrigatório')

  if (dryRun) {
    return { sent: false, to, subject, dryRun: true }
  }

  const script = `
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)
$mail.To = "${to}"
$mail.Subject = @'
${subject}
'@
$mail.Body = @'
${body}
'@
$mail.Send()
Write-Output "sent"
`

  runPs(script)
  return { sent: true, to, subject, dryRun: false }
}
