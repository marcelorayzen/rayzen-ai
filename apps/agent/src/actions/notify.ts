import { execSync } from 'child_process'

export async function notify(payload: { title: string; message: string }): Promise<{ notified: boolean }> {
  const title = payload.title.replace(/"/g, "'").slice(0, 100)
  const message = payload.message.replace(/"/g, "'").slice(0, 250)

  const script = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$template.SelectSingleNode('//text[@id=1]').InnerText = "${title}"
$template.SelectSingleNode('//text[@id=2]').InnerText = "${message}"
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Rayzen AI").Show($toast)
`.trim()

  try {
    execSync(`powershell -NoProfile -Command "${script.replace(/\n/g, '; ')}"`, {
      encoding: 'utf-8',
      timeout: 5000,
    })
    return { notified: true }
  } catch {
    // Fallback: msg simples via balloon
    execSync(
      `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(5000, '${title}', '${message}', 'Info'); Start-Sleep -Seconds 6; $n.Dispose()"`,
      { encoding: 'utf-8', timeout: 10000 },
    )
    return { notified: true }
  }
}
