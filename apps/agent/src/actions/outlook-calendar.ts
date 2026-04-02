import { execSync } from 'child_process'

export interface CalendarEvent {
  subject: string
  start: string
  end: string
  location: string
  organizer: string
}

export async function getCalendar(payload: { days?: number }): Promise<{ events: CalendarEvent[]; date: string }> {
  const days = Math.min(payload.days ?? 1, 7)
  const today = new Date().toLocaleDateString('en-US')
  const until = new Date(Date.now() + days * 86400000).toLocaleDateString('en-US')

  const script = `
$outlook = New-Object -ComObject Outlook.Application
$ns = $outlook.GetNamespace("MAPI")
$calendar = $ns.GetDefaultFolder(9)
$items = $calendar.Items
$items.IncludeRecurrences = $true
$items.Sort("[Start]")
$filter = "[Start] >= '${today}' AND [Start] <= '${until}'"
$filtered = $items.Restrict($filter)
$results = @()
foreach ($item in $filtered) {
  $results += [PSCustomObject]@{
    Subject = $item.Subject
    Start = $item.Start.ToString("yyyy-MM-dd HH:mm")
    End = $item.End.ToString("yyyy-MM-dd HH:mm")
    Location = $item.Location
    Organizer = $item.Organizer
  }
}
$results | ConvertTo-Json -Compress
`.trim()

  const output = execSync(`powershell -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, {
    encoding: 'utf-8',
    timeout: 15000,
  }).trim()

  if (!output || output === 'null') return { events: [], date: today }

  const raw = JSON.parse(output)
  const events = (Array.isArray(raw) ? raw : [raw]).map((e: Record<string, unknown>) => ({
    subject: String(e['Subject'] ?? ''),
    start: String(e['Start'] ?? ''),
    end: String(e['End'] ?? ''),
    location: String(e['Location'] ?? ''),
    organizer: String(e['Organizer'] ?? ''),
  }))

  return { events, date: today }
}
