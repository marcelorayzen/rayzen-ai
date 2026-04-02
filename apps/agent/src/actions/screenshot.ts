import { execSync } from 'child_process'
import { join } from 'path'
import * as os from 'os'

export async function takeScreenshot(): Promise<{ path: string; takenAt: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `screenshot-${timestamp}.png`
  const outputPath = join(os.tmpdir(), filename).replace(/\\/g, '\\\\')

  // Usa powershell.exe (Windows PowerShell) com script em arquivo temp para evitar problemas de escape
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
    `$bmp.Save('${outputPath}')`,
    '$g.Dispose()',
    '$bmp.Dispose()',
  ].join('; ')

  execSync(`powershell.exe -NoProfile -NonInteractive -Command "${script}"`, {
    encoding: 'utf-8',
    timeout: 20000,
  })

  const finalPath = outputPath.replace(/\\\\/g, '\\')

  // Abre o arquivo no visualizador padrão automaticamente
  execSync(`start "" "${finalPath}"`, { shell: 'cmd.exe', timeout: 5000 })

  return { path: finalPath, takenAt: new Date().toISOString() }
}
