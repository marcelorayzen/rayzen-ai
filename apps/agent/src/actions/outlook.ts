import { execSync } from 'child_process'

export interface EmailSummary {
  subject: string
  from: string
  receivedAt: string
  preview: string
  unread: boolean
}

export async function readEmails(payload: { limit?: number; folder?: string }): Promise<{ emails: EmailSummary[] }> {
  const limit = Math.min(payload.limit ?? 5, 20)
  const folder = payload.folder ?? 'Inbox'

  const script = `
$outlook = New-Object -ComObject Outlook.Application
$ns = $outlook.GetNamespace("MAPI")
$folder = $ns.GetDefaultFolder(6)
$items = $folder.Items
$items.Sort("[ReceivedTime]", $true)
$count = 0
$results = @()
foreach ($item in $items) {
  if ($count -ge ${limit}) { break }
  $results += [PSCustomObject]@{
    Subject = $item.Subject
    From = $item.SenderName
    ReceivedAt = $item.ReceivedTime.ToString("yyyy-MM-dd HH:mm")
    Preview = $item.Body.Substring(0, [Math]::Min(150, $item.Body.Length)).Trim()
    Unread = $item.UnRead
  }
  $count++
}
$results | ConvertTo-Json -Compress
`

  const output = execSync(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, {
    encoding: 'utf-8',
    timeout: 15000,
  })

  const raw = JSON.parse(output.trim())
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

  // Validação básica
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
$mail.Subject = "${subject.replace(/"/g, "'")}"
$mail.Body = "${body.replace(/"/g, "'").replace(/\n/g, ' ')}"
$mail.Send()
Write-Output "sent"
`

  execSync(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, {
    encoding: 'utf-8',
    timeout: 15000,
  })

  return { sent: true, to, subject, dryRun: false }
}
