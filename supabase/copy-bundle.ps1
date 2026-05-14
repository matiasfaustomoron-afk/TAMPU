$file = Join-Path $PSScriptRoot 'migrations-bundle.sql'
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
Set-Clipboard -Value $content
Write-Host ("Bundle cargado en clipboard: " + $content.Length + " chars") -ForegroundColor Green
Write-Host "Ahora andá al SQL Editor de Supabase y hacé Ctrl+V" -ForegroundColor Yellow
Start-Sleep -Seconds 3
