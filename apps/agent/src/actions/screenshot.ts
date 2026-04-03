import { execSync } from 'child_process'

export async function takeScreenshot(): Promise<{ path: string; takenAt: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `screenshot-${timestamp}.png`

  // Salva em Pictures (C:\Users\<user>\Pictures) — sem OneDrive, sem acentos, sem espaços problemáticos
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    `$out = Join-Path ([Environment]::GetFolderPath('MyPictures')) '${filename}'`,
    '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
    '$bmp.Save($out)',
    '$g.Dispose()',
    '$bmp.Dispose()',
    'Write-Output $out',
  ].join('; ')

  const result = execSync(`powershell.exe -NoProfile -NonInteractive -Command "${script}"`, {
    encoding: 'utf-8',
    timeout: 20000,
  }).trim()

  return { path: result, takenAt: new Date().toISOString() }
}
