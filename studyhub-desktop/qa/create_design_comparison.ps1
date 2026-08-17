Add-Type -AssemblyName System.Drawing

$qaDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$referencePath = Join-Path $qaDirectory "pdf-guided-reference.png"
$implementationPath = Join-Path $qaDirectory "pdf-guided-implementation.png"

$reference = [System.Drawing.Bitmap]::FromFile($referencePath)
$implementation = [System.Drawing.Bitmap]::FromFile($implementationPath)

try {
  $fullHeight = [Math]::Max($reference.Height, $implementation.Height)
  $full = New-Object System.Drawing.Bitmap ($reference.Width + $implementation.Width), $fullHeight
  $fullGraphics = [System.Drawing.Graphics]::FromImage($full)
  try {
    $fullGraphics.Clear([System.Drawing.Color]::White)
    $fullGraphics.DrawImage($reference, 0, 0, $reference.Width, $reference.Height)
    $fullGraphics.DrawImage($implementation, $reference.Width, 0, $implementation.Width, $implementation.Height)
    $full.Save((Join-Path $qaDirectory "pdf-guided-comparison.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $fullGraphics.Dispose()
    $full.Dispose()
  }

  $cropTop = 650
  $cropHeight = [Math]::Min($reference.Height, $implementation.Height) - $cropTop
  $focused = New-Object System.Drawing.Bitmap ($reference.Width + $implementation.Width), $cropHeight
  $focusedGraphics = [System.Drawing.Graphics]::FromImage($focused)
  try {
    $focusedGraphics.Clear([System.Drawing.Color]::White)
    $sourceRectangle = New-Object System.Drawing.Rectangle 0, $cropTop, $reference.Width, $cropHeight
    $leftTarget = New-Object System.Drawing.Rectangle 0, 0, $reference.Width, $cropHeight
    $rightTarget = New-Object System.Drawing.Rectangle $reference.Width, 0, $implementation.Width, $cropHeight
    $focusedGraphics.DrawImage($reference, $leftTarget, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
    $focusedGraphics.DrawImage($implementation, $rightTarget, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
    $focused.Save((Join-Path $qaDirectory "pdf-guided-controls-comparison.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $focusedGraphics.Dispose()
    $focused.Dispose()
  }
} finally {
  $reference.Dispose()
  $implementation.Dispose()
}
